import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import { geocodeAddress } from "../../lib/geocode";
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

async function updateTransportJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect(`/transport-jobs?error=${encodeURIComponent("Transport job id missing.")}`);
  }

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

  const payload = {
    linked_job_id: linkedJobId,
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
    status: normaliseTransportStatus(clean(formData.get("status")) || "planned", {
      clientId,
      vehicleId,
      operatorId,
      transportDate,
      collectionTime,
      deliveryDate,
      deliveryTime,
    }),
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

  redirect(`/transport-jobs/${id}?success=${encodeURIComponent("Transport job updated.")}`);
}

async function cancelJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect(`/transport-jobs?error=${encodeURIComponent("Transport job id missing.")}`);
  }

  const { error } = await supabase
    .from("transport_jobs")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/transport-jobs/${id}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/transport-jobs/${id}?success=${encodeURIComponent("Transport job cancelled.")}`);
}

export default async function TransportJobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const timeOptions = buildTimeOptions();

  const [
    { data: item, error },
    { data: clients },
    { data: jobs },
    { data: vehicles },
    { data: operators },
    { data: suppliers },
  ] = await Promise.all([
    supabase
      .from("transport_jobs")
      .select(`
        *,
        clients:client_id (
          company_name
        ),
        vehicles:vehicle_id (
          name,
          reg_number
        ),
        operators:operator_id (
          full_name
        ),
        jobs:linked_job_id (
          id,
          job_number,
          site_name
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

  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  const client = Array.isArray((item as any)?.clients)
    ? (item as any).clients[0]
    : (item as any)?.clients;

  const vehicle = Array.isArray((item as any)?.vehicles)
    ? (item as any).vehicles[0]
    : (item as any)?.vehicles;

  const driver = Array.isArray((item as any)?.operators)
    ? (item as any).operators[0]
    : (item as any)?.operators;

  const linkedJob = Array.isArray((item as any)?.jobs)
    ? (item as any).jobs[0]
    : (item as any)?.jobs;

  const supplier =
    (suppliers ?? []).find((s: any) => s.id === (item as any)?.supplier_id) ?? null;

  const suggestedSellRate = money((item as any)?.agreed_sell_rate ?? (item as any)?.price ?? 0);
  const suggestedInvoiceSubtotal = money((item as any)?.invoice_subtotal ?? suggestedSellRate);
  const suggestedInvoiceVat = money(
    (item as any)?.invoice_vat ?? (suggestedInvoiceSubtotal > 0 ? suggestedInvoiceSubtotal * 0.2 : 0)
  );
  const suggestedInvoiceTotal = money(
    (item as any)?.total_invoice ?? (suggestedInvoiceSubtotal + suggestedInvoiceVat)
  );
  const showSupplierSection = looksLikeCrossHire(item);

  const parsedOtherSupplier = parseOtherSupplierReference((item as any)?.supplier_reference);
  const isOtherSupplier = !(item as any)?.supplier_id && !!parsedOtherSupplier.otherSupplierName;

  const supplierSummaryValue = supplier?.company_name
    ? supplier.company_name
    : parsedOtherSupplier.otherSupplierName || "—";

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 32 }}>
                {(item as any)?.transport_number ?? "Transport Job"}
              </h1>
              <p style={{ opacity: 0.8, marginTop: 6 }}>
                View and update transport allocation, costing and invoice details.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {item ? <DuplicateTransportJobButton jobId={(item as any).id} /> : null}

              {item && String((item as any).status ?? "").toLowerCase() !== "cancelled" ? (
                <form action={cancelJob}>
                  <input type="hidden" name="id" value={(item as any).id} />
                  <button type="submit" style={cancelBtn}>
                    Cancel transport job
                  </button>
                </form>
              ) : null}

              <a href="/transport-jobs" style={secondaryBtn}>
                ← Back to transport jobs
              </a>

              <a href="/transport-map" style={secondaryBtn}>
                Open control map
              </a>
            </div>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
          {error ? <div style={errorBox}>{error.message}</div> : null}

          {!item ? (
            <div style={errorBox}>Transport job not found.</div>
          ) : (
            <div style={pageGrid}>
              <section style={sectionCard}>
                <h2 style={sectionTitle}>Transport job details</h2>
                <div style={sectionHelp}>
                  Update core planning, allocation, supplier and invoice details for this transport job.
                </div>

                <form action={updateTransportJob} style={{ display: "grid", gap: 14 }}>
                  <input type="hidden" name="id" value={(item as any).id} />

                  <div style={gridStyle}>
                    <Field
                      label="Reference"
                      name="transport_number_readonly"
                      defaultValue={(item as any).transport_number ?? ""}
                      disabled
                    />

                    <SelectField
                      label="Linked crane job"
                      name="linked_job_id"
                      defaultValue={(item as any).linked_job_id ?? ""}
                      options={(jobs ?? []).map((j: any) => ({
                        value: j.id,
                        label: `Job #${j.job_number ?? "—"}${j.site_name ? ` • ${j.site_name}` : ""}`,
                      }))}
                    />

                    <SelectField
                      label="Customer"
                      name="client_id"
                      defaultValue={(item as any).client_id ?? ""}
                      options={(clients ?? []).map((c: any) => ({
                        value: c.id,
                        label: c.company_name ?? "Customer",
                      }))}
                    />

                    <SelectField
                      label="Vehicle"
                      name="vehicle_id"
                      defaultValue={(item as any).vehicle_id ?? ""}
                      options={(vehicles ?? []).map((v: any) => ({
                        value: v.id,
                        label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
                      }))}
                    />

                    <SelectField
                      label="Driver"
                      name="operator_id"
                      defaultValue={(item as any).operator_id ?? ""}
                      options={(operators ?? []).map((o: any) => ({
                        value: o.id,
                        label: o.full_name ?? "Driver",
                      }))}
                    />

                    <SelectField
                      label="Job type"
                      name="job_type"
                      defaultValue={(item as any).job_type ?? ""}
                      options={[
                        { value: "haulage", label: "haulage" },
                        { value: "delivery", label: "delivery" },
                        { value: "collection", label: "collection" },
                        { value: "ballast", label: "ballast" },
                        { value: "crane_support", label: "crane_support" },
                      ]}
                    />

                    <Field
                      id="transport_date"
                      label="Collection date"
                      name="transport_date"
                      type="date"
                      defaultValue={(item as any).transport_date ?? ""}
                    />

                    <SelectField
                      id="collection_time"
                      label="Collection time"
                      name="collection_time"
                      defaultValue={(item as any).collection_time ?? ""}
                      options={timeOptions}
                    />

                    <Field
                      id="delivery_date"
                      label="Delivery date"
                      name="delivery_date"
                      type="date"
                      defaultValue={(item as any).delivery_date ?? (item as any).transport_date ?? ""}
                    />

                    <SelectField
                      id="delivery_time"
                      label="Delivery time"
                      name="delivery_time"
                      defaultValue={(item as any).delivery_time ?? ""}
                      options={timeOptions}
                    />

                    <SelectField
                      label="Status"
                      name="status"
                      defaultValue={(item as any).status ?? "planned"}
                      options={[
                        { value: "planned", label: "planned" },
                        { value: "confirmed", label: "confirmed" },
                        { value: "in_progress", label: "in_progress" },
                        { value: "completed", label: "completed" },
                        { value: "cancelled", label: "cancelled" },
                      ]}
                    />

                    <Field
                      id="agreed_sell_rate"
                      label="Charge rate"
                      name="agreed_sell_rate"
                      type="number"
                      step="0.01"
                      defaultValue={String(suggestedSellRate)}
                    />
                  </div>

                  <details
                    id="supplier_details_section"
                    open={showSupplierSection}
                    style={detailsCard}
                  >
                    <summary style={detailsSummary}>Cross-hire / supplier details</summary>

                    <div style={detailsHelp}>
                      Only use this section when this transport is supplier-backed or cross-hired.
                    </div>

                    <div style={gridStyle}>
                      <SelectField
                        id="supplier_id"
                        label="Supplier"
                        name="supplier_id"
                        defaultValue={isOtherSupplier ? "other" : (item as any).supplier_id ?? ""}
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
                            : (item as any).supplier_reference ?? ""
                        }
                      />

                      <Field
                        id="supplier_cost"
                        label="Supplier cost"
                        name="supplier_cost"
                        type="number"
                        step="0.01"
                        defaultValue={String((item as any).supplier_cost ?? "")}
                      />
                    </div>
                  </details>

                  <details
                    id="invoice_details_section"
                    open
                    style={detailsCard}
                  >
                    <summary style={detailsSummary}>Invoice details</summary>

                    <div style={detailsHelp}>
                      Invoice VAT and total are calculated automatically from the subtotal.
                    </div>

                    <div style={gridStyle}>
                      <SelectField
                        label="Invoice status"
                        name="invoice_status"
                        defaultValue={(item as any).invoice_status ?? "Not Invoiced"}
                        options={INVOICE_STATUSES.map((status) => ({
                          value: status,
                          label: status,
                        }))}
                      />

                      <Field
                        label="Invoice number"
                        name="invoice_number"
                        defaultValue={(item as any).invoice_number ?? ""}
                      />

                      <Field
                        label="Invoice created"
                        name="invoice_created_at"
                        type="date"
                        defaultValue={
                          (item as any).invoice_created_at
                            ? String((item as any).invoice_created_at).slice(0, 10)
                            : ""
                        }
                      />

                      <Field
                        label="Invoice due"
                        name="invoice_due_at"
                        type="date"
                        defaultValue={
                          (item as any).invoice_due_at
                            ? String((item as any).invoice_due_at).slice(0, 10)
                            : ""
                        }
                      />

                      <Field
                        id="invoice_subtotal"
                        label="Invoice subtotal"
                        name="invoice_subtotal"
                        type="number"
                        step="0.01"
                        defaultValue={String(suggestedInvoiceSubtotal)}
                      />

                      <Field
                        id="invoice_vat"
                        label="Invoice VAT"
                        name="invoice_vat"
                        type="number"
                        step="0.01"
                        defaultValue={String(suggestedInvoiceVat)}
                        readOnly
                      />

                      <Field
                        id="total_invoice"
                        label="Total invoice"
                        name="total_invoice"
                        type="number"
                        step="0.01"
                        defaultValue={String(suggestedInvoiceTotal)}
                        readOnly
                      />
                    </div>

                    <FullWidthField
                      label="Invoice notes"
                      name="invoice_notes"
                      defaultValue={(item as any).invoice_notes ?? ""}
                    />
                  </details>

                  <FullWidthField
                    label="Collection address"
                    name="collection_address"
                    defaultValue={(item as any).collection_address ?? ""}
                  />

                  <FullWidthField
                    label="Delivery address"
                    name="delivery_address"
                    defaultValue={(item as any).delivery_address ?? ""}
                  />

                  <FullWidthField
                    label="Load description"
                    name="load_description"
                    defaultValue={(item as any).load_description ?? ""}
                  />

                  <FullWidthField
                    label="Notes"
                    name="notes"
                    defaultValue={(item as any).notes ?? ""}
                  />

                  <div style={stickySaveBar}>
                    <div style={{ fontSize: 13, opacity: 0.78, fontWeight: 700 }}>
                      Check dates, allocation, supplier details and invoice values before saving.
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <a href="/transport-jobs" style={secondaryActionBtn}>
                        Back
                      </a>
                      <button type="submit" style={primaryBtn}>
                        Update transport job
                      </button>
                    </div>
                  </div>
                </form>
              </section>

              <section style={sectionCard}>
                <h2 style={sectionTitle}>Quick summary</h2>

                <InfoRow label="Customer" value={client?.company_name ?? "—"} />
                <InfoRow label="Vehicle" value={vehicle?.name ?? "—"} />
                <InfoRow label="Driver" value={driver?.full_name ?? "—"} />
                <InfoRow label="Supplier" value={supplierSummaryValue} />
                <InfoRow
                  label="Linked crane job"
                  value={linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}
                />
                <InfoRow label="Collection date" value={(item as any).transport_date ?? "—"} />
                <InfoRow label="Collection time" value={(item as any).collection_time ?? "—"} />
                <InfoRow label="Delivery date" value={(item as any).delivery_date ?? (item as any).transport_date ?? "—"} />
                <InfoRow label="Delivery time" value={(item as any).delivery_time ?? "—"} />
                <InfoRow label="Status" value={(item as any).status ?? "—"} />
                <InfoRow label="Charge rate" value={fmtMoney((item as any).agreed_sell_rate ?? (item as any).price)} />
                <InfoRow label="Supplier cost" value={fmtMoney((item as any).supplier_cost)} />
                <InfoRow label="Invoice status" value={(item as any).invoice_status ?? "Not Invoiced"} />
                <InfoRow label="Invoice subtotal" value={fmtMoney((item as any).invoice_subtotal ?? suggestedInvoiceSubtotal)} />
                <InfoRow label="Invoice VAT" value={fmtMoney((item as any).invoice_vat ?? suggestedInvoiceVat)} />
                <InfoRow label="Total invoice" value={fmtMoney((item as any).total_invoice ?? suggestedInvoiceTotal)} />
              </section>
            </div>
          )}

          <TransportJobDetailFormEnhancer />
        </div>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  disabled = false,
  id,
  step,
  placeholder,
  readOnly = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  disabled?: boolean;
  id?: string;
  step?: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        id={id}
        name={name}
        defaultValue={defaultValue}
        type={type}
        step={step}
        placeholder={placeholder}
        style={readOnly ? readOnlyInputStyle : inputStyle}
        disabled={disabled}
        readOnly={readOnly}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  id,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
  id?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select id={id} name={name} defaultValue={defaultValue} style={inputStyle}>
        <option value="">— Select —</option>
        {options.map((o) => (
          <option key={`${name}-${o.value}`} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FullWidthField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea name={name} defaultValue={defaultValue} rows={3} style={textareaStyle} />
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={infoRow}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
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

const pageGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.15fr 0.85fr",
  gap: 16,
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const detailsCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.22)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 12,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 8,
  fontSize: 22,
};

const sectionHelp: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.76,
  marginBottom: 12,
};

const detailsSummary: React.CSSProperties = {
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 16,
};

const detailsHelp: React.CSSProperties = {
  marginTop: 10,
  marginBottom: 12,
  fontSize: 13,
  opacity: 0.78,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const infoRow: React.CSSProperties = {
  padding: "10px 0",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

const infoLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 800,
};

const infoValue: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 900,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const readOnlyInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: "rgba(240,240,240,0.95)",
  color: "#333",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
  resize: "vertical",
};

const stickySaveBar: React.CSSProperties = {
  position: "sticky",
  bottom: 12,
  zIndex: 5,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  padding: "14px 16px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.88)",
  border: "1px solid rgba(0,0,0,0.10)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const secondaryActionBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const cancelBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#ef4444",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
};

const successBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#0b7a4b",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
