import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { geocodeAddress } from "../../../lib/geocode";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrZero(value: unknown) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function numberOrNull(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function makeTransportNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  const ss = `${d.getSeconds()}`.padStart(2, "0");
  return `TR-${y}${m}${day}-${hh}${mm}${ss}`;
}

const INVOICE_STATUSES = [
  "Not Invoiced",
  "Invoiced",
  "Part Paid",
  "Paid",
];

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const transportNumber =
      clean(body?.transport_number) || makeTransportNumber();

    const linkedJobId = clean(body?.linked_job_id) || null;
    const clientId = clean(body?.client_id) || null;
    const vehicleId = clean(body?.vehicle_id) || null;
    const operatorId = clean(body?.operator_id) || null;
    const supplierId = clean(body?.supplier_id) || null;
    const supplierReference = clean(body?.supplier_reference) || null;
    const supplierCost = numberOrNull(body?.supplier_cost);
    const jobType = clean(body?.job_type) || null;

    const collectionAddress = clean(body?.collection_address) || null;
    const deliveryAddress = clean(body?.delivery_address) || null;
    const transportDate = clean(body?.transport_date) || null;
    const collectionTime = clean(body?.collection_time) || null;
    const deliveryTime = clean(body?.delivery_time) || null;
    const loadDescription = clean(body?.load_description) || null;
    const status = clean(body?.status) || "planned";
    const notes = clean(body?.notes) || null;

    const agreedSellRate = numberOrZero(body?.agreed_sell_rate);
    const invoiceStatus = clean(body?.invoice_status) || "Not Invoiced";
    const invoiceNumber = clean(body?.invoice_number) || null;
    const invoiceCreatedAt = clean(body?.invoice_created_at) || null;
    const invoiceDueAt = clean(body?.invoice_due_at) || null;
    const invoiceNotes = clean(body?.invoice_notes) || null;
    const invoiceSubtotal = numberOrZero(body?.invoice_subtotal);
    const invoiceVat = numberOrZero(body?.invoice_vat);
    const totalInvoice = numberOrZero(body?.total_invoice);

    if (!collectionAddress || !deliveryAddress || !transportDate) {
      return NextResponse.json(
        {
          error:
            "Pickup address, delivery address and transport date are required.",
        },
        { status: 400 }
      );
    }

    if (!INVOICE_STATUSES.includes(invoiceStatus)) {
      return NextResponse.json(
        { error: "Invalid invoice status." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    const pickupCoords = collectionAddress
      ? await geocodeAddress(collectionAddress)
      : null;

    const deliveryCoords = deliveryAddress
      ? await geocodeAddress(deliveryAddress)
      : null;

    const insertRow = {
      transport_number: transportNumber,
      linked_job_id: linkedJobId,
      client_id: clientId,
      vehicle_id: vehicleId,
      operator_id: operatorId,
      supplier_id: supplierId,
      supplier_reference: supplierReference,
      supplier_cost: supplierCost,
      job_type: jobType,
      collection_address: collectionAddress,
      delivery_address: deliveryAddress,
      collection_lat: pickupCoords?.lat ?? null,
      collection_lng: pickupCoords?.lng ?? null,
      delivery_lat: deliveryCoords?.lat ?? null,
      delivery_lng: deliveryCoords?.lng ?? null,
      transport_date: transportDate,
      collection_time: collectionTime,
      delivery_time: deliveryTime,
      load_description: loadDescription,
      status,
      price: agreedSellRate,
      agreed_sell_rate: agreedSellRate,
      invoice_status: invoiceStatus,
      invoice_number: invoiceNumber,
      invoice_created_at: invoiceCreatedAt,
      invoice_due_at: invoiceDueAt,
      invoice_notes: invoiceNotes,
      invoice_subtotal: invoiceSubtotal,
      invoice_vat: invoiceVat,
      total_invoice: totalInvoice,
      notes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("transport_jobs")
      .insert(insertRow)
      .select("id, transport_number")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Could not create transport job." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      transport_number: data.transport_number,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
