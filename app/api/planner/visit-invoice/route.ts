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

    return NextResponse.json({ ok: true, visit_invoice: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not update visit invoice status." }, { status: 400 });
  }
}
