import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";

const VALID_STATUSES = new Set(["Not Invoiced", "Invoiced", "Part Paid", "Paid"]);

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

function aggregateVisitInvoiceStatus(rows: any[]) {
  const statuses = rows.map((row) => normaliseInvoiceStatus(row?.invoice_status));
  const billableStatuses = statuses.filter((status) => status !== "Not Invoiced");

  if (billableStatuses.length === 0) return "Not Invoiced";
  if (billableStatuses.length === statuses.length && billableStatuses.every((status) => status === "Paid")) return "Paid";
  if (billableStatuses.some((status) => status === "Part Paid")) return "Part Paid";
  return "Invoiced";
}

async function syncCraneJobInvoiceStatus(supabase: any, jobId: string, requestedStatus: string) {
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, price_mode, invoice_status")
    .eq("id", jobId)
    .single();

  if (jobError) throw new Error(jobError.message);

  let nextJobStatus = normaliseInvoiceStatus(requestedStatus);

  // Per-day priced jobs can have mixed visit statuses. Recalculate the parent
  // job status from all visit rows. Full-job priced jobs should follow the
  // clicked planner status directly so the job page and planner stay aligned.
  if (lower(job?.price_mode) === "per_day") {
    const { data: visitRows, error: visitError } = await supabase
      .from("job_visit_invoices")
      .select("invoice_status")
      .eq("job_id", jobId);

    if (visitError) throw new Error(visitError.message);
    nextJobStatus = aggregateVisitInvoiceStatus(visitRows ?? []);
  }

  const { error: updateError } = await supabase
    .from("jobs")
    .update({ invoice_status: nextJobStatus, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (updateError) throw new Error(updateError.message);

  return nextJobStatus;
}

export async function POST(req: Request) {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

    const jobId = clean(body.job_id);
    const visitDate = cleanDate(body.visit_date);
    const invoiceStatus = normaliseInvoiceStatus(body.invoice_status ?? "Invoiced");
    const invoiceNumber = clean(body.invoice_number);
    const notes = clean(body.notes);

    if (!jobId) return NextResponse.json({ error: "Job is required." }, { status: 400 });
    if (!visitDate) return NextResponse.json({ error: "Visit date is required." }, { status: 400 });
    if (!VALID_STATUSES.has(invoiceStatus)) {
      return NextResponse.json({ error: "Invalid visit invoice status." }, { status: 400 });
    }

    const payload = {
      job_id: jobId,
      visit_date: visitDate,
      invoice_status: invoiceStatus,
      invoice_number: invoiceStatus === "Not Invoiced" ? null : invoiceNumber,
      invoice_date:
        invoiceStatus === "Not Invoiced"
          ? null
          : cleanDate(body.invoice_date) ?? new Date().toISOString().slice(0, 10),
      notes,
      updated_at: new Date().toISOString(),
      created_by: user?.id ?? null,
    };

    const { data, error } = await supabase
      .from("job_visit_invoices")
      .upsert(payload, { onConflict: "job_id,visit_date" })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const jobInvoiceStatus = await syncCraneJobInvoiceStatus(supabase, jobId, invoiceStatus);

    return NextResponse.json({ ok: true, visit_invoice: data, job_invoice_status: jobInvoiceStatus });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not update visit invoice status." }, { status: 400 });
  }
}
