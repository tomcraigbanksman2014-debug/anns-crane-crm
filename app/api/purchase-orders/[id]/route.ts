import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await req.json().catch(() => ({}));

    const payload = {
      supplier_id: clean(body.supplier_id),
      job_id: clean(body.job_id),
      status: clean(body.status) ?? "draft",
      order_date: clean(body.order_date),
      required_date: clean(body.required_date),
      supplier_reference: clean(body.supplier_reference),
      total_cost: num(body.total_cost),
      notes: clean(body.notes),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("purchase_orders")
      .update(payload)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (user) {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "update_purchase_order",
        entity_type: "purchase_order",
        entity_id: params.id,
        meta: payload,
      });
    }

    return NextResponse.json({ purchase_order: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update purchase order." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("purchase_orders")
      .delete()
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (user) {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "delete_purchase_order",
        entity_type: "purchase_order",
        entity_id: params.id,
        meta: null,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not delete purchase order." },
      { status: 400 }
    );
  }
}
