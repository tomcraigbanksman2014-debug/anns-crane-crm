import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";

const VALID_STATUSES = new Set(["Not Invoiced", "Invoiced", "Part Paid", "Paid"]);
const POSITIVE_STATUSES = new Set(["invoiced", "part paid", "paid"]);
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

function deriveParentInvoiceStatus(params: {
  rows: any[];
  requiredDates: string[];
  priceMode: string | null | undefined;
}) {
  const priceMode = lower(params.priceMode || "full_job");
  const rows = params.rows ?? [];
  const byDate = new Map<string, string>();

  for (const row of rows) {
    const visitDate = cleanDate(row?.visit_date);
    if (!visitDate) continue;
    byDate.set(visitDate, String(row?.invoice_status ?? "Not Invoiced"));
  }

  const statuses =
    priceMode === "per_day" && params.requiredDates.length > 0
      ? params.requiredDates.map((date) => byDate.get(date) ?? "Not Invoiced")
      : rows.map((row) => String(row?.invoice_status ?? "Not Invoiced"));

  const normalised = statuses.map(lower);
  const anyPositive = normalised.some((status) => POSITIVE_STATUSES.has(status));
  if (!anyPositive) return "Not Invoiced";

  const anyPartPaid = normalised.includes("part paid");
  const anyPaid = normalised.includes("paid");
  const anyNotInvoiced = normalised.some((status) => !POSITIVE_STATUSES.has(status));
  const allPaid = normalised.length > 0 && normalised.every((status) => status === "paid");
  const allPositive = normalised.length > 0 && normalised.every((status) => POSITIVE_STATUSES.has(status));

  if (allPaid) return "Paid";
  if (priceMode === "per_day" && (!allPositive || anyPartPaid || (anyPaid && !allPaid))) return "Part Paid";
  if (anyPartPaid || anyNotInvoiced) return "Part Paid";
  return "Invoiced";
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

    const isPerDayPrice = lower(transportJob.price_mode) === "per_day";

    const { data: existingRowsForJob, error: existingError } = await supabase
      .from("job_daily_visit_rates")
      .select("id, visit_date, charge, repeat_group_id, repeat_occurrence_number, weekday, notes, invoice_status")
      .eq("job_type", "transport")
      .eq("job_id", transportJobId);

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });

    const existingRows = (existingRowsForJob ?? []).filter(
      (row: any) => cleanDate(row?.visit_date) === visitDate
    );
    const targetRows = isPerDayPrice ? existingRows : existingRowsForJob ?? [];

    const payload = {
      invoice_status: invoiceStatus,
      invoice_number: invoiceNumber,
      invoice_date:
        invoiceStatus === "Not Invoiced"
          ? null
          : cleanDate(body.invoice_date) ?? new Date().toISOString().slice(0, 10),
      notes,
      updated_at: new Date().toISOString(),
    };

    let savedVisitInvoice: any = null;

    if ((targetRows ?? []).length > 0) {
      const ids = (targetRows ?? []).map((row: any) => row.id).filter(Boolean);
      const { data, error } = await supabase
        .from("job_daily_visit_rates")
        .update(payload)
        .in("id", ids)
        .select("id, job_id, visit_date, weekday, charge, invoice_status, invoice_number, invoice_date, notes")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      savedVisitInvoice = data;
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
          updated_at: payload.updated_at,
        })
        .select("id, job_id, visit_date, weekday, charge, invoice_status, invoice_number, invoice_date, notes")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      savedVisitInvoice = data;
    }

    const { data: allVisitRows, error: visitRowsError } = await supabase
      .from("job_daily_visit_rates")
      .select("id, job_id, visit_date, invoice_status")
      .eq("job_type", "transport")
      .eq("job_id", transportJobId);

    if (visitRowsError) return NextResponse.json({ error: visitRowsError.message }, { status: 400 });

    const requiredDates = dateRangeInclusive(
      transportJob.transport_date ?? visitDate,
      transportJob.delivery_date ?? transportJob.transport_date ?? visitDate
    );
    const parentInvoiceStatus = isPerDayPrice
      ? deriveParentInvoiceStatus({
          rows: allVisitRows ?? [],
          requiredDates,
          priceMode: transportJob.price_mode,
        })
      : invoiceStatus;

    const { error: parentUpdateError } = await supabase
      .from("transport_jobs")
      .update({ invoice_status: parentInvoiceStatus, updated_at: new Date().toISOString() })
      .eq("id", transportJobId);

    if (parentUpdateError) return NextResponse.json({ error: parentUpdateError.message }, { status: 400 });

    return NextResponse.json({ ok: true, visit_invoice: savedVisitInvoice, job_invoice_status: parentInvoiceStatus });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not update transport visit invoice status." }, { status: 400 });
  }
}
