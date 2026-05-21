import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";

const VALID_STATUSES = new Set(["Not Invoiced", "Invoiced", "Part Paid", "Paid"]);
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

function normaliseInvoiceStatus(value: unknown) {
  const raw = lower(value);
  if (raw === "paid") return "Paid";
  if (raw === "part paid" || raw === "part_paid") return "Part Paid";
  if (raw === "invoiced") return "Invoiced";
  return "Not Invoiced";
}

function weekdayFromDate(dateOnly: string) {
  const parsed = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return WEEKDAYS[parsed.getDay()] ?? "";
}

function aggregateVisitInvoiceStatus(rows: any[]) {
  const statuses = rows.map((row) => normaliseInvoiceStatus(row?.invoice_status));
  const billableStatuses = statuses.filter((status) => status !== "Not Invoiced");

  if (billableStatuses.length === 0) return "Not Invoiced";
  if (billableStatuses.length === statuses.length && billableStatuses.every((status) => status === "Paid")) return "Paid";
  if (billableStatuses.some((status) => status === "Part Paid")) return "Part Paid";
  return "Invoiced";
}

async function syncTransportJobInvoiceStatus(supabase: any, transportJobId: string, requestedStatus: string) {
  const { data: job, error: jobError } = await supabase
    .from("transport_jobs")
    .select("id, price_mode, invoice_status")
    .eq("id", transportJobId)
    .single();

  if (jobError) throw new Error(jobError.message);

  let nextJobStatus = normaliseInvoiceStatus(requestedStatus);

  // Per-day priced jobs can have mixed visit statuses. Recalculate the parent
  // job status from all transport visit rows. Full-job priced jobs should follow
  // the clicked planner status directly so the job page and planner stay aligned.
  if (lower(job?.price_mode) === "per_day") {
    const { data: visitRows, error: visitError } = await supabase
      .from("job_daily_visit_rates")
      .select("invoice_status")
      .eq("job_type", "transport")
      .eq("job_id", transportJobId);

    if (visitError) throw new Error(visitError.message);
    nextJobStatus = aggregateVisitInvoiceStatus(visitRows ?? []);
  }

  const { error: updateError } = await supabase
    .from("transport_jobs")
    .update({ invoice_status: nextJobStatus, updated_at: new Date().toISOString() })
    .eq("id", transportJobId);

  if (updateError) throw new Error(updateError.message);

  return nextJobStatus;
}

export async function POST(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

    const transportJobId = clean(body.transport_job_id ?? body.job_id);
    const visitDate = cleanDate(body.visit_date);
    const invoiceStatus = normaliseInvoiceStatus(body.invoice_status ?? "Invoiced");
    const invoiceNumber = clean(body.invoice_number);
    const notes = clean(body.notes);

    if (!transportJobId) return NextResponse.json({ error: "Transport job is required." }, { status: 400 });
    if (!visitDate) return NextResponse.json({ error: "Visit date is required." }, { status: 400 });
    if (!VALID_STATUSES.has(invoiceStatus)) {
      return NextResponse.json({ error: "Invalid visit invoice status." }, { status: 400 });
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("job_daily_visit_rates")
      .select("id, charge, repeat_group_id, repeat_occurrence_number, weekday, notes")
      .eq("job_type", "transport")
      .eq("job_id", transportJobId)
      .eq("visit_date", visitDate);

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });

    const payload = {
      invoice_status: invoiceStatus,
      invoice_number: invoiceStatus === "Not Invoiced" ? null : invoiceNumber,
      invoice_date:
        invoiceStatus === "Not Invoiced"
          ? null
          : cleanDate(body.invoice_date) ?? new Date().toISOString().slice(0, 10),
      notes,
      updated_at: new Date().toISOString(),
    };

    let visitInvoice: any = null;

    if ((existingRows ?? []).length > 0) {
      const ids = (existingRows ?? []).map((row: any) => row.id).filter(Boolean);
      const { data, error } = await supabase
        .from("job_daily_visit_rates")
        .update(payload)
        .in("id", ids)
        .select("id, job_id, visit_date, weekday, charge, invoice_status, invoice_number, invoice_date, notes")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      visitInvoice = data;
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
      visitInvoice = data;
    }

    const jobInvoiceStatus = await syncTransportJobInvoiceStatus(supabase, transportJobId, invoiceStatus);

    return NextResponse.json({ ok: true, visit_invoice: visitInvoice, job_invoice_status: jobInvoiceStatus });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not update transport visit invoice status." }, { status: 400 });
  }
}
