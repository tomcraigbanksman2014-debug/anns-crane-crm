import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function nextInvoiceNumber(jobNumber: any) {
  const year = new Date().getFullYear();
  return `ANNS-${year}-${String(jobNumber ?? "JOB").replace(/\s+/g, "")}`;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const [{ data: job, error: jobError }, { data: lines, error: linesError }] =
      await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .eq("id", params.id)
          .single(),
        supabase
          .from("job_invoice_lines")
          .select("*")
          .eq("job_id", params.id)
          .order("created_at", { ascending: true }),
      ]);

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }

    if (linesError) {
      return NextResponse.json({ error: linesError.message }, { status: 400 });
    }

    return NextResponse.json({
      job,
      lines: lines ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load invoice." },
      { status: 400 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const vatRate = num(body.vat_rate || 20);

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, job_number")
      .eq("id", params.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const normalisedLines = lines
      .map((line: any) => {
        const qty = num(line.qty || 0);
        const unit_price = num(line.unit_price || 0);
        return {
          description: String(line.description ?? "").trim(),
          qty,
          unit_price,
          line_total: money(qty * unit_price),
        };
      })
      .filter((line: any) => line.description);

    const subtotal = money(
      normalisedLines.reduce((sum: number, line: any) => sum + num(line.line_total), 0)
    );
    const vat = money(subtotal * (vatRate / 100));
    const total = money(subtotal + vat);

    const invoice_number = nextInvoiceNumber((job as any).job_number);
    const invoice_created_at = new Date().toISOString();

    const due = new Date();
    due.setDate(due.getDate() + 30);
    const invoice_due_date = due.toISOString().slice(0, 10);

    const { error: deleteError } = await supabase
      .from("job_invoice_lines")
      .delete()
      .eq("job_id", params.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    if (normalisedLines.length > 0) {
      const { error: linesError } = await supabase
        .from("job_invoice_lines")
        .insert(
          normalisedLines.map((line: any) => ({
            job_id: params.id,
            ...line,
          }))
        );

      if (linesError) {
        return NextResponse.json({ error: linesError.message }, { status: 400 });
      }
    }

    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        invoice_number,
        invoice_created_at,
        invoice_due_date,
        invoice_notes: String(body.invoice_notes ?? "").trim() || null,
        invoice_subtotal: subtotal,
        invoice_vat: vat,
        invoice_total: total,
        total_invoice: total,
        invoice_status: "Not Invoiced",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "generate_invoice",
      entity_type: "job",
      entity_id: params.id,
      meta: {
        invoice_number,
        subtotal,
        vat,
        total,
      },
    });

    return NextResponse.json({
      ok: true,
      invoice_number,
      subtotal,
      vat,
      total,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not generate invoice." },
      { status: 400 }
    );
  }
}
