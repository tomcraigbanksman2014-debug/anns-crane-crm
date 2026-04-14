import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { geocodeAddress } from "../../../../lib/geocode";

function clean(value: any) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function parseDateTime(dateValue: string | null, timeValue: string | null) {
  if (!dateValue || !timeValue) return null;
  const iso = `${dateValue}T${timeValue}:00`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
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

    const body = await req.json().catch(() => ({}));

    const transportJobId = clean(body.transport_job_id);

    if (!transportJobId) {
      return NextResponse.json(
        { error: "Transport job id is required." },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if ("vehicle_id" in body) {
      updatePayload.vehicle_id = clean(body.vehicle_id);
    }

    if ("operator_id" in body) {
      updatePayload.operator_id = clean(body.operator_id);
    }

    if ("transport_date" in body) {
      updatePayload.transport_date = clean(body.transport_date);
    }

    if ("collection_time" in body) {
      updatePayload.collection_time = clean(body.collection_time);
    }

    if ("delivery_date" in body) {
      updatePayload.delivery_date = clean(body.delivery_date);
    }

    if ("delivery_time" in body) {
      updatePayload.delivery_time = clean(body.delivery_time);
    }

    if ("status" in body) {
      updatePayload.status = clean(body.status) ?? "planned";
    }

    if ("collection_address" in body) {
      updatePayload.collection_address = clean(body.collection_address);
      const pickupCoords = updatePayload.collection_address
        ? await geocodeAddress(updatePayload.collection_address)
        : null;
      updatePayload.collection_lat = pickupCoords?.lat ?? null;
      updatePayload.collection_lng = pickupCoords?.lng ?? null;
    }

    if ("delivery_address" in body) {
      updatePayload.delivery_address = clean(body.delivery_address);
      const deliveryCoords = updatePayload.delivery_address
        ? await geocodeAddress(updatePayload.delivery_address)
        : null;
      updatePayload.delivery_lat = deliveryCoords?.lat ?? null;
      updatePayload.delivery_lng = deliveryCoords?.lng ?? null;
    }

    if ("load_description" in body) {
      updatePayload.load_description = clean(body.load_description);
    }

    if ("notes" in body) {
      updatePayload.notes = clean(body.notes);
    }

    const effectiveTransportDate =
      updatePayload.transport_date ?? clean(body.transport_date);
    const effectiveCollectionTime =
      updatePayload.collection_time ?? clean(body.collection_time);
    const effectiveDeliveryDate =
      updatePayload.delivery_date ??
      clean(body.delivery_date) ??
      effectiveTransportDate;
    const effectiveDeliveryTime =
      updatePayload.delivery_time ?? clean(body.delivery_time);

    const collectionDateTime = parseDateTime(
      effectiveTransportDate,
      effectiveCollectionTime
    );
    const deliveryDateTime = parseDateTime(
      effectiveDeliveryDate,
      effectiveDeliveryTime
    );

    if (
      effectiveTransportDate &&
      effectiveCollectionTime &&
      effectiveDeliveryDate &&
      effectiveDeliveryTime &&
      collectionDateTime &&
      deliveryDateTime &&
      collectionDateTime > deliveryDateTime
    ) {
      return NextResponse.json(
        { error: "Delivery date/time cannot be earlier than collection date/time." },
        { status: 400 }
      );
    }

    if (
      "delivery_date" in body &&
      !clean(body.delivery_date) &&
      effectiveTransportDate
    ) {
      updatePayload.delivery_date = effectiveTransportDate;
    }

    const { error } = await supabase
      .from("transport_jobs")
      .update(updatePayload)
      .eq("id", transportJobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update transport planner job." },
      { status: 400 }
    );
  }
}
