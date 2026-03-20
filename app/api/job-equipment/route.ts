import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function clean(value: unknown) {
  const v = String(value ?? "").trim();
  return v.length ? v : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
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

    const jobId = clean(body.job_id);
    const craneId = clean(body.crane_id);
    const vehicleId = clean(body.vehicle_id);
    const equipmentId = clean(body.equipment_id);
    const operatorId = clean(body.operator_id);
    const supplierId = clean(body.supplier_id);
    const purchaseOrderId = clean(body.purchase_order_id);

    const startDate = clean(body.start_date);
    const endDate = clean(body.end_date);
    const startTime = clean(body.start_time);
    const endTime = clean(body.end_time);
    const notes = clean(body.notes);
    const itemName = clean(body.item_name);
    const sourceType = clean(body.source_type);
    const supplierReference = clean(body.supplier_reference);

    const agreedCost = numberOrNull(body.agreed_cost);
    const agreedSellRate =
      numberOrNull(body.agreed_sell_rate) ??
      agreedCost ??
      null;
    const supplierCost = numberOrNull(body.supplier_cost);

    if (!jobId) {
      return NextResponse.json({ error: "job_id is required." }, { status: 400 });
    }

    if (!craneId && !vehicleId && !equipmentId && !itemName) {
      return NextResponse.json(
        { error: "Please select a crane, vehicle, equipment item or enter an item name." },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = {
      job_id: jobId,
      crane_id: craneId,
      vehicle_id: vehicleId,
      equipment_id: equipmentId,
      operator_id: operatorId,
      supplier_id: supplierId,
      purchase_order_id: purchaseOrderId,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      agreed_cost: agreedCost,
      agreed_sell_rate: agreedSellRate,
      supplier_cost: supplierCost,
      supplier_reference: supplierReference,
      source_type: sourceType,
      item_name: itemName,
      notes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("job_equipment")
      .insert(payload)
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
