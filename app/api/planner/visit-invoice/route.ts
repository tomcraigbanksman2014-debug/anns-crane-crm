import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";

const VALID_STATUSES = new Set(["Not Invoiced", "Invoiced", "Part Paid", "Paid"]);
const POSITIVE_STATUSES = new Set(["invoiced", "part paid", "paid"]);

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

function parseDateOnly(value: unknown) {
  const dateOnly = cleanDate(value);
  if (!dateOnly) return null;
  const parsed = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function dateRangeInclusive(startDate: unknown, endDate: unknown, excludeWeekends: boolean) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate ?? startDate);
  if (!start || !end) return [];

  const from = end < start ? end : start;
  const to = end < start ? start : end;
  const dates: string[] = [];
  const cursor = new Date(from);

  while (cursor <= to) {
    if (!excludeWeekends || !isWeekend(cursor)) dates.push(isoDate(cursor));
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
    const { supabase, user, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

    const jobId = clean(body.job_id);
    const visitDate = cleanDate(body.visit_date);
    const invoiceStatus = clean(body.invoice_status) ?? "Invoiced";
    const invoiceNumber = clean(body.invoice_number);
    const notes = clean(body.notes);

    if (!jobId) return NextResponse.json({ error: "Job is required." }, { status: 400 });
    if (!visitDate) return NextResponse.json({ error: "Visit date is required." }, { status: 400 });
    if (!VALID_STATUSES.has(invoiceStatus)) {
      return NextResponse.json({ error: "Invalid visit invoice status." }, { status: 400 });
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, invoice_status, price_mode, job_date, start_date, end_date, exclude_weekends")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) return NextResponse.json({ error: jobError.message }, { status: 400 });
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

    const payload = {
      job_id: jobId,
      visit_date: visitDate,
      invoice_status: invoiceStatus,
      invoice_number: invoiceNumber,
      invoice_date: invoiceStatus === "Not Invoiced" ? null : cleanDate(body.invoice_date) ?? new Date().toISOString().slice(0, 10),
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

    const { data: allVisitRows, error: visitRowsError } = await supabase
      .from("job_visit_invoices")
      .select("id, job_id, visit_date, invoice_status")
      .eq("job_id", jobId);

    if (visitRowsError) return NextResponse.json({ error: visitRowsError.message }, { status: 400 });

    const requiredDates = dateRangeInclusive(
      job.start_date ?? job.job_date ?? visitDate,
      job.end_date ?? job.start_date ?? job.job_date ?? visitDate,
      Boolean(job.exclude_weekends)
    );
    const parentInvoiceStatus = deriveParentInvoiceStatus({
      rows: allVisitRows ?? [],
      requiredDates,
      priceMode: job.price_mode,
    });

    const { error: parentUpdateError } = await supabase
      .from("jobs")
      .update({ invoice_status: parentInvoiceStatus, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    if (parentUpdateError) return NextResponse.json({ error: parentUpdateError.message }, { status: 400 });

    return NextResponse.json({ ok: true, visit_invoice: data, job_invoice_status: parentInvoiceStatus });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not update visit invoice status." }, { status: 400 });
  }
}
