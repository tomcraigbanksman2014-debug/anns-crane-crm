import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import { geocodeAddress } from "../../lib/geocode";
import { writeAuditLog } from "../../lib/audit";
import DuplicateTransportJobButton from "./DuplicateTransportJobButton";
import TransportJobDetailFormEnhancer from "./TransportJobDetailFormEnhancer";

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

function looksLikeCrossHire(item: any) {
  return !!item?.supplier_id || Number(item?.supplier_cost ?? 0) > 0;
}

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
      total_invoice
    `)
    .eq("id", id)
    .maybeSingle();

  const collectionAddress = clean(formData.get("collection_address")) || null;
  const deliveryAddress = clean(formData.get("delivery_address")) || null;

  const pickupCoords = collectionAddress ? await geocodeAddress(collectionAddress) : null;
  const deliveryCoords = deliveryAddress ? await geocodeAddress(deliveryAddress) : null;

  const agreedSellRate = money(numberOrZero(formData.get("agreed_sell_rate")));
  const invoiceSubtotalRaw = money(numberOrZero(formData.get("invoice_subtotal")));
  const invoiceSubtotal = invoiceSubtotalRaw > 0 ? invoiceSubtotalRaw : agreedSellRate;
  const invoiceVat = money(invoiceSubtotal * 0.2);
  const totalInvoice = money(invoiceSubtotal + invoiceVat);

  const invoiceStatus = clean(formData.get("invoice_status")) || "Not Invoiced";

  if (!INVOICE_STATUSES.includes(invoiceStatus)) {
    redirect(`/transport-jobs/${id}?error=${encodeURIComponent("Invalid invoice status.")}`);
  }

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

  const nextStatus = normaliseTransportStatus(clean(formData.get("status")) || "planned", {
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
        linked_job_id: existingRow?.linked_job_id ?? null,
        client_id: existingRow?.client_id ?? null,
        vehicle_id: existingRow?.vehicle_id ?? null,
        operator_id: existingRow?.operator_id ?? null,
        supplier_id: existingRow?.supplier_id ?? null,
        supplier_reference: existingRow?.supplier_reference ?? null,
        supplier_cost: existingRow?.supplier_cost ?? null,
        job_type: existingRow?.job_type ?? null,
        transport_date: existingRow?.transport_date ?? null,
        collection_time: existingRow?.collection_time ?? null,
        delivery_date: existingRow?.delivery_date ?? null,
        delivery_time: existingRow?.delivery_time ?? null,
        status: existingRow?.status ?? null,
        agreed_sell_rate: existingRow?.agreed_sell_rate ?? null,
        invoice_status: existingRow?.invoice_status ?? null,
        total_invoice: existingRow?.total_invoice ?? null,
      },
      after: {
        linked_job_id: linkedJobId,
        client_id: clientId,
        vehicle_id: vehicleId,
        operator_id: operatorId,
        supplier_id: supplierId,
        supplier_reference: supplierReference,
        supplier_cost: numberOrNull(formData.get("supplier_cost")),
        job_type: clean(formData.get("job_type")) || null,
        transport_date: transportDate,
        collection_time: collectionTime,
        delivery_date: deliveryDate,
        delivery_time: deliveryTime,
        status: nextStatus,
        agreed_sell_rate: agreedSellRate,
        invoice_status: invoiceStatus,
        total_invoice: totalInvoice,
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
              <DuplicateTransportJobButton transportJobId={params.id} />
            </div>
          </div>

          {error ? <div style={errorBox}>{error.message}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
          {successMessage ? <div style={successBox}>{successMessage}</div> : null}

          {!item ? null : (
            <>
              <div style={summaryGrid}>
                <SummaryCard
                  title="Job Summary"
                  rows={[
                    { label: "Customer", value: client?.company_name ?? "—" },
                    { label: "Job type", value: prettyJobType((item as any)?.job_type) },
                    { label: "Status", value: (item as any)?.status ?? "—" },
                    { label: "Collection date", value: fmtDate((item as any)?.transport_date) },
                    { label: "Delivery date", value: fmtDate((item as any)?.delivery_date) },
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
                      defaultValue={(item as any)?.job_type ?? "haulage"}
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

                    <Field
                      id="agreed_sell_rate"
                      label="Charge rate"
                      name="agreed_sell_rate"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any)?.agreed_sell_rate ?? (item as any)?.price ?? 0)}
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

                  {(supplierFromLookup || isOtherSupplier || looksLikeCrossHire(item)) ? (
                    <div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
                      Current supplier: {supplierFromLookup?.company_name ?? parsedOtherSupplier.otherSupplierName ?? "—"}
                    </div>
                  ) : null}
                </details>

                <details id="invoice_details_section" open style={detailsCard}>
                  <summary style={detailsSummary}>Invoice details</summary>
                  <div style={detailsHelp}>
                    Invoice VAT and total are calculated automatically from the subtotal.
                  </div>

                  <div style={gridStyle}>
                    <SelectField
                      label="Invoice status"
                      name="invoice_status"
                      defaultValue={(item as any)?.invoice_status ?? "Not Invoiced"}
                      options={INVOICE_STATUSES.map((status) => ({
                        value: status,
                        label: status,
                      }))}
                    />

                    <Field
                      label="Invoice number"
                      name="invoice_number"
                      defaultValue={(item as any)?.invoice_number ?? ""}
                    />

                    <Field
                      label="Invoice created"
                      name="invoice_created_at"
                      type="date"
                      defaultValue={(item as any)?.invoice_created_at ?? ""}
                    />

                    <Field
                      label="Invoice due"
                      name="invoice_due_at"
                      type="date"
                      defaultValue={(item as any)?.invoice_due_at ?? ""}
                    />

                    <Field
                      id="invoice_subtotal"
                      label="Invoice subtotal"
                      name="invoice_subtotal"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any)?.invoice_subtotal ?? (item as any)?.agreed_sell_rate ?? 0)}
                    />

                    <Field
                      id="invoice_vat"
                      label="Invoice VAT"
                      name="invoice_vat"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any)?.invoice_vat ?? 0)}
                      readOnly
                    />

                    <Field
                      id="total_invoice"
                      label="Total invoice"
                      name="total_invoice"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any)?.total_invoice ?? 0)}
                      readOnly
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={labelStyle}>Invoice notes</label>
                    <textarea
                      name="invoice_notes"
                      rows={3}
                      style={textareaStyle}
                      defaultValue={(item as any)?.invoice_notes ?? ""}
                    />
                  </div>
                </details>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="submit" style={saveBtn}>
                    Save changes
                  </button>
                  <a href="/transport-jobs" style={secondaryBtn}>
                    Back to jobs
                  </a>
                </div>
              </form>

              <TransportJobDetailFormEnhancer />
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
    <div style={summaryCard}>
      <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row, index) => (
          <div key={`${title}-${index}`} style={summaryRow}>
            <div style={summaryLabel}>{row.label}</div>
            <div style={summaryValue}>{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  readOnly = false,
  step,
}: {
  id?: string;
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
  step?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        id={id}
        name={name}
        defaultValue={defaultValue}
        type={type}
        placeholder={placeholder}
        style={inputStyle}
        readOnly={readOnly}
        step={step}
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
      <label style={labelStyle}>{label}</label>
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
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const summaryCard: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const summaryRow: React.CSSProperties = {
  display: "grid",
  gap: 4,
};

const summaryLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.72,
  fontWeight: 800,
};

const summaryValue: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.22)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const detailsCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.22)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const detailsSummary: React.CSSProperties = {
  cursor: "pointer",
  fontSize: 18,
  fontWeight: 900,
};

const detailsHelp: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.78,
  marginTop: 8,
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  marginBottom: 8,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
  resize: "vertical",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const saveBtn: React.CSSProperties = {
  ...primaryBtn,
};

const successBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#111",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.22)",
};
