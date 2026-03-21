import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

function makeInvoiceNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  const ss = `${d.getSeconds()}`.padStart(2, "0");
  return `INV-${y}${m}${day}-${hh}${mm}${ss}`;
}

function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const jobId = String(body?.job_id ?? "").trim();

    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: job, error: readError } = await supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        status,
        invoice_status,
        invoice_number,
        invoice_created_at,
        invoice_due_date,
        invoice_notes,
        invoice_subtotal,
        invoice_vat,
        invoice_total,
        total_invoice,
        cross_hire_cost_total
      `)
      .eq("id", jobId)
      .single();

    if (readError || !job) {
      return NextResponse.json(
        { error: readError?.message || "Job not found." },
        { status: 404 }
      );
    }

    const subtotal = Number(job.invoice_subtotal ?? job.cross_hire_cost_total ?? 0) || 0;
    const vat = Number(job.invoice_vat ?? subtotal * 0.2) || 0;
    const total = Number(job.invoice_total ?? job.total_invoice ?? subtotal + vat) || 0;

    const invoiceNumber = job.invoice_number || makeInvoiceNumber();
    const createdAt = job.invoice_created_at || new Date().toISOString();
    const dueDate = job.invoice_due_date || addDaysIso(30);

    const payload = {
      invoice_status: "Not Invoiced",
      invoice_number: invoiceNumber,
      invoice_created_at: createdAt,
      invoice_due_date: dueDate,
      invoice_subtotal: subtotal,
      invoice_vat: vat,
      invoice_total: total,
      total_invoice: total,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("jobs").update(payload).eq("id", jobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "job_invoice_generated",
      entity_type: "job",
      entity_id: jobId,
      meta: {
        job_number: job.job_number ?? null,
        invoice_number: invoiceNumber,
        subtotal,
        vat,
        total,
        source: "legacy_create_invoice_button",
      },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
