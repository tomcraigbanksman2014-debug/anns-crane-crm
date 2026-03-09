import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

type Payload = {
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

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Payload;

    const status = body.status
      ? (String(body.status) as "Draft" | "Sent" | "Accepted" | "Rejected")
      : undefined;

    if (status && !["Draft", "Sent", "Accepted", "Rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid quote status" }, { status: 400 });
    }

    const amountRaw = body.amount;
    const amountNum =
      amountRaw === undefined || amountRaw === null || String(amountRaw).trim() === ""
        ? null
        : Number(amountRaw);

    if (amountRaw !== undefined && amountNum !== null && !Number.isFinite(amountNum)) {
      return NextResponse.json({ error: "Amount must be a valid number" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};

    if (status !== undefined) updateData.status = status;
    if (body.quote_date !== undefined) updateData.quote_date = norm(body.quote_date);
    if (body.valid_until !== undefined) updateData.valid_until = norm(body.valid_until);
    if (body.subject !== undefined) updateData.subject = norm(body.subject);
    if (body.notes !== undefined) updateData.notes = norm(body.notes);
    if (body.amount !== undefined) updateData.amount = amountNum;

    const { error } = await supabase
      .from("quotes")
      .update(updateData)
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_username: auth.user.email ? auth.user.email.split("@")[0] : null,
      action: "update",
      entity_type: "quote",
      entity_id: params.id,
      meta: updateData,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Bad request" },
      { status: 400 }
    );
  }
}
