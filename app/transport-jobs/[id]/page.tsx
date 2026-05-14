import ClientShell from "../../ClientShell";
import ServerSubmitButton from "../../components/ServerSubmitButton";
import PreviousPageBackButton from "../../components/PreviousPageBackButton";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import { geocodeAddress } from "../../lib/geocode";
import { writeAuditLog } from "../../lib/audit";
import DuplicateTransportJobButton from "./DuplicateTransportJobButton";
import RepeatJobPatternButton from "../../components/RepeatJobPatternButton";
import TransportDocumentUploadForm from "./TransportDocumentUploadForm";
import TransportDocumentDeleteButton from "./TransportDocumentDeleteButton";
import TransportJobDetailFormEnhancer from "./TransportJobDetailFormEnhancer";
import MultiSupplierFields from "../../components/MultiSupplierFields";
import {
  buildFallbackSupplierLink,
  getPrimarySupplierLink,
  normaliseSupplierLinks,
  parseSupplierLinksFromFormData,
  replaceTransportSupplierLinks,
} from "../../lib/jobSupplierLinks";
import { isAbnormalLoadTransport } from "../../lib/transportAbnormal";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function numberOrZero(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function numberOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function checkboxValue(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "on" || raw === "1" || raw === "yes";
}

function dateTimeOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function fmtMoney(value: number | string | null | undefined) {
  return `£${money(value).toFixed(2)}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB");
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}


type CommercialBreakdownLine = {
  id: string;
  line_type: "sell" | "cost";
  item: string;
  description: string;
  date_from: string;
  date_to: string;
  quantity: string;
  rate: string;
  amount: number;
  notes: string;
};

function numberFromText(value: unknown) {
  const raw = String(value ?? "").replace(/£/g, "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function normaliseCommercialLine(raw: any, index: number): CommercialBreakdownLine | null {
  if (!raw || typeof raw !== "object") return null;

  const item = String(raw.item ?? raw.title ?? raw.name ?? "").trim();
  const description = String(raw.description ?? raw.notes ?? "").trim();
  const amount = numberFromText(raw.amount ?? raw.total ?? raw.value);
  const hasContent = item || description || amount !== 0;

  if (!hasContent) return null;

  const lineTypeRaw = String(raw.line_type ?? raw.type ?? "sell").trim().toLowerCase();

  return {
    id: String(raw.id ?? `line-${index + 1}`),
    line_type: lineTypeRaw === "cost" ? "cost" : "sell",
    item,
    description,
    date_from: String(raw.date_from ?? raw.from ?? "").slice(0, 10),
    date_to: String(raw.date_to ?? raw.to ?? "").slice(0, 10),
    quantity: String(raw.quantity ?? raw.qty ?? "").trim(),
    rate: String(raw.rate ?? "").trim(),
    amount,
    notes: String(raw.notes ?? "").trim(),
  };
}

function normaliseCommercialBreakdownLines(raw: any, fallback: CommercialBreakdownLine[]) {
  const source = Array.isArray(raw) ? raw : Array.isArray(raw?.lines) ? raw.lines : [];
  const lines = source
    .map((line: any, index: number) => normaliseCommercialLine(line, index))
    .filter(Boolean) as CommercialBreakdownLine[];

  return lines.length > 0 ? lines : fallback;
}

function parseCommercialBreakdownFromFormData(formData: FormData) {
  const lines: CommercialBreakdownLine[] = [];

  for (let index = 0; index < 16; index += 1) {
    const item = clean(formData.get(`commercial_item_${index}`));
    const description = clean(formData.get(`commercial_description_${index}`));
    const amount = numberFromText(formData.get(`commercial_amount_${index}`));
    const notes = clean(formData.get(`commercial_notes_${index}`));

    if (!item && !description && !notes && amount === 0) {
      continue;
    }

    const rawLineType = clean(formData.get(`commercial_line_type_${index}`)).toLowerCase();

    lines.push({
      id: clean(formData.get(`commercial_id_${index}`)) || `line-${index + 1}`,
      line_type: rawLineType === "cost" ? "cost" : "sell",
      item,
      description,
      date_from: clean(formData.get(`commercial_date_from_${index}`)),
      date_to: clean(formData.get(`commercial_date_to_${index}`)),
      quantity: clean(formData.get(`commercial_quantity_${index}`)),
      rate: clean(formData.get(`commercial_rate_${index}`)),
      amount,
      notes,
    });
  }

  return lines;
}

function commercialLineTotal(lines: CommercialBreakdownLine[], lineType: "sell" | "cost") {
  return lines
    .filter((line) => line.line_type === lineType)
    .reduce((sum, line) => sum + numberFromText(line.amount), 0);
}

function makeEditableCommercialRows(lines: CommercialBreakdownLine[]) {
  const existingRows = lines.filter((line) => {
    return Boolean(
      String(line.item ?? "").trim() ||
        String(line.description ?? "").trim() ||
        String(line.date_from ?? "").trim() ||
        String(line.date_to ?? "").trim() ||
        String(line.quantity ?? "").trim() ||
        String(line.rate ?? "").trim() ||
        String(line.notes ?? "").trim() ||
        numberFromText(line.amount) > 0
    );
  });

  return [
    ...existingRows.slice(0, 15),
    {
      id: `new-line-${existingRows.length + 1}`,
      line_type: "sell" as const,
      item: "",
      description: "",
      date_from: "",
      date_to: "",
      quantity: "",
      rate: "",
      amount: 0,
      notes: "",
    },
  ];
}

function buildDefaultTransportCommercialLines(item: any) {
  const lines: CommercialBreakdownLine[] = [];
  const from = String(item?.transport_date ?? "").slice(0, 10);
  const to = String(item?.delivery_date ?? item?.transport_date ?? "").slice(0, 10);
  const vehicleName = first(item?.vehicles)?.name ?? item?.job_type ?? "Transport";
  const sell = numberFromText(item?.invoice_subtotal ?? item?.agreed_sell_rate ?? item?.price);
  const cost = numberFromText(item?.supplier_cost);

  if (sell > 0) {
    lines.push({
      id: "transport-sell-price",
      line_type: "sell",
      item: `${vehicleName} charge`,
      description: item?.load_description ? String(item.load_description) : "Customer transport charge",
      date_from: from,
      date_to: to,
      quantity: item?.price_mode === "per_day" ? "per day" : "full job",
      rate: item?.price_per_day ? fmtMoney(item.price_per_day) : "",
      amount: sell,
      notes: "",
    });
  }

  if (cost > 0) {
    lines.push({
      id: "transport-supplier-cost",
      line_type: "cost",
      item: "Supplier / subcontractor cost",
      description: "Transport supplier/cross-hire cost",
      date_from: from,
      date_to: to,
      quantity: "",
      rate: "",
      amount: cost,
      notes: item?.supplier_reference ? `Supplier ref: ${item.supplier_reference}` : "",
    });
  }

  return lines;
}

function dateRangeText(from: string | null | undefined, to: string | null | undefined) {
  const fromText = fmtDate(from);
  const toText = fmtDate(to);
  if (fromText === "—" && toText === "—") return "—";
  if (fromText !== "—" && toText !== "—" && fromText !== toText) return `${fromText} → ${toText}`;
  return fromText !== "—" ? fromText : toText;
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

const INVOICE_STATUSES = ["Not Invoiced", "Invoiced", "Part Paid", "Paid"];

function buildTimeOptions() {
  const options: Array<{ value: string; label: string }> = [];
  const mins = ["00", "15", "30", "45"];

  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    for (const mm of mins) {
      const value = `${hh}:${mm}`;
      options.push({ value, label: value });
    }
  }

  return options;
}

const POLICE_ESCORT_ROW_COUNT = 5;

function normaliseMovementOrderStatus(value: FormDataEntryValue | null, required: boolean) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!required) return "not_required";
  if (["required", "submitted", "approved", "rejected"].includes(raw)) return raw;
  return "required";
}

function parsePoliceEscortRows(formData: FormData) {
  const rows: Array<{
    sort_order: number;
    force_name: string | null;
    collection_from: string | null;
    collection_to: string | null;
    collection_time: string | null;
    police_contact_name: string | null;
    police_contact_phone: string | null;
    police_contact_email: string | null;
  }> = [];

  for (let index = 0; index < POLICE_ESCORT_ROW_COUNT; index++) {
    const forceName = clean(formData.get(`police_escort_force_${index}`)) || null;
    const collectionFrom = clean(formData.get(`police_escort_collection_from_${index}`)) || null;
    const collectionTo = clean(formData.get(`police_escort_collection_to_${index}`)) || null;
    const collectionTime = clean(formData.get(`police_escort_time_${index}`)) || null;
    const contactName = clean(formData.get(`police_escort_contact_name_${index}`)) || null;
    const contactPhone = clean(formData.get(`police_escort_contact_phone_${index}`)) || null;
    const contactEmail = clean(formData.get(`police_escort_contact_email_${index}`)) || null;

    if (!forceName && !collectionFrom && !collectionTo && !collectionTime && !contactName && !contactPhone && !contactEmail) {
      continue;
    }

    rows.push({
      sort_order: index,
      force_name: forceName,
      collection_from: collectionFrom,
      collection_to: collectionTo,
      collection_time: collectionTime,
      police_contact_name: contactName,
      police_contact_phone: contactPhone,
      police_contact_email: contactEmail,
    });
  }

  return rows;
}

function movementOrderStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "not_required") return "Not required";
  if (raw === "required") return "Required";
  if (raw === "submitted") return "Submitted";
  if (raw === "approved") return "Approved";
  if (raw === "rejected") return "Rejected";
  if (raw === "other") return "Other";
  return raw ? raw.replace(/_/g, " ") : "Not required";
}

function legacySubmissionStatusFromMovement(status: string) {
  switch (status) {
    case "submitted":
    case "approved":
    case "rejected":
      return "submitted";
    case "required":
      return "not_started";
    default:
      return "not_started";
  }
}

function legacyApprovalStatusFromMovement(status: string) {
  switch (status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "submitted":
      return "pending";
    default:
      return "not_started";
  }
}

function parseDateTime(dateValue: string | null, timeValue: string | null) {
  if (!dateValue || !timeValue) return null;
  const iso = `${dateValue}T${timeValue}:00`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function normaliseTransportStatus(
  input: string | null,
  fields: {
    clientId: string | null;
    vehicleId: string | null;
    operatorId: string | null;
    transportDate: string | null;
    collectionTime: string | null;
    deliveryDate: string | null;
    deliveryTime: string | null;
  }
) {
  const requested = String(input ?? "planned").trim().toLowerCase() || "planned";

  if (requested !== "confirmed") {
    return requested;
  }

  const canConfirm =
    !!fields.clientId &&
    !!fields.vehicleId &&
    !!fields.operatorId &&
    !!fields.transportDate &&
    !!fields.collectionTime &&
    !!fields.deliveryDate &&
    !!fields.deliveryTime;

  return canConfirm ? "confirmed" : "planned";
}

function parseOtherSupplierReference(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {
      otherSupplierName: "",
      supplierReferenceOnly: "",
    };
  }

  const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);

  if (parts.length === 0) {
    return {
      otherSupplierName: "",
      supplierReferenceOnly: "",
    };
  }

  const refPart = parts.find((part) => /^ref:/i.test(part)) ?? "";
  const namePart = parts.find((part) => !/^ref:/i.test(part)) ?? raw;

  return {
    otherSupplierName: namePart,
    supplierReferenceOnly: refPart
      ? refPart.replace(/^ref:\s*/i, "").trim()
      : parts.length > 1
        ? parts.slice(1).join(" | ")
        : "",
  };
}

function prettyJobType(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "haulage") return "Haulage";
  if (v === "delivery") return "Delivery";
  if (v === "collection") return "Collection";
  if (v === "ballast") return "Ballast";
  if (v === "crane_support") return "Crane Support";
  if (v === "on_site_hiab") return "On-site HIAB";
  return value ?? "—";
}

function documentTypeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "Other";
  if (raw === "movement_order") return "Movement Order";
  if (raw === "movement_order_request") return "Movement Order Request";
  if (raw === "route_plan") return "Route Plan";
  if (raw === "permit") return "Permit / Approval";
  if (raw === "escort_confirmation") return "Escort Confirmation";
  if (raw === "authority_notice") return "Authority Notice";
  if (raw === "bridge_notice") return "Bridge Notice";
  if (raw === "police_notice") return "Police Notice";
  if (raw === "dimension_sheet") return "Dimension Sheet";
  if (raw === "drawing") return "Drawing";
  if (raw === "weight_sheet") return "Weight Sheet";
  if (raw === "vehicle_configuration") return "Vehicle Configuration";
  return raw
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function documentHref(filePath: string | null | undefined) {
  if (!filePath || !process.env.NEXT_PUBLIC_SUPABASE_URL) return "#";
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-documents/${filePath}`;
}

function countDaysInclusive(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

async function createPurchaseOrderFromTransportJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const transportJobId = clean(formData.get("transport_job_id"));
  if (!transportJobId) {
    redirect(`/transport-jobs?error=${encodeURIComponent("Transport job id missing.")}`);
  }

  const supplierId = clean(formData.get("supplier_id")) || null;
  const orderDate = clean(formData.get("order_date")) || null;
  const requiredDate = clean(formData.get("required_date")) || null;
  const supplierReference = clean(formData.get("supplier_reference")) || null;
  const notes = clean(formData.get("notes")) || null;
  const status = clean(formData.get("status")) || "draft";

  const { data: transportRow } = await supabase
    .from("transport_jobs")
    .select("id, transport_number")
    .eq("id", transportJobId)
    .maybeSingle();

  const d = new Date();
  const poNumber = `PO-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(
    d.getMinutes()
  ).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;

  const { data: created, error } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: poNumber,
      supplier_id: supplierId,
      transport_job_id: transportJobId,
      status,
      order_date: orderDate,
      required_date: requiredDate,
      supplier_reference: supplierReference,
      total_cost: 0,
      notes,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    redirect(
      `/transport-jobs/${transportJobId}?error=${encodeURIComponent(
        error?.message ?? "Could not create purchase order."
      )}`
    );
  }

  if (supplierId) {
    await supabase.from("supplier_correspondence").insert({
      supplier_id: supplierId,
      type: status === "sent" ? "email" : "note",
      subject: status === "sent" ? "Purchase Order Sent" : "Purchase Order Created",
      message: [
        `Purchase order ${poNumber} created from transport job ${transportRow?.transport_number ?? ""}.`,
        supplierReference ? `Supplier ref: ${supplierReference}.` : "",
        requiredDate ? `Required date: ${requiredDate}.` : "",
        notes ? `Notes: ${notes}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      created_by: "system",
    });
  }

  redirect(
    `/purchase-orders/${created.id}?success=${encodeURIComponent(`Purchase order ${poNumber} saved.`)}`
  );
}


