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

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await req.json().catch(() => ({}));

    const payload = {
      job_id: clean(body.job_id),
      equipment_id: clean(body.equipment_id),
      operator_id: clean(body.operator_id),
      source_type: clean(body.source_type) ?? "owned",
      supplier_id: clean(body.supplier_id),
      purchase_order_id: clean(body.purchase_order_id),
      item_name: clean(body.item_name),
      start_date: clean(body.start_date),
      end_date: clean(body.end_date),
      start_time: clean(body.start_time),
      end_time: clean(body.end_time),
      agreed_cost: num(body.agreed_cost),
      supplier_reference: clean(body.supplier_reference),
      notes: clean(body.notes),
      updated_at: new Date().toISOString(),
    };

    if (!payload.job_id) {
      return NextResponse.json({ error: "Job id is required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("job_equipment")
      .insert(payload)
      .select(`
        *,
        equipment:equipment_id (
          id,
          name,
          asset_number
        ),
        operators:operator_id (
          id,
          full_name
        ),
        suppliers:supplier_id (
          id,
          company_name
        ),
        purchase_orders:purchase_order_id (
          id,
          po_number,
          status
        )
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await supabase
      .from("jobs")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.job_id);

    if (user) {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "create_job_equipment",
        entity_type: "job_equipment",
        entity_id: data.id,
        meta: payload,
      });
    }

    return NextResponse.json({ allocation: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not create job equipment." },
      { status: 400 }
    );
  }
}
