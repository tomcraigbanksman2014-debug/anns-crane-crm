import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function generatePONumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const stamp = `${d.getHours()}${d.getMinutes()}${d.getSeconds()}`;
  return `PO-${y}${m}${day}-${stamp}`;
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("purchase_orders")
      .select(`
        *,
        suppliers:supplier_id (
          id,
          company_name
        ),
        jobs:job_id (
          id,
          job_number,
          site_name
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ purchase_orders: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load purchase orders." },
      { status: 400 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await req.json().catch(() => ({}));

    const payload = {
      po_number: clean(body.po_number) ?? generatePONumber(),
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
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (user) {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "create_purchase_order",
        entity_type: "purchase_order",
        entity_id: data.id,
        meta: payload,
      });
    }

    return NextResponse.json({ purchase_order: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not create purchase order." },
      { status: 400 }
    );
  }
}
