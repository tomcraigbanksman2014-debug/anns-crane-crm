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

function checkboxValue(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "on" || raw === "1" || raw === "yes";
}

function dateTimeOrNull(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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
      abnormal_load_enabled:
        body.abnormal_load_enabled !== undefined
          ? checkboxValue(body.abnormal_load_enabled)
          : existing.abnormal_load_enabled,
      abnormal_load_category:
        body.abnormal_load_category !== undefined
          ? clean(body.abnormal_load_category)
          : existing.abnormal_load_category,
      load_length_m:
        body.load_length_m !== undefined
          ? numberOrNull(body.load_length_m)
          : existing.load_length_m,
      load_width_m:
        body.load_width_m !== undefined
          ? numberOrNull(body.load_width_m)
          : existing.load_width_m,
      load_height_m:
        body.load_height_m !== undefined
          ? numberOrNull(body.load_height_m)
          : existing.load_height_m,
      load_weight_t:
        body.load_weight_t !== undefined
          ? numberOrNull(body.load_weight_t)
          : existing.load_weight_t,
      transport_length_m:
        body.transport_length_m !== undefined
          ? numberOrNull(body.transport_length_m)
          : existing.transport_length_m,
      transport_width_m:
        body.transport_width_m !== undefined
          ? numberOrNull(body.transport_width_m)
          : existing.transport_width_m,
      transport_height_m:
        body.transport_height_m !== undefined
          ? numberOrNull(body.transport_height_m)
          : existing.transport_height_m,
      transport_gross_weight_t:
        body.transport_gross_weight_t !== undefined
          ? numberOrNull(body.transport_gross_weight_t)
          : existing.transport_gross_weight_t,
      axle_weight_notes:
        body.axle_weight_notes !== undefined
          ? clean(body.axle_weight_notes)
          : existing.axle_weight_notes,
      collection_contact_name:
        body.collection_contact_name !== undefined
          ? clean(body.collection_contact_name)
          : existing.collection_contact_name,
      collection_contact_phone:
        body.collection_contact_phone !== undefined
          ? clean(body.collection_contact_phone)
          : existing.collection_contact_phone,
      delivery_contact_name:
        body.delivery_contact_name !== undefined
          ? clean(body.delivery_contact_name)
          : existing.delivery_contact_name,
      delivery_contact_phone:
        body.delivery_contact_phone !== undefined
          ? clean(body.delivery_contact_phone)
          : existing.delivery_contact_phone,
      preferred_move_window:
        body.preferred_move_window !== undefined
          ? clean(body.preferred_move_window)
          : existing.preferred_move_window,
      trailer_type:
        body.trailer_type !== undefined
          ? clean(body.trailer_type)
          : existing.trailer_type,
      tractor_unit_type:
        body.tractor_unit_type !== undefined
          ? clean(body.tractor_unit_type)
          : existing.tractor_unit_type,
      escort_required:
        body.escort_required !== undefined
          ? checkboxValue(body.escort_required)
          : existing.escort_required,
      escort_details:
        body.escort_details !== undefined
          ? clean(body.escort_details)
          : existing.escort_details,
      route_notes:
        body.route_notes !== undefined
          ? clean(body.route_notes)
          : existing.route_notes,
      restriction_notes:
        body.restriction_notes !== undefined
          ? clean(body.restriction_notes)
          : existing.restriction_notes,
      police_notes:
        body.police_notes !== undefined
          ? clean(body.police_notes)
          : existing.police_notes,
      council_notes:
        body.council_notes !== undefined
          ? clean(body.council_notes)
          : existing.council_notes,
      bridge_notes:
        body.bridge_notes !== undefined
          ? clean(body.bridge_notes)
          : existing.bridge_notes,
      submission_status:
        body.submission_status !== undefined
          ? clean(body.submission_status) || "not_started"
          : existing.submission_status,
      movement_order_reference:
        body.movement_order_reference !== undefined
          ? clean(body.movement_order_reference)
          : existing.movement_order_reference,
      movement_order_submitted_at:
        body.movement_order_submitted_at !== undefined
          ? dateTimeOrNull(body.movement_order_submitted_at)
          : existing.movement_order_submitted_at,
      approval_status:
        body.approval_status !== undefined
          ? clean(body.approval_status) || "not_started"
          : existing.approval_status,
      approval_notes:
        body.approval_notes !== undefined
          ? clean(body.approval_notes)
          : existing.approval_notes,
      submitted_by_name:
        body.submitted_by_name !== undefined
          ? clean(body.submitted_by_name)
          : existing.submitted_by_name,
      checklist_dimensions_confirmed:
        body.checklist_dimensions_confirmed !== undefined
          ? checkboxValue(body.checklist_dimensions_confirmed)
          : existing.checklist_dimensions_confirmed,
      checklist_weight_confirmed:
        body.checklist_weight_confirmed !== undefined
          ? checkboxValue(body.checklist_weight_confirmed)
          : existing.checklist_weight_confirmed,
      checklist_route_checked:
        body.checklist_route_checked !== undefined
          ? checkboxValue(body.checklist_route_checked)
          : existing.checklist_route_checked,
      checklist_trailer_checked:
        body.checklist_trailer_checked !== undefined
          ? checkboxValue(body.checklist_trailer_checked)
          : existing.checklist_trailer_checked,
      checklist_escort_checked:
        body.checklist_escort_checked !== undefined
          ? checkboxValue(body.checklist_escort_checked)
          : existing.checklist_escort_checked,
      checklist_site_access_checked:
        body.checklist_site_access_checked !== undefined
          ? checkboxValue(body.checklist_site_access_checked)
          : existing.checklist_site_access_checked,
      checklist_customer_approved:
        body.checklist_customer_approved !== undefined
          ? checkboxValue(body.checklist_customer_approved)
          : existing.checklist_customer_approved,
      checklist_supplier_booked:
        body.checklist_supplier_booked !== undefined
          ? checkboxValue(body.checklist_supplier_booked)
          : existing.checklist_supplier_booked,
      checklist_movement_order_submitted:
        body.checklist_movement_order_submitted !== undefined
          ? checkboxValue(body.checklist_movement_order_submitted)
          : existing.checklist_movement_order_submitted,
      checklist_approval_received:
        body.checklist_approval_received !== undefined
          ? checkboxValue(body.checklist_approval_received)
          : existing.checklist_approval_received,
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

    if (!nextPayload.abnormal_load_enabled) {
      nextPayload.abnormal_load_category = null;
      nextPayload.load_length_m = null;
      nextPayload.load_width_m = null;
      nextPayload.load_height_m = null;
      nextPayload.load_weight_t = null;
      nextPayload.transport_length_m = null;
      nextPayload.transport_width_m = null;
      nextPayload.transport_height_m = null;
      nextPayload.transport_gross_weight_t = null;
      nextPayload.axle_weight_notes = null;
      nextPayload.collection_contact_name = null;
      nextPayload.collection_contact_phone = null;
      nextPayload.delivery_contact_name = null;
      nextPayload.delivery_contact_phone = null;
      nextPayload.preferred_move_window = null;
      nextPayload.trailer_type = null;
      nextPayload.tractor_unit_type = null;
      nextPayload.escort_required = false;
      nextPayload.escort_details = null;
      nextPayload.route_notes = null;
      nextPayload.restriction_notes = null;
      nextPayload.police_notes = null;
      nextPayload.council_notes = null;
      nextPayload.bridge_notes = null;
      nextPayload.submission_status = "not_started";
      nextPayload.movement_order_reference = null;
      nextPayload.movement_order_submitted_at = null;
      nextPayload.approval_status = "not_started";
      nextPayload.approval_notes = null;
      nextPayload.submitted_by_name = null;
      nextPayload.checklist_dimensions_confirmed = false;
      nextPayload.checklist_weight_confirmed = false;
      nextPayload.checklist_route_checked = false;
      nextPayload.checklist_trailer_checked = false;
      nextPayload.checklist_escort_checked = false;
      nextPayload.checklist_site_access_checked = false;
      nextPayload.checklist_customer_approved = false;
      nextPayload.checklist_supplier_booked = false;
      nextPayload.checklist_movement_order_submitted = false;
      nextPayload.checklist_approval_received = false;
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
