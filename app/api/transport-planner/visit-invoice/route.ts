import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";

const VALID_STATUSES = new Set(["Not Invoiced", "Invoiced", "Part Paid", "Paid"]);
const POSITIVE_STATUSES = new Set(["invoiced", "part paid", "paid"]);
const LOCKED_PARENT_STATUSES = new Set(["part paid", "paid"]);
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function cleanDate(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const dateOnly = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

function lower(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function weekdayFromDate(dateOnly: string) {
  const parsed = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return WEEKDAYS[parsed.getDay()] ?? "";
}

function parseDateOnly(value: unknown) {
  const dateOnly = cleanDate(value);
  if (!dateOnly) return null;
  const parsed = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateRangeInclusive(startDate: unknown, endDate: unknown) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate ?? startDate);
  if (!start || !end) return [];

  const from = end < start ? end : start;
  const to = end < start ? start : end;
  const dates: string[] = [];
  const cursor = new Date(from);

  while (cursor <= to) {
    dates.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function latestTimestamp(row: any) {
  const raw = row?.updated_at ?? row?.invoice_date ?? row?.created_at ?? null;
  const parsed = raw ? new Date(String(raw)).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestRowsByDate(rows: any[]) {
  const byDate = new Map<string, any>();
  for (const row of rows ?? []) {
    const visitDate = cleanDate(row?.visit_date);
    if (!visitDate) continue;
    const existing = byDate.get(visitDate);
    if (!existing || latestTimestamp(row) >= latestTimestamp(existing)) {
      byDate.set(visitDate, row);
    }
  }
  return byDate;
}

function deriveParentInvoiceStatus(params: {
  rows: any[];
  requiredDates: string[];
  fallbackVisitDate: string;
}) {
  const byDate = latestRowsByDate(params.rows ?? []);
  const requiredDates = params.requiredDates.length > 0 ? params.requiredDates : [params.fallbackVisitDate];
  const statuses = requiredDates.map((date) => String(byDate.get(date)?.invoice_status ?? "Not Invoiced"));
  const normalised = statuses.map(lower);

  if (normalised.length === 0) return "Not Invoiced";
  const allPaid = normalised.every((status) => status === "paid");
  const allPositive = normalised.every((status) => POSITIVE_STATUSES.has(status));

  if (allPaid) return "Paid";
  if (allPositive) {
    return normalised.some((status) => status === "part paid" || status === "paid") ? "Part Paid" : "Invoiced";
  }

  // Visit-level planner invoicing: one invoiced visit must not mark the whole multi-day job as invoiced.
  // Keep the parent job visible to finance until every planned visit date is invoiced.
  return "Not Invoiced";
}

async function materialiseParentInvoiceIntoVisits(params: {
  supabase: any;
  transportJobId: string;
  requiredDates: string[];
  existingRows: any[];
  parentStatus: string;
  activeVisitDate: string;
}) {
  const parentStatus = String(params.parentStatus ?? "").trim();
  if (lower(parentStatus) !== "invoiced") return params.existingRows ?? [];

  const requiredDates = params.requiredDates.length > 0 ? params.requiredDates : [params.activeVisitDate];
  const byDate = latestRowsByDate(params.existingRows ?? []);
  const missingDates = requiredDates.filter((date) => !byDate.has(date));

  if (missingDates.length === 0) return params.existingRows ?? [];

  const rowsToInsert = missingDates.map((date) => ({
    job_type: "transport",
    job_id: params.transportJobId,
    visit_date: date,
    weekday: weekdayFromDate(date),
    charge: 0,
    invoice_status: "Invoiced",
    invoice_number: null,
    invoice_date: null,
    notes: "Created automatically from the main transport job invoice status before a visit-level planner change, so other visit days stay marked correctly.",
  }));

  const { data, error } = await params.supabase
    .from("job_daily_visit_rates")
    .insert(rowsToInsert)
    .select("id, job_id, visit_date, weekday, charge, invoice_status, invoice_number, invoice_date, notes, updated_at");

  if (error) throw new Error(error.message);
  return [...(params.existingRows ?? []), ...((data ?? []) as any[])];
}

export async function POST(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

    const transportJobId = clean(body.transport_job_id ?? body.job_id);
    const visitDate = cleanDate(body.visit_date);
    const invoiceStatus = clean(body.invoice_status) ?? "Invoiced";
    const invoiceNumber = clean(body.invoice_number);
    const notes = clean(body.notes);

    if (!transportJobId) return NextResponse.json({ error: "Transport job is required." }, { status: 400 });
    if (!visitDate) return NextResponse.json({ error: "Visit date is required." }, { status: 400 });
    if (!VALID_STATUSES.has(invoiceStatus)) {
      return NextResponse.json({ error: "Invalid visit invoice status." }, { status: 400 });
    }

    const { data: transportJob, error: jobError } = await supabase
      .from("transport_jobs")
      .select("id, invoice_status, price_mode, transport_date, delivery_date")
      .eq("id", transportJobId)
      .maybeSingle();

    if (jobError) return NextResponse.json({ error: jobError.message }, { status: 400 });
    if (!transportJob) return NextResponse.json({ error: "Transport job not found." }, { status: 404 });

    const currentParentStatus = lower(transportJob.invoice_status ?? "Not Invoiced");
    if (LOCKED_PARENT_STATUSES.has(currentParentStatus)) {
      return NextResponse.json(
        { error: "This transport job is Part Paid or Paid. Change it from the job/invoices page, not the planner." },
        { status: 409 }
      );
    }

    const requiredDates = dateRangeInclusive(
      transportJob.transport_date ?? visitDate,
      transportJob.delivery_date ?? transportJob.transport_date ?? visitDate
    );

    const { data: initialVisitRows, error: initialRowsError } = await supabase
      .from("job_daily_visit_rates")
      .select("id, job_id, visit_date, weekday, charge, invoice_status, invoice_number, invoice_date, notes, updated_at")
      .eq("job_type", "transport")
      .eq("job_id", transportJobId);

    if (initialRowsError) return NextResponse.json({ error: initialRowsError.message }, { status: 400 });

    // Critical legacy safeguard:
    // Old planner versions sometimes represented a multi-day job as invoiced only by the parent job status.
    // If the user now undoes one visit, first create explicit invoiced rows for the other visit days so they do not all flip to Not Invoiced.
    if (invoiceStatus === "Not Invoiced") {
      await materialiseParentInvoiceIntoVisits({
        supabase,
        transportJobId,
        requiredDates,
        existingRows: initialVisitRows ?? [],
        parentStatus: transportJob.invoice_status ?? "",
        activeVisitDate: visitDate,
      });
    }

    const payload = {
      invoice_status: invoiceStatus,
      invoice_number: invoiceNumber,
      invoice_date:
        invoiceStatus === "Not Invoiced"
          ? null
          : cleanDate(body.invoice_date) ?? new Date().toISOString().slice(0, 10),
      notes,
    };

    const { data: targetRows, error: targetRowsError } = await supabase
      .from("job_daily_visit_rates")
      .select("id, job_id, visit_date, weekday, charge, invoice_status, invoice_number, invoice_date, notes, updated_at")
      .eq("job_type", "transport")
      .eq("job_id", transportJobId)
      .eq("visit_date", visitDate);

    if (targetRowsError) return NextResponse.json({ error: targetRowsError.message }, { status: 400 });

    let savedVisitInvoice: any = null;

    if ((targetRows ?? []).length > 0) {
      const ids = (targetRows ?? []).map((row: any) => row.id).filter(Boolean);
      const { data, error } = await supabase
        .from("job_daily_visit_rates")
        .update(payload)
        .in("id", ids)
        .select("id, job_id, visit_date, weekday, charge, invoice_status, invoice_number, invoice_date, notes, updated_at");

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      savedVisitInvoice = Array.isArray(data) ? data[0] ?? null : data;
    } else {
      const { data, error } = await supabase
        .from("job_daily_visit_rates")
        .insert({
          job_type: "transport",
          job_id: transportJobId,
          visit_date: visitDate,
          weekday: weekdayFromDate(visitDate),
          charge: 0,
          invoice_status: payload.invoice_status,
          invoice_number: payload.invoice_number,
          invoice_date: payload.invoice_date,
          notes: payload.notes,
        })
        .select("id, job_id, visit_date, weekday, charge, invoice_status, invoice_number, invoice_date, notes, updated_at")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      savedVisitInvoice = data;
    }

    const { data: allVisitRows, error: visitRowsError } = await supabase
      .from("job_daily_visit_rates")
      .select("id, job_id, visit_date, invoice_status, updated_at")
      .eq("job_type", "transport")
      .eq("job_id", transportJobId);

    if (visitRowsError) return NextResponse.json({ error: visitRowsError.message }, { status: 400 });

    const parentInvoiceStatus = deriveParentInvoiceStatus({
      rows: allVisitRows ?? [],
      requiredDates,
      fallbackVisitDate: visitDate,
    });

    const { error: parentUpdateError } = await supabase
      .from("transport_jobs")
      .update({ invoice_status: parentInvoiceStatus })
      .eq("id", transportJobId);

    if (parentUpdateError) return NextResponse.json({ error: parentUpdateError.message }, { status: 400 });

    return NextResponse.json({ ok: true, visit_invoice: savedVisitInvoice, job_invoice_status: parentInvoiceStatus });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not update transport visit invoice status." }, { status: 400 });
  }
}
