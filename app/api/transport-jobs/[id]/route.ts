import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { geocodeAddress } from "../../../lib/geocode";

function clean(value: unknown) {
  const v = String(value ?? "").trim();
  return v.length ? v : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toMinutes(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function inferStatus(inputStatus: string | null, payload: Record<string, any>) {
  const requested = String(inputStatus ?? "").toLowerCase();

  const hasRequiredForConfirmed =
    !!payload.client_id &&
    !!payload.vehicle_id &&
    !!payload.operator_id &&
    !!payload.transport_date &&
    !!payload.collection_time &&
    !!payload.delivery_time;

  if (requested === "confirmed" && hasRequiredForConfirmed) {
    return "confirmed";
  }

  if (requested === "cancelled") return "cancelled";
  if (requested === "completed") return "completed";
  if (requested === "in_progress") return "in_progress";

  return "planned";
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
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const existingRes = await supabase
      .from("transport_jobs")
      .select("*")
      .eq("id", params.id)
      .single();

    if (existingRes.error || !existingRes.data) {
      return NextResponse.json(
        { error: "Transport job not found." },
        { status: 404 }
      );
    }

    const existing = existingRes.data;

    const nextCollectionAddress =
      body.collection_address !== undefined
        ? clean(body.collection_address)
        : existing.collection_address;

    const nextDeliveryAddress =
      body.delivery_address !== undefined
        ? clean(body.delivery_address)
        : existing.delivery_address;

    const requestedCollectionLat =
      body.collection_lat !== undefined
        ? numberOrNull(body.collection_lat)
        : existing.collection_lat;

    const requestedCollectionLng =
      body.collection_lng !== undefined
        ? numberOrNull(body.collection_lng)
        : existing.collection_lng;

    const requestedDeliveryLat =
      body.delivery_lat !== undefined
        ? numberOrNull(body.delivery_lat)
        : existing.delivery_lat;

    const requestedDeliveryLng =
      body.delivery_lng !== undefined
        ? numberOrNull(body.delivery_lng)
        : existing.delivery_lng;

    const shouldGeocodeCollection =
      body.collection_address !== undefined &&
      body.collection_lat === undefined &&
      body.collection_lng === undefined;

    const shouldGeocodeDelivery =
      body.delivery_address !== undefined &&
      body.delivery_lat === undefined &&
      body.delivery_lng === undefined;

    const collectionCoords =
      shouldGeocodeCollection && nextCollectionAddress
        ? await geocodeAddress(nextCollectionAddress)
        : null;

    const deliveryCoords =
      shouldGeocodeDelivery && nextDeliveryAddress
        ? await geocodeAddress(nextDeliveryAddress)
        : null;

    const nextPayload: Record<string, any> = {
      transport_number:
        body.transport_number !== undefined
          ? clean(body.transport_number)
          : existing.transport_number,
      linked_job_id:
        body.linked_job_id !== undefined
          ? clean(body.linked_job_id)
          : existing.linked_job_id,
      linked_transport_job_id:
        body.linked_transport_job_id !== undefined
          ? clean(body.linked_transport_job_id) === params.id
            ? null
            : clean(body.linked_transport_job_id)
          : existing.linked_transport_job_id,
      client_id:
        body.client_id !== undefined ? clean(body.client_id) : existing.client_id,
      vehicle_id:
        body.vehicle_id !== undefined
          ? clean(body.vehicle_id)
          : existing.vehicle_id,
      operator_id:
        body.operator_id !== undefined
          ? clean(body.operator_id)
          : existing.operator_id,
      job_type:
        body.job_type !== undefined ? clean(body.job_type) : existing.job_type,
      collection_address: nextCollectionAddress,
      delivery_address: nextDeliveryAddress,
      transport_date:
        body.transport_date !== undefined
          ? clean(body.transport_date)
          : existing.transport_date,
      collection_time:
        body.collection_time !== undefined
          ? clean(body.collection_time)
          : existing.collection_time,
      delivery_time:
        body.delivery_time !== undefined
          ? clean(body.delivery_time)
          : existing.delivery_time,
      load_description:
        body.load_description !== undefined
          ? clean(body.load_description)
          : existing.load_description,
      notes: body.notes !== undefined ? clean(body.notes) : existing.notes,
      price:
        body.price !== undefined
          ? numberOrNull(body.price) ?? 0
          : existing.price ?? 0,
      supplier_id:
        body.supplier_id !== undefined
          ? clean(body.supplier_id)
          : existing.supplier_id,
      supplier_reference:
        body.supplier_reference !== undefined
          ? clean(body.supplier_reference)
          : existing.supplier_reference,
      supplier_cost:
        body.supplier_cost !== undefined
          ? numberOrNull(body.supplier_cost)
          : existing.supplier_cost,
      agreed_sell_rate:
        body.agreed_sell_rate !== undefined
          ? numberOrNull(body.agreed_sell_rate)
          : existing.agreed_sell_rate,
      invoice_status:
        body.invoice_status !== undefined
          ? clean(body.invoice_status) || "Not Invoiced"
          : existing.invoice_status,
      invoice_number:
        body.invoice_number !== undefined
          ? clean(body.invoice_number)
          : existing.invoice_number,
      invoice_created_at:
        body.invoice_created_at !== undefined
          ? clean(body.invoice_created_at)
          : existing.invoice_created_at,
      invoice_due_at:
        body.invoice_due_at !== undefined
          ? clean(body.invoice_due_at)
          : existing.invoice_due_at,
      invoice_notes:
        body.invoice_notes !== undefined
          ? clean(body.invoice_notes)
          : existing.invoice_notes,
      invoice_subtotal:
        body.invoice_subtotal !== undefined
          ? numberOrNull(body.invoice_subtotal)
          : existing.invoice_subtotal,
      invoice_vat:
        body.invoice_vat !== undefined
          ? numberOrNull(body.invoice_vat)
          : existing.invoice_vat,
      total_invoice:
        body.total_invoice !== undefined
          ? numberOrNull(body.total_invoice)
          : existing.total_invoice,
      collection_lat: requestedCollectionLat ?? collectionCoords?.lat ?? null,
      collection_lng: requestedCollectionLng ?? collectionCoords?.lng ?? null,
      delivery_lat: requestedDeliveryLat ?? deliveryCoords?.lat ?? null,
      delivery_lng: requestedDeliveryLng ?? deliveryCoords?.lng ?? null,
      archived:
        body.archived !== undefined ? !!body.archived : existing.archived,
    };

    const startMins = toMinutes(nextPayload.collection_time);
    const endMins = toMinutes(nextPayload.delivery_time);

    if (
      nextPayload.collection_time &&
      nextPayload.delivery_time &&
      startMins !== null &&
      endMins !== null &&
      endMins < startMins
    ) {
      return NextResponse.json(
        { error: "Delivery time cannot be earlier than collection time." },
        { status: 400 }
      );
    }

    const subtotal =
      nextPayload.invoice_subtotal ??
      nextPayload.agreed_sell_rate ??
      nextPayload.price ??
      0;
    const vat = nextPayload.invoice_vat ?? 0;

    nextPayload.invoice_subtotal = subtotal;
    nextPayload.total_invoice = nextPayload.total_invoice ?? subtotal + vat;
    nextPayload.status = inferStatus(
      body.status !== undefined ? clean(body.status) : existing.status,
      nextPayload
    );
    nextPayload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("transport_jobs")
      .update(nextPayload)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, transport_job: data });
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
      .from("transport_jobs")
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
