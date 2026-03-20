import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import { geocodeAddress } from "../../lib/geocode";
import DuplicateTransportJobButton from "./DuplicateTransportJobButton";

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


function toMinutes(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normaliseTransportStatus(input: string | null, fields: {
  clientId: string | null;
  vehicleId: string | null;
  operatorId: string | null;
  transportDate: string | null;
  collectionTime: string | null;
  deliveryTime: string | null;
}) {
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
    !!fields.deliveryTime;

  return canConfirm ? "confirmed" : "planned";
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

  const agreedSellRate = numberOrZero(formData.get("agreed_sell_rate"));
  const invoiceSubtotalRaw = numberOrZero(formData.get("invoice_subtotal"));
  const invoiceVat = numberOrZero(formData.get("invoice_vat"));
  const totalInvoiceRaw = numberOrZero(formData.get("total_invoice"));
  const invoiceSubtotal = invoiceSubtotalRaw > 0 ? invoiceSubtotalRaw : agreedSellRate;
  const totalInvoice = totalInvoiceRaw > 0 ? totalInvoiceRaw : invoiceSubtotal + invoiceVat;

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
  const deliveryTime = clean(formData.get("delivery_time")) || null;

  const collectionMinutes = toMinutes(collectionTime);
  const deliveryMinutes = toMinutes(deliveryTime);

  if (
    collectionTime &&
    deliveryTime &&
    collectionMinutes !== null &&
    deliveryMinutes !== null &&
    collectionMinutes > deliveryMinutes
  ) {
    redirect(`/transport-jobs/${id}?error=${encodeURIComponent("Delivery time cannot be earlier than collection time.")}`);
  }

  const payload = {
    linked_job_id: linkedJobId,
    client_id: clientId,
    vehicle_id: vehicleId,
    operator_id: operatorId,
    supplier_id: clean(formData.get("supplier_id")) || null,
    supplier_reference: clean(formData.get("supplier_reference")) || null,
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
    delivery_time: deliveryTime,
    load_description: clean(formData.get("load_description")) || null,
    status: normaliseTransportStatus(clean(formData.get("status")) || "planned", {
      clientId,
      vehicleId,
      operatorId,
      transportDate,
      collectionTime,
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
                      label="Transport date"
                      name="transport_date"
                      type="date"
                      defaultValue={(item as any).transport_date ?? ""}
                    />

                    <SelectField
                      label="Collection time"
                      name="collection_time"
                      defaultValue={(item as any).collection_time ?? ""}
                      options={timeOptions}
                    />

                    <SelectField
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
                      label="Charge rate"
                      name="agreed_sell_rate"
                      type="number"
                      defaultValue={String(suggestedSellRate)}
                    />
                  </div>

                  <details
                    open={showSupplierSection}
                    style={{
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 12,
                      padding: 12,
                      background: "rgba(255,255,255,0.22)",
                    }}
                  >
                    <summary style={{ cursor: "pointer", fontWeight: 900 }}>
                      Cross-hire / supplier details
                    </summary>

                    <div style={{ marginTop: 10, fontSize: 13, opacity: 0.78 }}>
                      Only use this section when this transport is supplier-backed or cross-hired.
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 12,
                        marginTop: 12,
                      }}
                    >
                      <SelectField
                        label="Supplier"
                        name="supplier_id"
                        defaultValue={(item as any).supplier_id ?? ""}
                        options={(suppliers ?? []).map((s: any) => ({
                          value: s.id,
                          label: s.company_name ?? "Supplier",
                        }))}
                      />

                      <Field
                        label="Supplier reference"
                        name="supplier_reference"
                        defaultValue={(item as any).supplier_reference ?? ""}
                      />

                      <Field
                        label="Supplier cost"
                        name="supplier_cost"
                        type="number"
                        defaultValue={String((item as any).supplier_cost ?? "")}
                      />
                    </div>
                  </details>

                  <section
                    style={{
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 12,
                      padding: 12,
                      background: "rgba(255,255,255,0.22)",
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>Invoice details</div>

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
                        label="Invoice subtotal"
                        name="invoice_subtotal"
                        type="number"
                        defaultValue={String(suggestedInvoiceSubtotal)}
                      />

                      <Field
                        label="Invoice VAT"
                        name="invoice_vat"
                        type="number"
                        defaultValue={String(suggestedInvoiceVat)}
                      />

                      <Field
                        label="Total invoice"
                        name="total_invoice"
                        type="number"
                        defaultValue={String(suggestedInvoiceTotal)}
                      />
                    </div>

                    <FullWidthField
                      label="Invoice notes"
                      name="invoice_notes"
                      defaultValue={(item as any).invoice_notes ?? ""}
                    />
                  </section>

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

                  <div>
                    <button type="submit" style={primaryBtn}>
                      Update transport job
                    </button>
                  </div>
                </form>
              </section>

              <section style={sectionCard}>
                <h2 style={sectionTitle}>Quick summary</h2>

                <InfoRow label="Customer" value={client?.company_name ?? "—"} />
                <InfoRow label="Vehicle" value={vehicle?.name ?? "—"} />
                <InfoRow label="Driver" value={driver?.full_name ?? "—"} />
                <InfoRow label="Supplier" value={supplier?.company_name ?? "—"} />
                <InfoRow
                  label="Linked crane job"
                  value={linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}
                />
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
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        type={type}
        style={inputStyle}
        disabled={disabled}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select name={name} defaultValue={defaultValue} style={inputStyle}>
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

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
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

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
  resize: "vertical",
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
