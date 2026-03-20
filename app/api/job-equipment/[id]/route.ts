import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function clean(value: unknown) {
  const v = String(value ?? "").trim();
  return v.length ? v : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(
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

    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const existingRes = await supabase
      .from("job_equipment")
      .select("*")
      .eq("id", params.id)
      .single();

    if (existingRes.error || !existingRes.data) {
      return NextResponse.json({ error: "Allocation not found." }, { status: 404 });
    }

    const existing = existingRes.data;

    const agreedCost =
      body.agreed_cost !== undefined
        ? numberOrNull(body.agreed_cost)
        : existing.agreed_cost ?? null;

    const agreedSellRate =
      body.agreed_sell_rate !== undefined
        ? numberOrNull(body.agreed_sell_rate)
        : existing.agreed_sell_rate ?? agreedCost ?? null;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.job_id !== undefined) updates.job_id = clean(body.job_id);
    if (body.equipment_type !== undefined || body.asset_type !== undefined) {
      const nextType = clean(body.equipment_type ?? body.asset_type);
      updates.equipment_type = nextType;
      updates.asset_type = nextType;
    }
    if (body.crane_id !== undefined) updates.crane_id = clean(body.crane_id);
    if (body.vehicle_id !== undefined) updates.vehicle_id = clean(body.vehicle_id);
    if (body.equipment_id !== undefined) updates.equipment_id = clean(body.equipment_id);
    if (body.operator_id !== undefined) updates.operator_id = clean(body.operator_id);
    if (body.supplier_id !== undefined) updates.supplier_id = clean(body.supplier_id);
    if (body.purchase_order_id !== undefined) updates.purchase_order_id = clean(body.purchase_order_id);
    if (body.date !== undefined) updates.date = clean(body.date);
    if (body.start_date !== undefined) updates.start_date = clean(body.start_date);
    if (body.end_date !== undefined) updates.end_date = clean(body.end_date);
    if (body.start_time !== undefined) updates.start_time = clean(body.start_time);
    if (body.end_time !== undefined) updates.end_time = clean(body.end_time);
    if (body.quantity !== undefined) updates.quantity = numberOrNull(body.quantity);
    if (body.notes !== undefined) updates.notes = clean(body.notes);
    if (body.item_name !== undefined) updates.item_name = clean(body.item_name);
    if (body.source_type !== undefined) updates.source_type = clean(body.source_type);
    if (body.supplier_reference !== undefined) updates.supplier_reference = clean(body.supplier_reference);

    if (body.agreed_cost !== undefined) updates.agreed_cost = agreedCost;
    if (body.agreed_sell_rate !== undefined || body.agreed_cost !== undefined) {
      updates.agreed_sell_rate = agreedSellRate;
    }
    if (body.supplier_cost !== undefined) updates.supplier_cost = numberOrNull(body.supplier_cost);

    const { data, error } = await supabase
      .from("job_equipment")
      .update(updates)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
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
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { error } = await supabase
      .from("job_equipment")
      .delete()
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