async function updateTransportCommercialBreakdown(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const transportJobId = clean(formData.get("transport_job_id"));

  if (!transportJobId) {
    redirect(`/transport-jobs?error=${encodeURIComponent("Transport job id missing.")}`);
  }

  const lines = parseCommercialBreakdownFromFormData(formData);

  if (lines.length === 0) {
    redirect(`/transport-jobs/${transportJobId}?error=${encodeURIComponent("Add at least one commercial breakdown line before saving.")}`);
  }

  const sellSubtotal = Math.round(commercialLineTotal(lines, "sell") * 100) / 100;
  const costSubtotal = Math.round(commercialLineTotal(lines, "cost") * 100) / 100;
  const vat = Math.round(sellSubtotal * 0.2 * 100) / 100;
  const invoiceTotal = Math.round((sellSubtotal + vat) * 100) / 100;

  const { error } = await supabase
    .from("transport_jobs")
    .update({
      commercial_breakdown: lines,
      price: sellSubtotal,
      agreed_sell_rate: sellSubtotal,
      invoice_subtotal: sellSubtotal,
      invoice_vat: vat,
      total_invoice: invoiceTotal,
      supplier_cost: costSubtotal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transportJobId);

  if (error) {
    redirect(`/transport-jobs/${transportJobId}?error=${encodeURIComponent(error.message || "Could not save commercial breakdown.")}`);
  }

  redirect(`/transport-jobs/${transportJobId}?success=${encodeURIComponent("Commercial breakdown updated.")}`);
}

async function updateTransportRequirementFlags(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const transportJobId = clean(formData.get("transport_job_id"));
  const noDriverRequired = formData.get("no_driver_required") === "on";

  if (!transportJobId) {
    redirect(`/transport-jobs?error=${encodeURIComponent("Transport job id missing.")}`);
  }

  const { error } = await supabase
    .from("transport_jobs")
    .update({
      no_driver_required: noDriverRequired,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transportJobId);

  if (error) {
    redirect(`/transport-jobs/${transportJobId}?error=${encodeURIComponent(error.message || "Could not save allocation requirements.")}`);
  }

  redirect(`/transport-jobs/${transportJobId}?success=${encodeURIComponent("Allocation requirements updated.")}`);
}

async function updateTransportJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect(`/transport-jobs?error=${encodeURIComponent("Transport job id missing.")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existingRow } = await supabase
    .from("transport_jobs")
    .select(`
      id,
      transport_number,
      linked_job_id,
      linked_transport_job_id,
      client_id,
      vehicle_id,
      operator_id,
      supplier_id,
      supplier_reference,
      supplier_cost,
      job_type,
      transport_date,
      collection_time,
      delivery_date,
      delivery_time,
      status,
      agreed_sell_rate,
      invoice_status,
      total_invoice,
      price_mode,
      price_per_day
    `)
    .eq("id", id)
    .maybeSingle();

  const collectionAddress = clean(formData.get("collection_address")) || null;
  const deliveryAddress = clean(formData.get("delivery_address")) || null;

  const pickupCoords = collectionAddress ? await geocodeAddress(collectionAddress) : null;
  const deliveryCoords = deliveryAddress ? await geocodeAddress(deliveryAddress) : null;

  const linkedJobId = clean(formData.get("linked_job_id")) || null;
  const linkedTransportJobIdRaw = clean(formData.get("linked_transport_job_id")) || null;
  const linkedTransportJobId = linkedTransportJobIdRaw === id ? null : linkedTransportJobIdRaw;
  const clientId = clean(formData.get("client_id")) || null;
  const vehicleId = clean(formData.get("vehicle_id")) || null;
  const operatorId = clean(formData.get("operator_id")) || null;
  const transportDate = clean(formData.get("transport_date")) || null;
  const collectionTime = clean(formData.get("collection_time")) || null;
  const deliveryDate = clean(formData.get("delivery_date")) || transportDate || null;
  const deliveryTime = clean(formData.get("delivery_time")) || null;

  const rawSupplierId = clean(formData.get("supplier_id"));
  const otherSupplierName = clean(formData.get("other_supplier_name"));
  const supplierReferenceInput = clean(formData.get("supplier_reference"));

  const supplierId = rawSupplierId && rawSupplierId !== "other" ? rawSupplierId : null;

  const supplierReference =
    rawSupplierId === "other"
      ? [otherSupplierName || null, supplierReferenceInput ? `Ref: ${supplierReferenceInput}` : null]
          .filter(Boolean)
          .join(" | ") || null
      : supplierReferenceInput || null;

  const submittedSupplierLinks = parseSupplierLinksFromFormData(formData);
  const fallbackSupplierLink = buildFallbackSupplierLink({
    supplier_id: supplierId,
    supplier_display_name: rawSupplierId === "other" ? otherSupplierName || null : null,
    supplier_reference: supplierReference,
    service_description: "Transport supplier / cross-hire",
    supplier_cost: numberOrNull(formData.get("supplier_cost")),
  });
  const supplierLinks = submittedSupplierLinks.length > 0 ? submittedSupplierLinks : fallbackSupplierLink ? [fallbackSupplierLink] : [];
  const primarySupplierLink = getPrimarySupplierLink(supplierLinks);

  if (rawSupplierId === "other" && !otherSupplierName) {
    redirect(
      `/transport-jobs/${id}?error=${encodeURIComponent(
        "Enter the one-off cross-hire supplier name when using Other."
      )}`
    );
  }

  const collectionDateTime = parseDateTime(transportDate, collectionTime);
  const deliveryDateTime = parseDateTime(deliveryDate, deliveryTime);

  if (
    collectionTime &&
    deliveryTime &&
    transportDate &&
    deliveryDate &&
    collectionDateTime &&
    deliveryDateTime &&
    collectionDateTime > deliveryDateTime
  ) {
    redirect(
      `/transport-jobs/${id}?error=${encodeURIComponent(
        "Delivery date/time cannot be earlier than collection date/time."
      )}`
    );
  }

  const priceMode = clean(formData.get("price_mode")) || "full_job";
  const fullJobPrice = money(numberOrZero(formData.get("agreed_sell_rate")));
  const pricePerDay = money(numberOrZero(formData.get("price_per_day")));
  const dayCount = transportDate && deliveryDate ? countDaysInclusive(transportDate, deliveryDate) : 1;

  const agreedSellRate =
    priceMode === "per_day"
      ? money(pricePerDay * Math.max(dayCount, 1))
      : fullJobPrice;

  const invoiceSubtotalRaw = money(numberOrZero(formData.get("invoice_subtotal")));
  const invoiceSubtotal = invoiceSubtotalRaw > 0 ? invoiceSubtotalRaw : agreedSellRate;
  const invoiceVat = money(invoiceSubtotal * 0.2);
  const totalInvoice = money(invoiceSubtotal + invoiceVat);

  const invoiceStatus = clean(formData.get("invoice_status")) || "Not Invoiced";
  const abnormalLoadEnabled = checkboxValue(formData.get("abnormal_load_enabled"));
  const movementOrderRequired = abnormalLoadEnabled ? checkboxValue(formData.get("movement_order_required")) : false;
  const movementOrderStatus = abnormalLoadEnabled ? normaliseMovementOrderStatus(formData.get("movement_order_status"), movementOrderRequired) : "not_required";
  const selfEscortRequired = abnormalLoadEnabled ? checkboxValue(formData.get("self_escort_required")) : false;
  const policeEscortRequired = abnormalLoadEnabled ? checkboxValue(formData.get("police_escort_required")) : false;
  const policeEscortRows = abnormalLoadEnabled && policeEscortRequired ? parsePoliceEscortRows(formData) : [];

  if (!INVOICE_STATUSES.includes(invoiceStatus)) {
    redirect(`/transport-jobs/${id}?error=${encodeURIComponent("Invalid invoice status.")}`);
  }

  const requestedStatus = clean(formData.get("status")) || "planned";
  const nextStatus = normaliseTransportStatus(requestedStatus, {
    clientId,
    vehicleId,
    operatorId,
    transportDate,
    collectionTime,
    deliveryDate,
    deliveryTime,
  });

  const payload = {
    linked_job_id: linkedJobId,
    linked_transport_job_id: linkedTransportJobId,
    client_id: clientId,
    vehicle_id: vehicleId,
    operator_id: operatorId,
    supplier_id: primarySupplierLink?.supplier_id ?? supplierId,
    supplier_reference: primarySupplierLink?.supplier_reference ?? supplierReference,
    supplier_cost: primarySupplierLink?.supplier_cost ?? numberOrNull(formData.get("supplier_cost")),
    job_type: clean(formData.get("job_type")) || null,
    collection_address: collectionAddress,
    delivery_address: deliveryAddress,
    collection_lat: pickupCoords?.lat ?? null,
    collection_lng: pickupCoords?.lng ?? null,
    delivery_lat: deliveryCoords?.lat ?? null,
    delivery_lng: deliveryCoords?.lng ?? null,
    transport_date: transportDate,
    collection_time: collectionTime,
    delivery_date: deliveryDate,
    delivery_time: deliveryTime,
    load_description: clean(formData.get("load_description")) || null,
    status: nextStatus,
    price_mode: priceMode,
    price_per_day: priceMode === "per_day" ? pricePerDay : null,
    price: agreedSellRate,
    agreed_sell_rate: agreedSellRate,
    invoice_status: invoiceStatus,
    invoice_number: clean(formData.get("invoice_number")) || null,
    invoice_created_at: clean(formData.get("invoice_created_at")) || null,
    invoice_due_at: clean(formData.get("invoice_due_at")) || null,
    invoice_notes: clean(formData.get("invoice_notes")) || null,
    invoice_subtotal: invoiceSubtotal,
    invoice_vat: invoiceVat,
    total_invoice: totalInvoice,
    abnormal_load_enabled: abnormalLoadEnabled,
    abnormal_load_category: checkboxValue(formData.get("abnormal_load_enabled"))
      ? clean(formData.get("abnormal_load_category")) || "abnormal_load"
      : null,
    load_length_m: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("load_length_m")) : null,
    load_width_m: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("load_width_m")) : null,
    load_height_m: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("load_height_m")) : null,
    load_weight_t: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("load_weight_t")) : null,
    transport_length_m: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("transport_length_m")) : null,
    transport_width_m: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("transport_width_m")) : null,
    transport_height_m: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("transport_height_m")) : null,
    transport_gross_weight_t: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("transport_gross_weight_t")) : null,
    axle_weight_notes: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("axle_weight_notes")) || null : null,
    collection_contact_name: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("collection_contact_name")) || null : null,
    collection_contact_phone: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("collection_contact_phone")) || null : null,
    delivery_contact_name: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("delivery_contact_name")) || null : null,
    delivery_contact_phone: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("delivery_contact_phone")) || null : null,
    preferred_move_window: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("preferred_move_window")) || null : null,
    movement_start_time: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("movement_start_time")) || null : null,
    movement_finish_time: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("movement_finish_time")) || null : null,
    trailer_type: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("trailer_type")) || null : null,
    tractor_unit_type: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("tractor_unit_type")) || null : null,
    escort_required: abnormalLoadEnabled ? selfEscortRequired || policeEscortRequired : false,
    escort_details: null,
    route_notes: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("route_notes")) || null : null,
    restriction_notes: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("restriction_notes")) || null : null,
    police_notes: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("police_notes")) || null : null,
    council_notes: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("council_notes")) || null : null,
    bridge_notes: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("bridge_notes")) || null : null,
    submission_status: abnormalLoadEnabled ? legacySubmissionStatusFromMovement(movementOrderStatus) : "not_started",
    movement_order_reference: abnormalLoadEnabled ? clean(formData.get("movement_order_reference")) || null : null,
    movement_order_required: abnormalLoadEnabled ? movementOrderRequired : false,
    movement_order_status: abnormalLoadEnabled ? movementOrderStatus : "not_required",
    movement_order_cover_from: abnormalLoadEnabled ? dateTimeOrNull(formData.get("movement_order_cover_from")) : null,
    movement_order_cover_to: abnormalLoadEnabled ? dateTimeOrNull(formData.get("movement_order_cover_to")) : null,
    self_escort_required: abnormalLoadEnabled ? selfEscortRequired : false,
    self_escort_van_reg: abnormalLoadEnabled && selfEscortRequired ? clean(formData.get("self_escort_van_reg")) || null : null,
    self_escort_driver_name: abnormalLoadEnabled && selfEscortRequired ? clean(formData.get("self_escort_driver_name")) || null : null,
    self_escort_driver_phone: abnormalLoadEnabled && selfEscortRequired ? clean(formData.get("self_escort_driver_phone")) || null : null,
    police_escort_required: abnormalLoadEnabled ? policeEscortRequired : false,
    movement_order_submitted_at: checkboxValue(formData.get("abnormal_load_enabled")) ? dateTimeOrNull(formData.get("movement_order_submitted_at")) : null,
    approval_status: abnormalLoadEnabled ? legacyApprovalStatusFromMovement(movementOrderStatus) : "not_started",
    approval_notes: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("approval_notes")) || null : null,
    submitted_by_name: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("submitted_by_name")) || null : null,

    movement_reference: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("movement_reference")) || null : null,
    tractor_unit_registration: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("tractor_unit_registration")) || null : null,
    tractor_unit_fleet_id: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("tractor_unit_fleet_id")) || null : null,
    trailer_registration: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("trailer_registration")) || null : null,
    trailer_fleet_id: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("trailer_fleet_id")) || null : null,
    haulier_contact_name: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("haulier_contact_name")) || null : null,
    haulier_contact_phone: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("haulier_contact_phone")) || null : null,
    axle_configuration: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("axle_configuration")) || null : null,
    front_axle_t: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("front_axle_t")) : null,
    drive_axle_t: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("drive_axle_t")) : null,
    trailer_axle_1_t: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("trailer_axle_1_t")) : null,
    trailer_axle_2_t: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("trailer_axle_2_t")) : null,
    trailer_axle_3_t: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("trailer_axle_3_t")) : null,
    trailer_axle_4_t: checkboxValue(formData.get("abnormal_load_enabled")) ? numberOrNull(formData.get("trailer_axle_4_t")) : null,
    route_start: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("route_start")) || null : null,
    route_finish: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("route_finish")) || null : null,
    planned_route: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("planned_route")) || null : null,
    access_notes: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("access_notes")) || null : null,
    authority_areas: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("authority_areas")) || null : null,
    route_checked: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("route_checked")) : false,
    escort_provider: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("escort_provider")) || null : null,
    escort_contact_name: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("escort_contact_name")) || null : null,
    escort_contact_phone: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("escort_contact_phone")) || null : null,
    special_instructions: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("special_instructions")) || null : null,
    contingency_notes: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("contingency_notes")) || null : null,
    submission_method: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("submission_method")) || "esdal" : null,
    submission_notes: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("submission_notes")) || null : null,
    approval_reference: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("approval_reference")) || null : null,
    approval_received_at: checkboxValue(formData.get("abnormal_load_enabled")) ? dateTimeOrNull(formData.get("approval_received_at")) : null,
    authorised_to_move: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("authorised_to_move")) : false,
    authorised_move_notes: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("authorised_move_notes")) || null : null,
    police_reference: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("police_reference")) || null : null,
    highways_reference: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("highways_reference")) || null : null,
    bridge_reference: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("bridge_reference")) || null : null,
    council_reference: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("council_reference")) || null : null,
    special_order_reference: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("special_order_reference")) || null : null,
    vr1_reference: checkboxValue(formData.get("abnormal_load_enabled")) ? clean(formData.get("vr1_reference")) || null : null,
    checklist_vehicle_confirmed: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_vehicle_confirmed")) : false,
    checklist_axle_data_confirmed: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_axle_data_confirmed")) : false,
    checklist_contacts_confirmed: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_contacts_confirmed")) : false,
    checklist_authorities_identified: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_authorities_identified")) : false,
    checklist_documents_uploaded: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_documents_uploaded")) : false,
    checklist_submission_reviewed: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_submission_reviewed")) : false,
    checklist_dimensions_confirmed: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_dimensions_confirmed")) : false,
    checklist_weight_confirmed: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_weight_confirmed")) : false,
    checklist_route_checked: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_route_checked")) : false,
    checklist_trailer_checked: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_trailer_checked")) : false,
    checklist_escort_checked: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_escort_checked")) : false,
    checklist_site_access_checked: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_site_access_checked")) : false,
    checklist_customer_approved: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_customer_approved")) : false,
    checklist_supplier_booked: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_supplier_booked")) : false,
    checklist_movement_order_submitted: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_movement_order_submitted")) : false,
    checklist_approval_received: checkboxValue(formData.get("abnormal_load_enabled")) ? checkboxValue(formData.get("checklist_approval_received")) : false,
    notes: clean(formData.get("notes")) || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("transport_jobs").update(payload).eq("id", id);

  if (!error) {
    try {
      await replaceTransportSupplierLinks(supabase, id, supplierLinks);
    } catch (supplierError: any) {
      redirect(`/transport-jobs/${id}?error=${encodeURIComponent(supplierError?.message || "Could not save transport suppliers.")}`);
    }

    const { error: policeDeleteError } = await supabase
      .from("transport_job_police_escorts")
      .delete()
      .eq("transport_job_id", id);

    if (policeDeleteError) {
      redirect(`/transport-jobs/${id}?error=${encodeURIComponent(policeDeleteError.message || "Could not save police escort details.")}`);
    }

    if (policeEscortRows.length > 0) {
      const { error: policeInsertError } = await supabase.from("transport_job_police_escorts").insert(
        policeEscortRows.map((row) => ({ ...row, transport_job_id: id, updated_at: new Date().toISOString() }))
      );

      if (policeInsertError) {
        redirect(`/transport-jobs/${id}?error=${encodeURIComponent(policeInsertError.message || "Could not save police escort details.")}`);
      }
    }
  }

  if (error) {
    redirect(`/transport-jobs/${id}?error=${encodeURIComponent(error.message)}`);
  }

  await writeAuditLog({
    actor_user_id: user?.id ?? null,
    actor_username: fromAuthEmail(user?.email ?? null) || null,
    action: "transport_job_updated",
    entity_type: "transport_job",
    entity_id: id,
    meta: {
      transport_number: existingRow?.transport_number ?? null,
      before: {
        price_mode: existingRow?.price_mode ?? null,
        price_per_day: existingRow?.price_per_day ?? null,
        agreed_sell_rate: existingRow?.agreed_sell_rate ?? null,
      },
      after: {
        price_mode: payload.price_mode,
        price_per_day: payload.price_per_day,
        agreed_sell_rate: payload.agreed_sell_rate,
        abnormal_load_enabled: payload.abnormal_load_enabled,
        submission_status: payload.submission_status,
        approval_status: payload.approval_status,
      },
    },
  });

  redirect(`/transport-jobs/${id}?success=${encodeURIComponent("Transport job updated.")}`);
}

export default async function TransportJobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; success?: string };
}) {
  const supabase = createSupabaseServerClient();
  const timeOptions = buildTimeOptions();
  const errorMessage = String(searchParams?.error ?? "");
  const successMessage = String(searchParams?.success ?? "");

  const [
    { data: item, error },
    { data: clients },
    { data: jobs },
    { data: transportJobs },
    { data: vehicles },
    { data: operators },
    { data: suppliers },
    { data: transportDocuments },
    { data: policeEscorts },
    { data: purchaseOrders },
    { data: transportSupplierLinks },
  ] = await Promise.all([
    supabase
      .from("transport_jobs")
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          contact_name,
          phone,
          email
        ),
        vehicles:vehicle_id (
          id,
          name,
          reg_number
        ),
        operators:operator_id (
          id,
          full_name,
          phone,
          email
        ),
        jobs:linked_job_id (
          id,
          job_number,
          site_name
        ),
        linked_transport:linked_transport_job_id (
          id,
          transport_number,
          transport_date,
          delivery_date
        )
      `)
      .eq("id", params.id)
      .single(),

    supabase
      .from("clients")
      .select("id, company_name, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),

    supabase
      .from("jobs")
      .select("id, job_number, site_name, archived")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(300),

    supabase
      .from("transport_jobs")
      .select("id, transport_number, transport_date, delivery_date, archived")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(300),

    supabase
      .from("vehicles")
      .select("id, name, reg_number, status, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("operators")
      .select("id, full_name, status, archived")
      .eq("archived", false)
      .order("full_name", { ascending: true }),

    supabase
      .from("suppliers")
      .select("id, company_name, category")
      .order("company_name", { ascending: true }),

    supabase
      .from("transport_job_documents")
      .select("id, transport_job_id, file_name, file_path, file_type, document_type, created_at")
      .eq("transport_job_id", params.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("transport_job_police_escorts")
      .select("id, sort_order, force_name, collection_from, collection_to, collection_time, police_contact_name, police_contact_phone, police_contact_email")
      .eq("transport_job_id", params.id)
      .order("sort_order", { ascending: true }),

    supabase
      .from("purchase_orders")
      .select(`
        id,
        po_number,
        status,
        job_id,
        transport_job_id,
        supplier_id,
        order_date,
        required_date,
        supplier_reference,
        total_cost,
        notes,
        suppliers:supplier_id (
          id,
          company_name
        )
      `)
      .eq("transport_job_id", params.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("transport_job_supplier_links")
      .select(`
        id,
        supplier_id,
        supplier_display_name,
        supplier_category,
        supplier_reference,
        service_description,
        supplier_cost,
        notes,
        is_primary,
        sort_order,
        suppliers:supplier_id (
          id,
          company_name,
          category
        )
      `)
      .eq("transport_job_id", params.id)
      .order("sort_order", { ascending: true }),
  ]);

  const client = first((item as any)?.clients);
  const vehicle = first((item as any)?.vehicles);
  const operator = first((item as any)?.operators);
  const linkedJob = first((item as any)?.jobs);
  const linkedTransport = first((item as any)?.linked_transport);
  const supplierFromLookup =
    (suppliers ?? []).find((s: any) => s.id === (item as any)?.supplier_id) ?? null;

  const parsedOtherSupplier = parseOtherSupplierReference((item as any)?.supplier_reference);
  const isOtherSupplier = !(item as any)?.supplier_id && !!parsedOtherSupplier.otherSupplierName;
  const supplierLinksForForm = normaliseSupplierLinks(
    transportSupplierLinks as any[] | null | undefined,
    buildFallbackSupplierLink({
      supplier_id: (item as any)?.supplier_id ?? null,
      supplier_display_name: isOtherSupplier ? parsedOtherSupplier.otherSupplierName : supplierFromLookup?.company_name ?? null,
      supplier_category: supplierFromLookup?.category ?? null,
      supplier_reference: isOtherSupplier ? parsedOtherSupplier.supplierReferenceOnly : (item as any)?.supplier_reference ?? null,
      service_description: "Legacy / primary transport supplier",
      supplier_cost: (item as any)?.supplier_cost ?? null,
    })
  );
  const movementDocumentTypes = new Set([
    "movement_order",
    "movement_order_request",
    "route_plan",
    "permit",
    "escort_confirmation",
    "authority_notice",
    "bridge_notice",
    "police_notice",
    "dimension_sheet",
    "drawing",
    "weight_sheet",
    "vehicle_configuration",
  ]);
  const movementDocuments = ((transportDocuments as any[]) ?? []).filter((doc: any) =>
    movementDocumentTypes.has(String(doc.document_type ?? "").trim().toLowerCase())
  );
  const generalDocuments = ((transportDocuments as any[]) ?? []).filter((doc: any) =>
    !movementDocumentTypes.has(String(doc.document_type ?? "").trim().toLowerCase())
  );
  const policeEscortRows = ((policeEscorts as any[]) ?? []) as any[];
  const movementOrderActive = Boolean(
    (item as any)?.abnormal_load_enabled ||
      (item as any)?.movement_order_required ||
      ((item as any)?.movement_order_status && (item as any)?.movement_order_status !== "not_required") ||
      (item as any)?.movement_order_reference ||
      (item as any)?.movement_order_cover_from ||
      (item as any)?.movement_order_cover_to ||
      (item as any)?.self_escort_required ||
      (item as any)?.police_escort_required
  );
  const commercialLines = normaliseCommercialBreakdownLines(
    (item as any)?.commercial_breakdown,
    buildDefaultTransportCommercialLines(item as any)
  );
  const commercialSellSubtotal = Math.round(commercialLineTotal(commercialLines, "sell") * 100) / 100;
  const commercialCostSubtotal = Math.round(commercialLineTotal(commercialLines, "cost") * 100) / 100;
  const commercialVat = Math.round((Number((item as any)?.invoice_vat ?? 0) || commercialSellSubtotal * 0.2) * 100) / 100;
  const commercialInvoiceTotal = Math.round(
    (Number((item as any)?.total_invoice ?? 0) || commercialSellSubtotal + commercialVat) * 100
  ) / 100;
  const amountPaid = numberFromText((item as any)?.amount_paid);
  const outstandingBalance = Math.max(0, commercialInvoiceTotal - amountPaid);
  const estimatedGrossProfit = commercialSellSubtotal - commercialCostSubtotal;
  const estimatedMargin = commercialSellSubtotal > 0 ? (estimatedGrossProfit / commercialSellSubtotal) * 100 : 0;
  const noDriverRequired = Boolean((item as any)?.no_driver_required);
  const driverAllocated = Boolean((item as any)?.operator_id || operator?.full_name);
  const vehicleAllocated = Boolean((item as any)?.vehicle_id || vehicle?.name || vehicle?.reg_number);
  const supplierCostExpected = supplierLinksForForm.some((supplier) =>
    Boolean(
      supplier.supplier_id ||
        supplier.supplier_display_name ||
        supplier.supplier_reference ||
        supplier.service_description ||
        supplier.notes
    )
  );
  const supplierCostRecorded = Boolean(
    commercialCostSubtotal > 0 ||
      numberFromText((item as any)?.supplier_cost) > 0 ||
      supplierLinksForForm.some((supplier) => numberFromText(supplier.supplier_cost) > 0)
  );
  const chargeLines = commercialLines.filter((line) => line.line_type !== "cost");
  const costLines = commercialLines.filter((line) => line.line_type === "cost");
  const needsAttention = [
    !(item as any)?.invoice_status || String((item as any)?.invoice_status).toLowerCase() === "not invoiced" ? "Not invoiced" : null,
    commercialLines.length === 0 ? "Commercial breakdown missing" : null,
    supplierCostExpected && !supplierCostRecorded ? "Supplier/cost amount missing for linked supplier" : null,
    !vehicleAllocated ? "No vehicle allocated" : null,
    !noDriverRequired && !driverAllocated ? "No driver allocated" : null,
    movementOrderActive && !(item as any)?.movement_order_reference ? "Movement order reference missing" : null,
  ].filter(Boolean) as string[];

  return (
    <ClientShell>
      <div style={pageWrap}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 32, wordBreak: "break-word" }}>
                {(item as any)?.transport_number ?? "Transport Job"}
              </h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                View and update the transport job, costs and invoice status.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <PreviousPageBackButton fallbackHref="/transport-jobs" label="← Back" style={secondaryBtn} />
              <a href={`/transport-jobs/${params.id}/lift-plan`} style={secondaryBtn}>
                Lift plan / RAMS
              </a>
              <DuplicateTransportJobButton jobId={params.id} />
              <RepeatJobPatternButton
                jobId={params.id}
                jobType="transport"
                defaultStartDate={(item as any)?.transport_date ?? null}
                defaultEndDate={(item as any)?.delivery_date ?? (item as any)?.transport_date ?? null}
                defaultRate={Number((item as any)?.invoice_subtotal ?? (item as any)?.price ?? (item as any)?.agreed_sell_rate ?? 0) || null}
              />
            </div>
          </div>

          {error ? <div style={errorBox}>{error.message}</div> : null}
          {errorMessage ? <div style={errorBox}>{decodeURIComponent(errorMessage)}</div> : null}
          {successMessage ? <div style={successBox}>{decodeURIComponent(successMessage)}</div> : null}

          {!item ? null : (
            <>
              <div style={summaryGrid}>
                <SummaryCard
                  title="Job Summary"
                  rows={[
                    { label: "Customer", value: client?.company_name ?? "—" },
                    { label: "Job type", value: prettyJobType((item as any)?.job_type) },
                    { label: "Status", value: (item as any)?.status ?? "—" },
                    {
                      label: "Pickup complete",
                      value: fmtDateTime((item as any)?.pickup_completed_at),
                    },
                    {
                      label: "Delivery complete",
                      value: fmtDateTime((item as any)?.delivery_completed_at),
                    },
                    { label: "Collection date", value: (item as any)?.transport_date ?? "—" },
                    { label: "Delivery date", value: (item as any)?.delivery_date ?? "—" },
                    { label: "Collection time", value: (item as any)?.collection_time ?? "—" },
                    { label: "Delivery time", value: (item as any)?.delivery_time ?? "—" },
                  ]}
                />

                <SummaryCard
                  title="Allocation"
                  rows={[
                    {
                      label: "Vehicle",
                      value: `${vehicle?.name ?? "—"}${vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}`,
                    },
                    { label: "Driver / operator", value: operator?.full_name ?? "—" },
                    {
                      label: "Linked crane job",
                      value: linkedJob?.job_number
                        ? `Job #${linkedJob.job_number}${linkedJob.site_name ? ` • ${linkedJob.site_name}` : ""}`
                        : "—",
                    },
                    {
                      label: "Linked transport job",
                      value: linkedTransport?.transport_number
                        ? `${linkedTransport.transport_number}${linkedTransport.transport_date ? ` • ${linkedTransport.transport_date}` : ""}`
                        : "—",
                    },
                  ]}
                />

                <SummaryCard
                  title="Commercial"
                  rows={[
                    {
                      label: "Price mode",
                      value:
                        (item as any)?.price_mode === "per_day"
                          ? "Price per day"
                          : "Full job price",
                    },
                    {
                      label: "Price per day",
                      value:
                        (item as any)?.price_per_day != null
                          ? fmtMoney((item as any).price_per_day)
                          : "—",
                    },
                    {
                      label: "Charge",
                      value: fmtMoney((item as any)?.agreed_sell_rate ?? (item as any)?.price),
                    },
                    {
                      label: "Supplier cost",
                      value: fmtMoney((item as any)?.supplier_cost ?? 0),
                    },
                    {
                      label: "Invoice status",
                      value: (item as any)?.invoice_status ?? "Not Invoiced",
                    },
                    {
                      label: "Invoice total",
                      value: fmtMoney((item as any)?.total_invoice ?? 0),
                    },
                  ]}
                />

                {isAbnormalLoadTransport(item as any) ? (
                  <SummaryCard
                    title="Movement Order"
                    rows={[
                      { label: "Status", value: movementOrderStatusLabel((item as any)?.movement_order_status) },
                      { label: "Reference", value: (item as any)?.movement_order_reference ?? "—" },
                      { label: "Covers from", value: fmtDateTime((item as any)?.movement_order_cover_from) },
                      { label: "Covers to", value: fmtDateTime((item as any)?.movement_order_cover_to) },
                      { label: "Self escort", value: (item as any)?.self_escort_required ? "Yes" : "No" },
                      { label: "Police escort", value: (item as any)?.police_escort_required ? "Yes" : "No" },
                    ]}
                  />
                ) : null}
              </div>

              <section style={{ ...sectionCard, marginTop: 18, border: needsAttention.length > 0 ? "1px solid rgba(245,158,11,0.45)" : sectionCard.border }}>
                <div style={sectionTitle}>Needs attention</div>
                {needsAttention.length === 0 ? (
                  <div style={emptyState}>No obvious commercial, movement order or allocation issues found.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {needsAttention.map((attention) => (
                      <div key={attention} style={warningLineStyle}>• {attention}</div>
                    ))}
                  </div>
                )}
              </section>

              <section style={{ ...sectionCard, marginTop: 18 }}>
                <div style={sectionTitle}>Commercial breakdown</div>

                <div style={commercialTotalsGrid}>
                  <SummaryMini label="Customer charge subtotal" value={fmtMoney(commercialSellSubtotal)} />
                  <SummaryMini label="Supplier / cost total" value={fmtMoney(commercialCostSubtotal)} />
                  <SummaryMini label="Estimated gross profit" value={fmtMoney(estimatedGrossProfit)} />
                  <SummaryMini label="Estimated margin" value={`${estimatedMargin.toFixed(1)}%`} />
                  <SummaryMini label="VAT" value={fmtMoney(commercialVat)} />
                  <SummaryMini label="Invoice total" value={fmtMoney(commercialInvoiceTotal)} />
                  <SummaryMini label="Amount paid" value={fmtMoney(amountPaid)} />
                  <SummaryMini label="Outstanding" value={fmtMoney(outstandingBalance)} />
                  <SummaryMini label="Invoice status" value={(item as any)?.invoice_status ?? "Not Invoiced"} />
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                  <div>
                    <div style={{ ...labelStyle, marginBottom: 8 }}>Customer charges</div>
                    {chargeLines.length === 0 ? (
                      <div style={emptyState}>No customer charge lines entered yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {chargeLines.map((line, index) => (
                          <div key={`${line.id}-charge-${index}`} style={breakdownLineStyle}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 900 }}>{line.item || "Customer charge"}</div>
                                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78, whiteSpace: "pre-wrap" }}>
                                  {[line.description, dateRangeText(line.date_from, line.date_to), line.quantity ? `Qty ${line.quantity}` : "", line.rate ? `Rate ${line.rate}` : ""]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                                {line.notes ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>{line.notes}</div> : null}
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={sellBadgeStyle}>Charge</div>
                                <div style={{ marginTop: 6, fontWeight: 900 }}>{fmtMoney(line.amount)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ ...labelStyle, marginBottom: 8 }}>Supplier / cost lines</div>
                    {costLines.length === 0 ? (
                      <div style={emptyState}>No supplier or subcontractor cost lines entered. This is fine if there is no external cost for this transport job.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {costLines.map((line, index) => (
                          <div key={`${line.id}-cost-${index}`} style={breakdownLineStyle}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 900 }}>{line.item || "Supplier / cost"}</div>
                                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78, whiteSpace: "pre-wrap" }}>
                                  {[line.description, dateRangeText(line.date_from, line.date_to), line.quantity ? `Qty ${line.quantity}` : "", line.rate ? `Rate ${line.rate}` : ""]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                                {line.notes ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>{line.notes}</div> : null}
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={costBadgeStyle}>Cost</div>
                                <div style={{ marginTop: 6, fontWeight: 900 }}>{fmtMoney(line.amount)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <details style={{ marginTop: 14 }}>
                  <summary style={detailsSummary}>Edit commercial breakdown</summary>
                  <form action={updateTransportCommercialBreakdown} style={{ marginTop: 12, display: "grid", gap: 12 }}>
                    <input type="hidden" name="transport_job_id" value={(item as any).id} />
                    <div style={helperTextBox}>
                      Existing lines are shown first. Use the single blank row at the bottom only when you need to add another charge/cost. Example: Rigid HIAB charged collection to delivery £1,100, low loader charged 07/04/2026 to 08/04/2026 £1,600, escort cost £250. Charge lines build the invoice subtotal. Cost lines build the estimated margin/cost total.
                    </div>
                    {makeEditableCommercialRows(commercialLines).map((line, index) => (
                      <div key={`commercial-edit-${index}`} style={editableLineCard}>
                        <input type="hidden" name={`commercial_id_${index}`} defaultValue={line.id} />
                        <div style={editableLineGrid}>
                          <div>
                            <label style={labelStyle}>Type</label>
                            <select name={`commercial_line_type_${index}`} defaultValue={line.line_type} style={inputStyle}>
                              <option value="sell">Customer charge</option>
                              <option value="cost">Supplier / cost</option>
                            </select>
                          </div>
                          <div>
                            <label style={labelStyle}>Item / what it is for</label>
                            <input name={`commercial_item_${index}`} defaultValue={line.item} placeholder="HIAB / low loader / escort / police" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>From</label>
                            <input name={`commercial_date_from_${index}`} type="date" defaultValue={line.date_from} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>To</label>
                            <input name={`commercial_date_to_${index}`} type="date" defaultValue={line.date_to} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Qty / days / hours</label>
                            <input name={`commercial_quantity_${index}`} defaultValue={line.quantity} placeholder="1 day / 8 hours" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Rate</label>
                            <input name={`commercial_rate_${index}`} defaultValue={line.rate} placeholder="£1100/day" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Amount</label>
                            <input name={`commercial_amount_${index}`} type="number" step="0.01" defaultValue={line.amount ? String(line.amount) : ""} style={inputStyle} />
                          </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <label style={labelStyle}>Description / notes</label>
                          <textarea name={`commercial_description_${index}`} rows={2} defaultValue={line.description} style={textareaStyle} placeholder="Full explanation of this charge or cost" />
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <label style={labelStyle}>Internal note</label>
                          <input name={`commercial_notes_${index}`} defaultValue={line.notes} style={inputStyle} />
                        </div>
                      </div>
                    ))}
                    <ServerSubmitButton style={primaryBtn} pendingText="Saving breakdown…">
                      Save commercial breakdown
                    </ServerSubmitButton>
                  </form>
                </details>
              </section>

              <section style={{ ...sectionCard, marginTop: 18 }}>
                <div style={sectionTitle}>Supplier, vehicle and driver breakdown</div>

                <form action={updateTransportRequirementFlags} style={{ marginBottom: 12, display: "grid", gap: 10 }}>
                  <input type="hidden" name="transport_job_id" value={(item as any).id} />
                  <label style={{ ...listCard, display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" name="no_driver_required" defaultChecked={noDriverRequired} style={{ marginTop: 3 }} />
                    <span>
                      <strong>No driver required</strong>
                      <span style={{ display: "block", marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                        Tick this where no driver needs allocating in the CRM for this transport job.
                      </span>
                    </span>
                  </label>
                  <div>
                    <ServerSubmitButton style={secondaryBtn} pendingText="Saving…">
                      Save allocation requirement
                    </ServerSubmitButton>
                  </div>
                </form>

                <div style={{ display: "grid", gap: 10 }}>
                  {vehicleAllocated ? (
                    <div style={listCard}>
                      <div style={{ fontWeight: 900 }}>Vehicle</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                        {vehicle?.name ?? "Vehicle"}{vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}
                      </div>
                    </div>
                  ) : (
                    <div style={emptyState}>No vehicle allocated.</div>
                  )}

                  {driverAllocated ? (
                    <div style={listCard}>
                      <div style={{ fontWeight: 900 }}>Driver</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>{operator?.full_name ?? "Driver allocated"}</div>
                    </div>
                  ) : noDriverRequired ? (
                    <div style={emptyState}>No driver required has been marked for this job.</div>
                  ) : (
                    <div style={emptyState}>No driver allocated.</div>
                  )}

                  <div style={listCard}>
                    <div style={{ fontWeight: 900 }}>Movement</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                      {[`Collection: ${fmtDate((item as any)?.transport_date)} ${((item as any)?.collection_time ?? "")}`.trim(), `Delivery: ${fmtDate((item as any)?.delivery_date)} ${((item as any)?.delivery_time ?? "")}`.trim()]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  </div>

                  {movementOrderActive ? (
                    <div style={listCard}>
                      <div style={{ fontWeight: 900 }}>Movement order / escorts</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                        {[movementOrderStatusLabel((item as any)?.movement_order_status), (item as any)?.movement_order_reference ? `Ref ${(item as any).movement_order_reference}` : "Reference missing", (item as any)?.self_escort_required ? "Self escort" : "", (item as any)?.police_escort_required ? "Police escort" : ""]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  {supplierLinksForForm.length === 0 ? (
                    <div style={emptyState}>No suppliers linked to this transport job.</div>
                  ) : (
                    supplierLinksForForm.map((supplier, index) => (
                      <div key={`${supplier.supplier_id ?? supplier.supplier_display_name ?? "supplier"}-${index}`} style={listCard}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 900 }}>
                              {supplier.supplier_display_name || "Supplier"} {supplier.is_primary ? "• Primary" : ""}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                              {[supplier.supplier_category, supplier.service_description, supplier.supplier_reference ? `Ref ${supplier.supplier_reference}` : ""]
                                .filter(Boolean)
                                .join(" • ") || "No service details entered."}
                            </div>
                            {supplier.notes ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>{supplier.notes}</div> : null}
                          </div>
                          <div style={{ fontWeight: 900 }}>{fmtMoney(supplier.supplier_cost ?? 0)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <form action={updateTransportJob} style={{ display: "grid", gap: 18, marginTop: 18 }}>
                <TransportJobDetailFormEnhancer />
                <input type="hidden" name="id" value={params.id} />

                <section style={sectionCard}>
                  <div style={sectionTitle}>Transport job details</div>

                  <div style={gridStyle}>
                    <SelectField
                      label="Linked crane job"
                      name="linked_job_id"
                      defaultValue={(item as any)?.linked_job_id ?? ""}
                      options={(jobs ?? []).map((j: any) => ({
                        value: j.id,
                        label: `Job #${j.job_number ?? "—"}${j.site_name ? ` • ${j.site_name}` : ""}`,
                      }))}
                    />

                    <SelectField
                      label="Linked transport job"
                      name="linked_transport_job_id"
                      defaultValue={(item as any)?.linked_transport_job_id ?? ""}
                      options={(transportJobs ?? [])
                        .filter((j: any) => j.id !== (item as any)?.id)
                        .map((j: any) => ({
                          value: j.id,
                          label: `${j.transport_number ?? "Transport Job"}${j.transport_date ? ` • ${j.transport_date}` : ""}${j.delivery_date && j.delivery_date !== j.transport_date ? ` → ${j.delivery_date}` : ""}`,
                        }))}
                    />

                    <SelectField
                      label="Customer"
                      name="client_id"
                      defaultValue={(item as any)?.client_id ?? ""}
                      options={(clients ?? []).map((c: any) => ({
                        value: c.id,
                        label: c.company_name ?? "Customer",
                      }))}
                    />

                    <SelectField
                      label="Vehicle"
                      name="vehicle_id"
                      defaultValue={(item as any)?.vehicle_id ?? ""}
                      options={(vehicles ?? []).map((v: any) => ({
                        value: v.id,
                        label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
                      }))}
                    />

                    <SelectField
                      label="Driver / Operator"
                      name="operator_id"
                      defaultValue={(item as any)?.operator_id ?? ""}
                      options={(operators ?? []).map((o: any) => ({
                        value: o.id,
                        label: o.full_name ?? "Operator",
                      }))}
                    />

                    <SelectField
                      id="job_type"
                      label="Job type"
                      name="job_type"
                      defaultValue={(item as any)?.job_type ?? ""}
                      options={[
                        { value: "haulage", label: "haulage" },
                        { value: "delivery", label: "delivery" },
                        { value: "collection", label: "collection" },
                        { value: "ballast", label: "ballast" },
                        { value: "crane_support", label: "crane_support" },
                        { value: "on_site_hiab", label: "on_site_hiab" },
                      ]}
                    />

                    <Field
                      id="transport_date"
                      label="Collection date"
                      name="transport_date"
                      type="date"
                      defaultValue={(item as any)?.transport_date ?? ""}
                    />

                    <SelectField
                      id="collection_time"
                      label="Collection time"
                      name="collection_time"
                      defaultValue={(item as any)?.collection_time ?? ""}
                      options={timeOptions}
                    />

                    <Field
                      id="delivery_date"
                      label="Delivery date"
                      name="delivery_date"
                      type="date"
                      defaultValue={(item as any)?.delivery_date ?? ""}
                    />

                    <SelectField
                      id="delivery_time"
                      label="Delivery time"
                      name="delivery_time"
                      defaultValue={(item as any)?.delivery_time ?? ""}
                      options={timeOptions}
                    />

                    <SelectField
                      label="Status"
                      name="status"
                      defaultValue={(item as any)?.status ?? "planned"}
                      options={[
                        { value: "planned", label: "planned" },
                        { value: "confirmed", label: "confirmed" },
                        { value: "in_progress", label: "in_progress" },
                        { value: "completed", label: "completed" },
                        { value: "cancelled", label: "cancelled" },
                        { value: "late_cancelled", label: "late_cancelled" },
                      ]}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label id="collection_address_label" htmlFor="collection_address" style={labelStyle}>
                      Pickup / site address
                    </label>
                    <textarea
                      id="collection_address"
                      name="collection_address"
                      rows={3}
                      style={textareaStyle}
                      defaultValue={(item as any)?.collection_address ?? ""}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label id="delivery_address_label" htmlFor="delivery_address" style={labelStyle}>
                      Delivery / work area address
                    </label>
                    <textarea
                      id="delivery_address"
                      name="delivery_address"
                      rows={3}
                      style={textareaStyle}
                      defaultValue={(item as any)?.delivery_address ?? ""}
                    />
                  </div>

                  <div
                    id="on_site_hiab_notice"
                    style={{
                      ...softPanel,
                      marginTop: 12,
                      display: (item as any)?.job_type === "on_site_hiab" ? "block" : "none",
                    }}
                  >
                    For on-site HIAB work, keep the main site in the pickup address and use the delivery
                    address for the working area or secondary location if needed.
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label id="load_description_label" htmlFor="load_description" style={labelStyle}>
                      Load / task description
                    </label>
                    <textarea
                      id="load_description"
                      name="load_description"
                      rows={3}
                      style={textareaStyle}
                      defaultValue={(item as any)?.load_description ?? ""}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={labelStyle}>Notes</label>
                    <textarea
                      name="notes"
                      rows={5}
                      style={textareaStyle}
                      defaultValue={(item as any)?.notes ?? ""}
                    />
                  </div>
                </section>

                <section style={sectionCard}>
                  <div style={sectionTitle}>Pricing</div>

                  <div style={gridStyle}>
                    <SelectField
                      id="price_mode"
                      label="Price mode"
                      name="price_mode"
                      defaultValue={(item as any)?.price_mode ?? "full_job"}
                      options={[
                        { value: "full_job", label: "Full job price" },
                        { value: "per_day", label: "Price per day" },
                      ]}
                    />

                    <Field
                      id="agreed_sell_rate"
                      label="Full job price"
                      name="agreed_sell_rate"
                      type="number"
                      step="0.01"
                      defaultValue={String(
                        (item as any)?.price_mode === "per_day"
                          ? 0
                          : ((item as any)?.agreed_sell_rate ?? (item as any)?.price ?? 0)
                      )}
                    />

                    <Field
                      id="price_per_day"
                      label="Price per day"
                      name="price_per_day"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any)?.price_per_day ?? 0)}
                    />

                    <Field
                      id="invoice_subtotal"
                      label="Invoice subtotal"
                      name="invoice_subtotal"
                      type="number"
                      step="0.01"
                      defaultValue={String(
                        (item as any)?.invoice_subtotal ??
                          (item as any)?.agreed_sell_rate ??
                          (item as any)?.price ??
                          0
                      )}
                    />

                    <ReadOnlyField
                      id="invoice_vat"
                      label="VAT"
                      value={fmtMoney(
                        (item as any)?.invoice_vat ??
                          money(
                            ((item as any)?.invoice_subtotal ??
                              (item as any)?.agreed_sell_rate ??
                              (item as any)?.price ??
                              0) * 0.2
                          )
                      )}
                    />

                    <ReadOnlyField
                      id="total_invoice"
                      label="Invoice total"
                      value={fmtMoney((item as any)?.total_invoice ?? 0)}
                    />
                  </div>
                </section>

                <details id="supplier_details_section" style={detailsCard}>
                  <summary style={detailsSummary}>Cross-hire / supplier details</summary>

                  <div style={detailsHelp}>
                    Only use this when the transport job is supplier-backed or cross-hired.
                  </div>

                  <div style={gridStyle}>
                    <SelectField
                      id="supplier_id"
                      label="Supplier"
                      name="supplier_id"
                      defaultValue={isOtherSupplier ? "other" : (item as any)?.supplier_id ?? ""}
                      options={[
                        ...(suppliers ?? []).map((s: any) => ({
                          value: s.id,
                          label: s.company_name ?? "Supplier",
                        })),
                        { value: "other", label: "Other" },
                      ]}
                    />

                    <Field
                      id="other_supplier_name"
                      label="Other supplier name (only fill in if Supplier = Other)"
                      name="other_supplier_name"
                      defaultValue={parsedOtherSupplier.otherSupplierName}
                      placeholder="Enter one-off cross-hire supplier"
                    />

                    <Field
                      id="supplier_reference"
                      label="Supplier reference"
                      name="supplier_reference"
                      defaultValue={
                        isOtherSupplier
                          ? parsedOtherSupplier.supplierReferenceOnly
                          : (item as any)?.supplier_reference ?? ""
                      }
                    />

                    <Field
                      id="supplier_cost"
                      label="Supplier cost"
                      name="supplier_cost"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any)?.supplier_cost ?? "")}
                    />
                  </div>

                  {(item as any)?.supplier_id || supplierFromLookup || isOtherSupplier ? (
                    <div style={{ marginTop: 12, ...softPanel }}>
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Current supplier details</div>
                      <div style={{ fontSize: 14, opacity: 0.85 }}>
                        {isOtherSupplier
                          ? `Other supplier: ${parsedOtherSupplier.otherSupplierName || "—"}`
                          : supplierFromLookup?.company_name || "—"}
                        {(item as any)?.supplier_cost
                          ? ` • Cost ${fmtMoney((item as any)?.supplier_cost)}`
                          : ""}
                        {(item as any)?.supplier_reference
                          ? ` • Ref ${(item as any)?.supplier_reference}`
                          : ""}
                      </div>
                    </div>
                  ) : null}
                </details>

                <MultiSupplierFields
                  title="Additional transport suppliers / subcontractors"
                  help="Add every transport supplier, subcontractor, haulier, HIAB supplier, escort provider or one-off supplier linked to this transport job."
                  initialLinks={supplierLinksForForm}
                  supplierOptions={((suppliers as any[]) ?? []).map((supplier: any) => ({
                    value: supplier.id,
                    label: supplier.company_name ?? "Supplier",
                    category: supplier.category ?? "",
                  }))}
                />

                <section style={sectionCard}>
  <div style={sectionTitle}>Movement order</div>
  <div style={helperText}>Use this only where a movement order is required.</div>

  <label style={{ ...checkboxRow, marginTop: 12 }}>
    <input
      type="checkbox"
      id="abnormal_load_enabled"
      name="abnormal_load_enabled"
      value="true"
      defaultChecked={movementOrderActive}
    />
    <span>Movement order required</span>
  </label>

  <div id="abnormal_load_fields_wrap" style={{ display: movementOrderActive ? "block" : "none", marginTop: 12 }}>
    <input type="hidden" name="movement_order_required" value="true" />

    <div id="abnormal_load_fields_panel" style={{ marginTop: 14, display: "grid", gap: 14 }}>
      <div>
        <div style={subsectionTitle}>Movement order details</div>
        <div style={gridStyle}>
          <SelectField
            label="Movement order status"
            name="movement_order_status"
            defaultValue={(item as any)?.movement_order_status ?? "required"}
            options={[
              { value: "required", label: "Required" },
              { value: "submitted", label: "Submitted" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
              { value: "other", label: "Other" },
            ]}
          />
          <Field
            label="Movement order reference"
            name="movement_order_reference"
            defaultValue={(item as any)?.movement_order_reference ?? ""}
          />
          <Field
            label="Covers from"
            name="movement_order_cover_from"
            type="datetime-local"
            defaultValue={String((item as any)?.movement_order_cover_from ?? "").slice(0, 16)}
          />
          <Field
            label="Covers to"
            name="movement_order_cover_to"
            type="datetime-local"
            defaultValue={String((item as any)?.movement_order_cover_to ?? "").slice(0, 16)}
          />
        </div>
      </div>

      <div>
        <div style={subsectionTitle}>Self escort</div>
        <label style={{ ...checkboxRow, marginTop: 8 }}>
          <input
            type="checkbox"
            name="self_escort_required"
            value="true"
            defaultChecked={Boolean((item as any)?.self_escort_required)}
          />
          <span>Self escort required</span>
        </label>

        <div style={{ ...gridStyle, marginTop: 10 }}>
          <Field
            label="Van reg"
            name="self_escort_van_reg"
            defaultValue={(item as any)?.self_escort_van_reg ?? ""}
          />
          <Field
            label="Driver name"
            name="self_escort_driver_name"
            defaultValue={(item as any)?.self_escort_driver_name ?? ""}
          />
          <Field
            label="Driver number"
            name="self_escort_driver_phone"
            defaultValue={(item as any)?.self_escort_driver_phone ?? ""}
          />
        </div>
      </div>

      <div>
        <div style={subsectionTitle}>Police escort</div>
        <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
          <label style={checkboxRow}>
            <input
              id="police_escort_required"
              type="checkbox"
              name="police_escort_required"
              value="true"
              defaultChecked={Boolean((item as any)?.police_escort_required)}
            />
            <span>Police escort required</span>
          </label>

          <div
            id="police_escort_fields_wrap"
            style={{ display: Boolean((item as any)?.police_escort_required) ? "grid" : "none", gap: 10 }}
          >
            {Array.from({ length: POLICE_ESCORT_ROW_COUNT }).map((_, index) => {
              const row = policeEscortRows[index] ?? null;
              const initialVisibleCount = Math.max(1, policeEscortRows.length);

              return (
                <div
                  key={`police-escort-${index}`}
                  data-police-escort-row="true"
                  data-police-escort-index={index}
                  style={{ ...miniCard, display: index < initialVisibleCount ? "grid" : "none", gap: 10 }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13 }}>
                    Police escort #{index + 1}
                  </div>

                  <div style={gridStyle}>
                    <Field
                      label="Force"
                      name={`police_escort_force_${index}`}
                      defaultValue={row?.force_name ?? ""}
                    />
                    <Field
                      label="Collection from"
                      name={`police_escort_collection_from_${index}`}
                      defaultValue={row?.collection_from ?? ""}
                    />
                    <Field
                      label="Collection to"
                      name={`police_escort_collection_to_${index}`}
                      defaultValue={row?.collection_to ?? ""}
                    />
                    <Field
                      label="Time"
                      name={`police_escort_time_${index}`}
                      type="time"
                      defaultValue={String(row?.collection_time ?? "").slice(0, 5)}
                    />
                    <Field
                      label="Police contact"
                      name={`police_escort_contact_name_${index}`}
                      defaultValue={row?.police_contact_name ?? ""}
                    />
                    <Field
                      label="Police number"
                      name={`police_escort_contact_phone_${index}`}
                      defaultValue={row?.police_contact_phone ?? ""}
                    />
                    <Field
                      label="Police email"
                      name={`police_escort_contact_email_${index}`}
                      type="email"
                      defaultValue={row?.police_contact_email ?? ""}
                    />
                  </div>
                </div>
              );
            })}

            <button type="button" id="add_police_escort_row_btn" style={secondaryBtn}>
              Add another police escort
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>


                <section style={sectionCard}>
                  <div style={sectionTitle}>Invoice</div>

                  <div style={gridStyle}>
                    <SelectField
                      label="Invoice status"
                      name="invoice_status"
                      defaultValue={(item as any)?.invoice_status ?? "Not Invoiced"}
                      options={INVOICE_STATUSES.map((value) => ({
                        value,
                        label: value,
                      }))}
                    />

                    <Field
                      label="Invoice number"
                      name="invoice_number"
                      defaultValue={(item as any)?.invoice_number ?? ""}
                    />

                    <Field
                      label="Invoice date"
                      name="invoice_created_at"
                      type="date"
                      defaultValue={(item as any)?.invoice_created_at ?? ""}
                    />

                    <Field
                      label="Due date"
                      name="invoice_due_at"
                      type="date"
                      defaultValue={(item as any)?.invoice_due_at ?? ""}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={labelStyle}>Invoice notes</label>
                    <textarea
                      name="invoice_notes"
                      rows={4}
                      style={textareaStyle}
                      defaultValue={(item as any)?.invoice_notes ?? ""}
                    />
                  </div>
                </section>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <ServerSubmitButton style={primaryBtn} pendingText="Saving transport job…">
                    Save transport job
                  </ServerSubmitButton>
                </div>
              </form>

              <section style={{ ...sectionCard, marginTop: 18 }}>
                <div style={sectionTitle}>Transport Documents</div>

                <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
                  <TransportDocumentUploadForm transportJobId={params.id} />

                  {(transportDocuments ?? []).length === 0 ? (
                    <div style={emptyState}>No documents uploaded yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 14 }}>
                      {movementDocuments.length > 0 ? (
                        <div style={{ display: "grid", gap: 10 }}>
                          <div style={subsectionTitle}>Movement order documents</div>
                          {movementDocuments.map((doc: any) => (
                            <div key={doc.id} style={listCard}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  flexWrap: "wrap",
                                }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 900, wordBreak: "break-word" }}>
                                    {doc.file_name ?? "Document"}
                                  </div>
                                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                                    {documentTypeLabel(doc.document_type)} • {doc.created_at ?? ""}
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <a href={documentHref(doc.file_path)} target="_blank" rel="noreferrer" style={secondaryBtn}>Open</a>
                                  <TransportDocumentDeleteButton transportJobId={params.id} documentId={doc.id} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {generalDocuments.length > 0 ? (
                        <div style={{ display: "grid", gap: 10 }}>
                          <div style={subsectionTitle}>General transport documents</div>
                          {generalDocuments.map((doc: any) => (
                            <div key={doc.id} style={listCard}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  flexWrap: "wrap",
                                }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 900, wordBreak: "break-word" }}>
                                    {doc.file_name ?? "Document"}
                                  </div>
                                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                                    {documentTypeLabel(doc.document_type)} • {doc.created_at ?? ""}
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <a href={documentHref(doc.file_path)} target="_blank" rel="noreferrer" style={secondaryBtn}>Open</a>
                                  <TransportDocumentDeleteButton transportJobId={params.id} documentId={doc.id} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </section>

              <section style={{ ...sectionCard, marginTop: 18 }}>
                <div style={sectionTitle}>Transport Purchase Orders</div>

                <form action={createPurchaseOrderFromTransportJob} style={{ display: "grid", gap: 12, marginTop: 12 }}>
                  <input type="hidden" name="transport_job_id" value={params.id} />

                  <div style={gridStyle}>
                    <SelectField
                      label="Supplier"
                      name="supplier_id"
                      defaultValue={(item as any)?.supplier_id ?? ""}
                      options={(suppliers ?? []).map((s: any) => ({
                        value: s.id,
                        label: s.company_name ?? "Supplier",
                      }))}
                    />

                    <SelectField
                      label="Status"
                      name="status"
                      defaultValue="draft"
                      options={[
                        { value: "draft", label: "Draft" },
                        { value: "sent", label: "Sent" },
                        { value: "approved", label: "Approved" },
                        { value: "completed", label: "Completed" },
                        { value: "cancelled", label: "Cancelled" },
                        { value: "late_cancelled", label: "Late Cancelled" },
                      ]}
                    />

                    <Field
                      label="Order date"
                      name="order_date"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                    />

                    <Field label="Required date" name="required_date" type="date" />

                    <Field
                      label="Supplier reference"
                      name="supplier_reference"
                      defaultValue={(item as any)?.supplier_reference ?? ""}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Notes</label>
                    <textarea
                      name="notes"
                      rows={3}
                      style={textareaStyle}
                      defaultValue={`Created from transport job ${(item as any)?.transport_number ?? ""}`}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <ServerSubmitButton style={primaryBtn} pendingText="Creating purchase order…">
                      Create purchase order
                    </ServerSubmitButton>
                  </div>
                </form>

                <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                  {((purchaseOrders as any[]) ?? []).length === 0 ? (
                    <div style={emptyState}>No purchase orders linked to this transport job yet.</div>
                  ) : (
                    ((purchaseOrders as any[]) ?? []).map((po: any) => {
                      const poSupplier = first(po.suppliers);
                      return (
                        <div key={po.id} style={listCard}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 900 }}>{po.po_number ?? "Purchase order"}</div>
                              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                                {po.status ?? "draft"}
                                {poSupplier?.company_name ? ` • ${poSupplier.company_name}` : ""}
                                {po.order_date ? ` • Ordered ${fmtDate(po.order_date)}` : ""}
                                {po.required_date ? ` • Required ${fmtDate(po.required_date)}` : ""}
                              </div>

                              {po.supplier_reference || po.notes ? (
                                <div
                                  style={{
                                    marginTop: 8,
                                    fontSize: 13,
                                    opacity: 0.82,
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {[po.supplier_reference ? `Ref: ${po.supplier_reference}` : "", po.notes ?? ""]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                              ) : null}
                            </div>

                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 900 }}>{fmtMoney(po.total_cost ?? 0)}</div>
                              <a href={`/purchase-orders/${po.id}`} style={secondaryBtn}>
                                Open PO
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

function SummaryCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <section style={summaryCard}>
      <div style={sectionTitle}>{title}</div>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((row) => (
          <div key={`${title}-${row.label}`} style={summaryRow}>
            <div style={summaryLabel}>{row.label}</div>
            <div style={summaryValue}>{row.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryMini({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={summaryMiniCard}>
      <div style={summaryLabel}>{label}</div>
      <div style={summaryValue}>{value}</div>
    </div>
  );
}

function Field({
  id,
  label,
  name,
  defaultValue,
  type = "text",
  step,
  placeholder,
}: {
  id?: string;
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        defaultValue={defaultValue}
        type={type}
        step={step}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  name,
  defaultValue,
  options,
}: {
  id?: string;
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <select id={id} name={name} defaultValue={defaultValue} style={inputStyle}>
        <option value="">— Select —</option>
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReadOnlyField({
  id,
  label,
  value,
}: {
  id?: string;
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        readOnly
        aria-readonly="true"
        tabIndex={-1}
        style={{
          ...inputStyle,
          background: "rgba(255,255,255,0.72)",
          color: "#111",
          fontWeight: 800,
        }}
      />
    </div>
  );
}

const pageWrap: React.CSSProperties = {
  width: "100%",
  maxWidth: 1300,
  margin: "0 auto",
  boxSizing: "border-box",
};

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  boxSizing: "border-box",
  overflow: "hidden",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
  marginTop: 18,
  minWidth: 0,
};

const summaryCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.68)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
  minWidth: 0,
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.68)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
  minWidth: 0,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
};

const summaryRow: React.CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const summaryLabel: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  opacity: 0.65,
  fontWeight: 800,
};

const summaryValue: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  wordBreak: "break-word",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
  minWidth: 0,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
  resize: "vertical",
  minWidth: 0,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const successBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(16,185,129,0.12)",
  border: "1px solid rgba(16,185,129,0.24)",
};

const miniCard: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.72)",
  padding: 12,
};

const detailsCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.68)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const detailsSummary: React.CSSProperties = {
  cursor: "pointer",
  fontWeight: 900,
};

const detailsHelp: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 12,
  fontSize: 13,
  opacity: 0.75,
};

const softPanel: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const subsectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  marginBottom: 10,
};

const helperText: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "rgba(15,23,42,0.74)",
  marginTop: 6,
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 700,
};

const checklistGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const readinessRed: React.CSSProperties = {
  background: "rgba(239, 68, 68, 0.12)",
  border: "1px solid rgba(239, 68, 68, 0.24)",
};

const readinessAmber: React.CSSProperties = {
  background: "rgba(245, 158, 11, 0.12)",
  border: "1px solid rgba(245, 158, 11, 0.24)",
};

const readinessGreen: React.CSSProperties = {
  background: "rgba(16, 185, 129, 0.12)",
  border: "1px solid rgba(16, 185, 129, 0.24)",
};

const emptyState: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.58)",
  border: "1px dashed rgba(0,0,0,0.10)",
  opacity: 0.78,
};

const listCard: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.76)",
  border: "1px solid rgba(0,0,0,0.06)",
};


const warningLineStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(245,158,11,0.14)",
  border: "1px solid rgba(245,158,11,0.24)",
  fontWeight: 800,
};

const commercialTotalsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
};

const summaryMiniCard: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const breakdownLineStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.74)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const sellBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  background: "rgba(16,185,129,0.12)",
  border: "1px solid rgba(16,185,129,0.24)",
  color: "#047857",
};

const costBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  background: "rgba(245,158,11,0.14)",
  border: "1px solid rgba(245,158,11,0.24)",
  color: "#92400e",
};

const helperTextBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(59,130,246,0.10)",
  border: "1px solid rgba(59,130,246,0.18)",
  fontSize: 13,
  lineHeight: 1.5,
};

const editableLineCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.70)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const editableLineGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};
