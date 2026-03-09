import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

type Payload = {
  client_id?: string | null;
  status?: "Draft" | "Sent" | "Accepted" | "Rejected";
  quote_date?: string | null;
  valid_until?: string | null;
  amount?: number | string | null;
  subject?: string | null;
  notes?: string | null;
};

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function normDate(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Payload;

    const client_id = norm(body.client_id);
    const status = String(body.status ?? "Draft") as
      | "Draft"
      | "Sent"
      | "Accepted"
      | "Rejected";
    const quote_date = normDate(body.quote_date) ?? new Date().toISOString().slice(0, 10);
    const valid_until = normDate(body.valid_until);
    const subject = norm(body.subject);
    const notes = norm(body.notes);

    const amountRaw = body.amount;
    const amountNum =
      amountRaw === null || amountRaw === undefined || String(amountRaw).trim() === ""
        ? null
        : Number(amountRaw);

    if (!client_id) {
      return NextResponse.json({ error: "Customer is required" }, { status: 400 });
    }

    if (!["Draft", "Sent", "Accepted", "Rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid quote status" }, { status: 400 });
    }

    if (amountNum !== null && !Number.isFinite(amountNum)) {
      return NextResponse.json({ error: "Amount must be a valid number" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("quotes")
      .insert([
        {
          client_id,
          status,
          quote_date,
          valid_until,
          amount: amountNum,
          subject,
          notes,
          created_by: auth.user.id,
        },
      ])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_username: auth.user.email ? auth.user.email.split("@")[0] : null,
      action: "create",
      entity_type: "quote",
      entity_id: data?.id ?? null,
      meta: {
        client_id,
        status,
        amount: amountNum,
        subject,
      },
    });

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Bad request" },
      { status: 400 }
    );
  }
}
