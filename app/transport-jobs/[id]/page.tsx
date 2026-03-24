import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import { geocodeAddress } from "../../lib/geocode";
import { writeAuditLog } from "../../lib/audit";
import DuplicateTransportJobButton from "./DuplicateTransportJobButton";
import TransportDocumentUploadForm from "./TransportDocumentUploadForm";
import TransportDocumentDeleteButton from "./TransportDocumentDeleteButton";

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

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

const INVOICE_STATUSES = [
  "Not Invoiced",
  "Invoiced",
  "Part Paid",
  "Paid",
];

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

  redirect(`/purchase-orders/${created.id}?success=${encodeURIComponent(`Purchase order ${poNumber} saved.`)}`);
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
  const deliveryDate =
    clean(formData.get("delivery_date")) || transportDate || null;
  const deliveryTime = clean(formData.get("delivery_time")) || null;

  const rawSupplierId = clean(formData.get("supplier_id"));
  const otherSupplierName = clean(formData.get("other_supplier_name"));
  const supplierReferenceInput = clean(formData.get("supplier_reference"));

  const supplierId =
    rawSupplierId && rawSupplierId !== "other" ? rawSupplierId : null;

  const supplierReference =
    rawSupplierId === "other"
      ? [otherSupplierName || null, supplierReferenceInput ? `Ref: ${supplierReferenceInput}` : null]
          .filter(Boolean)
          .join(" | ") || null
      : supplierReferenceInput || null;

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
    supplier_id: supplierId,
    supplier_reference: supplierReference,
    supplier_cost: numberOrNull(formData.get("supplier_cost")),
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
    notes: clean(formData.get("notes")) || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("transport_jobs").update(payload).eq("id", id);

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
    { data: purchaseOrders },
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

  return (
    <ClientShell>
      <div style={{ width: "min(1300px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>
                {(item as any)?.transport_number ?? "Transport Job"}
              </h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                View and update the transport job, costs and invoice status.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/transport-jobs" style={secondaryBtn}>
                ← Back
              </a>
              <DuplicateTransportJobButton jobId={params.id} />
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
                    { label: "Price mode", value: (item as any)?.price_mode === "per_day" ? "Price per day" : "Full job price" },
                    { label: "Price per day", value: (item as any)?.price_per_day != null ? fmtMoney((item as any).price_per_day) : "—" },
                    { label: "Charge", value: fmtMoney((item as any)?.agreed_sell_rate ?? (item as any)?.price) },
                    { label: "Supplier cost", value: fmtMoney((item as any)?.supplier_cost ?? 0) },
                    { label: "Invoice status", value: (item as any)?.invoice_status ?? "Not Invoiced" },
                    { label: "Invoice total", value: fmtMoney((item as any)?.total_invoice ?? 0) },
                  ]}
                />
              </div>

              <form action={updateTransportJob} style={{ display: "grid", gap: 18, marginTop: 18 }}>
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
                      label="Collection date"
                      name="transport_date"
                      type="date"
                      defaultValue={(item as any)?.transport_date ?? ""}
                    />

                    <SelectField
                      label="Collection time"
                      name="collection_time"
                      defaultValue={(item as any)?.collection_time ?? ""}
                      options={timeOptions}
                    />

                    <Field
                      label="Delivery date"
                      name="delivery_date"
                      type="date"
                      defaultValue={(item as any)?.delivery_date ?? ""}
                    />

                    <SelectField
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
                      ]}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={labelStyle}>Pickup / site address</label>
                    <textarea
                      name="collection_address"
                      rows={3}
                      style={textareaStyle}
                      defaultValue={(item as any)?.collection_address ?? ""}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={labelStyle}>Delivery / work area address</label>
                    <textarea
                      name="delivery_address"
                      rows={3}
                      style={textareaStyle}
                      defaultValue={(item as any)?.delivery_address ?? ""}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={labelStyle}>Load / task description</label>
                    <textarea
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
                      label="Price mode"
                      name="price_mode"
                      defaultValue={(item as any)?.price_mode ?? "full_job"}
                      options={[
                        { value: "full_job", label: "Full job price" },
                        { value: "per_day", label: "Price per day" },
                      ]}
                    />

                    <Field
                      label="Full job price"
                      name="agreed_sell_rate"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any)?.price_mode === "per_day" ? 0 : ((item as any)?.agreed_sell_rate ?? (item as any)?.price ?? 0))}
                    />

                    <Field
                      label="Price per day"
                      name="price_per_day"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any)?.price_per_day ?? 0)}
                    />

                    <Field
                      label="Invoice subtotal"
                      name="invoice_subtotal"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any)?.invoice_subtotal ?? (item as any)?.agreed_sell_rate ?? (item as any)?.price ?? 0)}
                    />
                  </div>
                </section>

                <details id="supplier_details_section" style={detailsCard}>
                  <summary style={detailsSummary}>Cross-hire / supplier details</summary>
                  <div style={detailsHelp}>
                    Only open this when the transport job is supplier-backed or cross-hired.
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

                    <div id="other_supplier_wrap" style={{ display: isOtherSupplier ? "block" : "none" }}>
                      <Field
                        id="other_supplier_name"
                        label="Other supplier name"
                        name="other_supplier_name"
                        defaultValue={parsedOtherSupplier.otherSupplierName}
                        placeholder="Enter one-off cross-hire supplier"
                      />
                    </div>

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

                <section style={sectionCard}>
                  <div style={sectionTitle}>Transport Documents</div>

                  <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
                    <TransportDocumentUploadForm transportJobId={params.id} />

                    {(transportDocuments ?? []).length === 0 ? (
                      <div style={emptyState}>No documents uploaded yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {(transportDocuments ?? []).map((doc: any) => (
                          <div key={doc.id} style={listCard}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 900, wordBreak: "break-word" }}>
                                  {doc.file_name ?? "Document"}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                                  {documentTypeLabel(doc.document_type)} • {doc.created_at ?? ""}
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <a
                                  href={documentHref(doc.file_path)}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={secondaryBtn}
                                >
                                  Open
                                </a>
                                <TransportDocumentDeleteButton
                                  transportJobId={params.id}
                                  documentId={doc.id}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section style={sectionCard}>
                  <div style={sectionTitle}>Transport Purchase Orders</div>

                  <form action={createPurchaseOrderFromTransportJob} style={{ display: "grid", gap: 12 }}>
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
                        ]}
                      />

                      <Field
                        label="Order date"
                        name="order_date"
                        type="date"
                        defaultValue={new Date().toISOString().slice(0, 10)}
                      />

                      <Field
                        label="Required date"
                        name="required_date"
                        type="date"
                      />

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
                      <button type="submit" style={primaryBtn}>
                        Create purchase order
                      </button>
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
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div>
                                <div style={{ fontWeight: 900 }}>{po.po_number ?? "Purchase order"}</div>
                                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                                  {po.status ?? "draft"}
                                  {poSupplier?.company_name ? ` • ${poSupplier.company_name}` : ""}
                                  {po.order_date ? ` • Ordered ${fmtDate(po.order_date)}` : ""}
                                  {po.required_date ? ` • Required ${fmtDate(po.required_date)}` : ""}
                                </div>

                                {po.supplier_reference || po.notes ? (
                                  <div style={{ marginTop: 8, fontSize: 13, opacity: 0.82 }}>
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

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="submit" style={primaryBtn}>
                    Save transport job
                  </button>
                </div>
              </form>
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
    <div style={{ display: "grid", gap: 6 }}>
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
    <div style={{ display: "grid", gap: 6 }}>
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

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 16,
  marginTop: 18,
};

const summaryCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.68)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.68)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
};

const summaryRow: React.CSSProperties = {
  display: "grid",
  gap: 4,
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
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
  resize: "vertical",
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
