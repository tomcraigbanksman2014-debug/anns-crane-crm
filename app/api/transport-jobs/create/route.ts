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
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}${String(now.getDate()).padStart(2, "0")}-${String(
      now.getHours()
    ).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(
      now.getSeconds()
    ).padStart(2, "0")}`;

    const collectionTime = clean(body.collection_time);
    const deliveryTime = clean(body.delivery_time);

    const startMins = toMinutes(collectionTime);
    const endMins = toMinutes(deliveryTime);

    if (
      collectionTime &&
      deliveryTime &&
      startMins !== null &&
      endMins !== null &&
      endMins < startMins
    ) {
      return NextResponse.json(
        { error: "Delivery time cannot be earlier than collection time." },
        { status: 400 }
      );
    }

    const agreedSellRate =
      numberOrNull(body.agreed_sell_rate) ?? numberOrNull(body.price) ?? 0;

    const invoiceVat = numberOrNull(body.invoice_vat) ?? 0;
    const invoiceSubtotal =
      numberOrNull(body.invoice_subtotal) ?? agreedSellRate;
    const totalInvoice =
      numberOrNull(body.total_invoice) ?? invoiceSubtotal + invoiceVat;

    const collectionAddress = clean(body.collection_address);
    const deliveryAddress = clean(body.delivery_address);

    const collectionLat = numberOrNull(body.collection_lat);
    const collectionLng = numberOrNull(body.collection_lng);
    const deliveryLat = numberOrNull(body.delivery_lat);
    const deliveryLng = numberOrNull(body.delivery_lng);

    const collectionCoords =
      collectionAddress && (collectionLat === null || collectionLng === null)
        ? await geocodeAddress(collectionAddress)
        : null;

    const deliveryCoords =
      deliveryAddress && (deliveryLat === null || deliveryLng === null)
        ? await geocodeAddress(deliveryAddress)
        : null;

    const abnormalLoadEnabled = checkboxValue(body.abnormal_load_enabled);

    const payload: Record<string, any> = {
      transport_number: clean(body.transport_number) || `TR-${stamp}`,
      linked_job_id: clean(body.linked_job_id),
      linked_transport_job_id: clean(body.linked_transport_job_id),
      client_id: clean(body.client_id),
      vehicle_id: clean(body.vehicle_id),
      operator_id: clean(body.operator_id),
      job_type: clean(body.job_type),
      collection_address: collectionAddress,
      delivery_address: deliveryAddress,
      transport_date: clean(body.transport_date),
      collection_time: collectionTime,
      delivery_time: deliveryTime,
      load_description: clean(body.load_description),
      notes: clean(body.notes),
      price: numberOrNull(body.price) ?? 0,
      supplier_id: clean(body.supplier_id),
      supplier_reference: clean(body.supplier_reference),
      supplier_cost: numberOrNull(body.supplier_cost),
      agreed_sell_rate: agreedSellRate,
      invoice_status: clean(body.invoice_status) || "Not Invoiced",
      invoice_number: clean(body.invoice_number),
      invoice_created_at: clean(body.invoice_created_at),
      invoice_due_at: clean(body.invoice_due_at),
      invoice_notes: clean(body.invoice_notes),
      invoice_subtotal: invoiceSubtotal,
      invoice_vat: invoiceVat,
      total_invoice: totalInvoice,
      abnormal_load_enabled: abnormalLoadEnabled,
      abnormal_load_category: abnormalLoadEnabled ? clean(body.abnormal_load_category) || "abnormal_load" : null,
      load_length_m: abnormalLoadEnabled ? numberOrNull(body.load_length_m) : null,
      load_width_m: abnormalLoadEnabled ? numberOrNull(body.load_width_m) : null,
      load_height_m: abnormalLoadEnabled ? numberOrNull(body.load_height_m) : null,
      load_weight_t: abnormalLoadEnabled ? numberOrNull(body.load_weight_t) : null,
      transport_length_m: abnormalLoadEnabled ? numberOrNull(body.transport_length_m) : null,
      transport_width_m: abnormalLoadEnabled ? numberOrNull(body.transport_width_m) : null,
      transport_height_m: abnormalLoadEnabled ? numberOrNull(body.transport_height_m) : null,
      transport_gross_weight_t: abnormalLoadEnabled ? numberOrNull(body.transport_gross_weight_t) : null,
      axle_weight_notes: abnormalLoadEnabled ? clean(body.axle_weight_notes) : null,
      collection_contact_name: abnormalLoadEnabled ? clean(body.collection_contact_name) : null,
      collection_contact_phone: abnormalLoadEnabled ? clean(body.collection_contact_phone) : null,
      delivery_contact_name: abnormalLoadEnabled ? clean(body.delivery_contact_name) : null,
      delivery_contact_phone: abnormalLoadEnabled ? clean(body.delivery_contact_phone) : null,
      preferred_move_window: abnormalLoadEnabled ? clean(body.preferred_move_window) : null,
      trailer_type: abnormalLoadEnabled ? clean(body.trailer_type) : null,
      tractor_unit_type: abnormalLoadEnabled ? clean(body.tractor_unit_type) : null,
      escort_required: abnormalLoadEnabled ? checkboxValue(body.escort_required) : false,
      escort_details: abnormalLoadEnabled ? clean(body.escort_details) : null,
      route_notes: abnormalLoadEnabled ? clean(body.route_notes) : null,
      restriction_notes: abnormalLoadEnabled ? clean(body.restriction_notes) : null,
      police_notes: abnormalLoadEnabled ? clean(body.police_notes) : null,
      council_notes: abnormalLoadEnabled ? clean(body.council_notes) : null,
      bridge_notes: abnormalLoadEnabled ? clean(body.bridge_notes) : null,
      submission_status: abnormalLoadEnabled ? clean(body.submission_status) || "not_started" : "not_started",
      movement_order_reference: abnormalLoadEnabled ? clean(body.movement_order_reference) : null,
      movement_order_submitted_at: abnormalLoadEnabled ? dateTimeOrNull(body.movement_order_submitted_at) : null,
      approval_status: abnormalLoadEnabled ? clean(body.approval_status) || "not_started" : "not_started",
      approval_notes: abnormalLoadEnabled ? clean(body.approval_notes) : null,
      submitted_by_name: abnormalLoadEnabled ? clean(body.submitted_by_name) : null,
      checklist_dimensions_confirmed: abnormalLoadEnabled ? checkboxValue(body.checklist_dimensions_confirmed) : false,
      checklist_weight_confirmed: abnormalLoadEnabled ? checkboxValue(body.checklist_weight_confirmed) : false,
      checklist_route_checked: abnormalLoadEnabled ? checkboxValue(body.checklist_route_checked) : false,
      checklist_trailer_checked: abnormalLoadEnabled ? checkboxValue(body.checklist_trailer_checked) : false,
      checklist_escort_checked: abnormalLoadEnabled ? checkboxValue(body.checklist_escort_checked) : false,
      checklist_site_access_checked: abnormalLoadEnabled ? checkboxValue(body.checklist_site_access_checked) : false,
      checklist_customer_approved: abnormalLoadEnabled ? checkboxValue(body.checklist_customer_approved) : false,
      checklist_supplier_booked: abnormalLoadEnabled ? checkboxValue(body.checklist_supplier_booked) : false,
      checklist_movement_order_submitted: abnormalLoadEnabled ? checkboxValue(body.checklist_movement_order_submitted) : false,
      checklist_approval_received: abnormalLoadEnabled ? checkboxValue(body.checklist_approval_received) : false,
      collection_lat: collectionLat ?? collectionCoords?.lat ?? null,
      collection_lng: collectionLng ?? collectionCoords?.lng ?? null,
      delivery_lat: deliveryLat ?? deliveryCoords?.lat ?? null,
      delivery_lng: deliveryLng ?? deliveryCoords?.lng ?? null,
      archived: false,
      updated_at: new Date().toISOString(),
    };

    payload.status = inferStatus(clean(body.status), payload);

    const { data, error } = await supabase
      .from("transport_jobs")
      .insert(payload)
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
