import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";
import { writeAuditLog } from "../../../lib/audit";
import TransportJobDetailFormEnhancer from "./TransportJobDetailFormEnhancer";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function numberOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function numberOrZero(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function moneyNumber(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
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

function transportTypeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "—";
  if (raw === "on_site_hiab") return "On-site HIAB";
  if (raw === "crane_support") return "Crane support";
  return raw.replaceAll("_", " ");
}

async function updateTransportJob(id: string, formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const linkedJobId = clean(formData.get("linked_job_id")) || null;
  const linkedTransportJobIdRaw = clean(formData.get("linked_transport_job_id")) || null;
  const linkedTransportJobId = linkedTransportJobIdRaw === id ? null : linkedTransportJobIdRaw;
  const clientId = clean(formData.get("client_id")) || null;
  const vehicleId = clean(formData.get("vehicle_id")) || null;
  const operatorId = clean(formData.get("operator_id")) || null;
  const jobType = clean(formData.get("job_type")) || null;
  const collectionAddress = clean(formData.get("collection_address")) || null;
  const deliveryAddress = clean(formData.get("delivery_address")) || null;
  const transportDate = clean(formData.get("transport_date")) || null;
  const collectionTime = clean(formData.get("collection_time")) || null;
  const deliveryDate = clean(formData.get("delivery_date")) || transportDate || null;
  const deliveryTime = clean(formData.get("delivery_time")) || null;
  const loadDescription = clean(formData.get("load_description")) || null;
  const status = clean(formData.get("status")) || "planned";
  const notes = clean(formData.get("notes")) || null;
  const supplierId = clean(formData.get("supplier_id")) || null;
  const supplierReference = clean(formData.get("supplier_reference")) || null;
  const supplierCost = numberOrNull(formData.get("supplier_cost"));
  const agreedSellRate = numberOrZero(formData.get("agreed_sell_rate"));
  const invoiceStatus = clean(formData.get("invoice_status")) || "Not Invoiced";
  const invoiceNumber = clean(formData.get("invoice_number")) || null;
  const invoiceCreatedAt = clean(formData.get("invoice_created_at")) || null;
  const invoiceDueAt = clean(formData.get("invoice_due_at")) || null;
  const invoiceNotes = clean(formData.get("invoice_notes")) || null;
  const invoiceSubtotalInput = numberOrZero(formData.get("invoice_subtotal"));
  const invoiceSubtotal = invoiceSubtotalInput > 0 ? invoiceSubtotalInput : agreedSellRate;
  const invoiceVat = moneyNumber(invoiceSubtotal * 0.2);
  const totalInvoice = moneyNumber(invoiceSubtotal + invoiceVat);

  if (!clientId || !collectionAddress || !transportDate) {
    redirect(
      `/transport-jobs/${id}?error=${encodeURIComponent(
        "Customer, site / pickup address and collection date are required."
      )}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current, error: currentError } = await supabase
    .from("transport_jobs")
    .select("id, transport_number")
    .eq("id", id)
    .single();

  if (currentError || !current) {
    redirect(
      `/transport-jobs?error=${encodeURIComponent(
        currentError?.message || "Transport job not found."
      )}`
    );
  }

  const { error } = await supabase
    .from("transport_jobs")
    .update({
      linked_job_id: linkedJobId,
      linked_transport_job_id: linkedTransportJobId,
      client_id: clientId,
      vehicle_id: vehicleId,
      operator_id: operatorId,
      supplier_id: supplierId,
      supplier_reference: supplierReference,
      supplier_cost: supplierCost,
      job_type: jobType,
      collection_address: collectionAddress,
      delivery_address: deliveryAddress,
      transport_date: transportDate,
      collection_time: collectionTime,
      delivery_date: deliveryDate,
      delivery_time: deliveryTime,
      load_description: loadDescription,
      status,
      agreed_sell_rate: agreedSellRate,
      price: agreedSellRate,
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
    })
    .eq("id", id);

  if (error) {
    redirect(
      `/transport-jobs/${id}?error=${encodeURIComponent(error.message)}`
    );
  }

  await writeAuditLog({
    actor_user_id: user?.id ?? null,
    actor_username: fromAuthEmail(user?.email ?? null) || null,
    action: "transport_job_updated",
    entity_type: "transport_job",
    entity_id: id,
    meta: {
      transport_number: current.transport_number,
      linked_job_id: linkedJobId,
      linked_transport_job_id: linkedTransportJobId,
      client_id: clientId,
      vehicle_id: vehicleId,
      operator_id: operatorId,
      supplier_id: supplierId,
      job_type: jobType,
      transport_date: transportDate,
      delivery_date: deliveryDate,
      status,
      agreed_sell_rate: agreedSellRate,
      invoice_status: invoiceStatus,
    },
  });

  redirect(
    `/transport-jobs/${id}?success=${encodeURIComponent(
      `${current.transport_number} updated.`
    )}`
  );
}

export default async function TransportJobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; success?: string };
}) {
  const supabase = createSupabaseServerClient();
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";
  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const timeOptions = buildTimeOptions();

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
          email,
          phone
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
        suppliers:supplier_id (
          id,
          company_name,
          email,
          phone,
          category
        ),
        linked_job:linked_job_id (
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
      .select("id, name, reg_number, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("operators")
      .select("id, full_name, archived")
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
  const supplier = first((item as any)?.suppliers);
  const linkedJob = first((item as any)?.linked_job);
  const linkedTransport = first((item as any)?.linked_transport);

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={topRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>
                {(item as any)?.transport_number ?? "Transport Job"}
              </h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                View and update transport job details.
              </p>
            </div>

            <a href="/transport-jobs" style={btnStyle}>
              ← Back
            </a>
          </div>

          {error ? <div style={errorBox}>{error.message}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
          {successMessage ? <div style={successBox}>{successMessage}</div> : null}

          {!item ? null : (
            <>
              <div style={summaryGrid}>
                <InfoRow label="Customer" value={client?.company_name ?? "—"} />
                <InfoRow label="Vehicle" value={`${vehicle?.name ?? "—"}${vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}`} />
                <InfoRow label="Operator" value={operator?.full_name ?? "—"} />
                <InfoRow label="Job type" value={transportTypeLabel((item as any).job_type)} />
                <InfoRow label="Collection date" value={fmtDate((item as any).transport_date)} />
                <InfoRow label="Delivery date" value={fmtDate((item as any).delivery_date)} />
                <InfoRow label="Linked crane job" value={linkedJob?.job_number ? `Job #${linkedJob.job_number}${linkedJob.site_name ? ` • ${linkedJob.site_name}` : ""}` : "—"} />
                <InfoRow
                  label="Linked transport job"
                  value={
                    linkedTransport?.transport_number
                      ? `${linkedTransport.transport_number}${linkedTransport.transport_date ? ` • ${linkedTransport.transport_date}` : ""}${linkedTransport.delivery_date && linkedTransport.delivery_date !== linkedTransport.transport_date ? ` → ${linkedTransport.delivery_date}` : ""}`
                      : "—"
                  }
                />
              </div>

              <form action={updateTransportJob.bind(null, params.id)} style={{ marginTop: 18, display: "grid", gap: 18 }}>
                <section style={sectionCard}>
                  <div style={sectionTitle}>Transport job details</div>
                  <div
                    id="on_site_hiab_notice"
                    style={{
                      display: "none",
                      marginBottom: 12,
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "rgba(0,120,255,0.10)",
                      border: "1px solid rgba(0,120,255,0.18)",
                      fontWeight: 700,
                    }}
                  >
                    On-site HIAB mode: use the first address as the main site location. The second address can be left
                    the same or used for a work area / secondary location on the same site.
                  </div>

                  <div style={gridStyle}>
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
                      label="Linked transport job"
                      name="linked_transport_job_id"
                      defaultValue={(item as any).linked_transport_job_id ?? ""}
                      options={(transportJobs ?? [])
                        .filter((j: any) => j.id !== (item as any).id)
                        .map((j: any) => ({
                          value: j.id,
                          label: `${j.transport_number ?? "Transport Job"}${j.transport_date ? ` • ${j.transport_date}` : ""}${j.delivery_date && j.delivery_date !== j.transport_date ? ` → ${j.delivery_date}` : ""}`,
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
                      label="Driver / Operator"
                      name="operator_id"
                      defaultValue={(item as any).operator_id ?? ""}
                      options={(operators ?? []).map((o: any) => ({
                        value: o.id,
                        label: o.full_name ?? "Operator",
                      }))}
                    />

                    <SelectField
                      id="job_type"
                      label="Job type"
                      name="job_type"
                      defaultValue={(item as any).job_type ?? "haulage"}
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
                      defaultValue={(item as any).delivery_date ?? ""}
                    />

                    <SelectField
                      id="delivery_time"
                      label="Delivery time"
                      name="delivery_time"
                      defaultValue={(item as any).delivery_time ?? ""}
                      options={timeOptions}
                    />

                    <Field
                      id="agreed_sell_rate"
                      label="Charge rate"
                      name="agreed_sell_rate"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any).agreed_sell_rate ?? 0)}
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
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label id="collection_address_label" style={labelStyle}>Pickup address</label>
                    <textarea
                      id="collection_address"
                      name="collection_address"
                      rows={3}
                      style={textareaStyle}
                      defaultValue={(item as any).collection_address ?? ""}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label id="delivery_address_label" style={labelStyle}>Delivery address</label>
                    <textarea
                      id="delivery_address"
                      name="delivery_address"
                      rows={3}
                      style={textareaStyle}
                      defaultValue={(item as any).delivery_address ?? ""}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label id="load_description_label" style={labelStyle}>Load description</label>
                    <textarea
                      id="load_description"
                      name="load_description"
                      rows={3}
                      style={textareaStyle}
                      defaultValue={(item as any).load_description ?? ""}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={labelStyle}>Notes</label>
                    <textarea
                      name="notes"
                      rows={5}
                      style={textareaStyle}
                      defaultValue={(item as any).notes ?? ""}
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
                      step="0.01"
                      defaultValue={String((item as any).supplier_cost ?? "")}
                    />
                  </div>
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
                      defaultValue={(item as any).invoice_status ?? "Not Invoiced"}
                      options={[
                        { value: "Not Invoiced", label: "Not Invoiced" },
                        { value: "Invoiced", label: "Invoiced" },
                        { value: "Part Paid", label: "Part Paid" },
                        { value: "Paid", label: "Paid" },
                      ]}
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
                      defaultValue={(item as any).invoice_created_at ?? ""}
                    />

                    <Field
                      label="Invoice due"
                      name="invoice_due_at"
                      type="date"
                      defaultValue={(item as any).invoice_due_at ?? ""}
                    />

                    <Field
                      id="invoice_subtotal"
                      label="Invoice subtotal"
                      name="invoice_subtotal"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any).invoice_subtotal ?? (item as any).agreed_sell_rate ?? 0)}
                    />

                    <Field
                      id="invoice_vat"
                      label="Invoice VAT"
                      name="invoice_vat"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any).invoice_vat ?? 0)}
                      readOnly
                    />

                    <Field
                      id="total_invoice"
                      label="Total invoice"
                      name="total_invoice"
                      type="number"
                      step="0.01"
                      defaultValue={String((item as any).total_invoice ?? 0)}
                      readOnly
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={labelStyle}>Invoice notes</label>
                    <textarea
                      name="invoice_notes"
                      rows={3}
                      style={textareaStyle}
                      defaultValue={(item as any).invoice_notes ?? ""}
                    />
                  </div>
                </details>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="submit" style={saveBtn}>
                    Save changes
                  </button>
                  <a href="/transport-jobs" style={btnStyle}>
                    Back to jobs
                  </a>
                </div>
              </form>

              <div style={sideGrid}>
                <InfoCard
                  title="Customer"
                  rows={[
                    { label: "Company", value: client?.company_name ?? "—" },
                    { label: "Contact", value: client?.contact_name ?? "—" },
                    { label: "Phone", value: client?.phone ?? "—" },
                    { label: "Email", value: client?.email ?? "—" },
                  ]}
                />

                <InfoCard
                  title="Vehicle / Operator"
                  rows={[
                    { label: "Vehicle", value: `${vehicle?.name ?? "—"}${vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}` },
                    { label: "Operator", value: operator?.full_name ?? "—" },
                    { label: "Operator phone", value: operator?.phone ?? "—" },
                    { label: "Operator email", value: operator?.email ?? "—" },
                  ]}
                />

                <InfoCard
                  title="Supplier / Invoice"
                  rows={[
                    { label: "Supplier", value: supplier?.company_name ?? "—" },
                    { label: "Supplier phone", value: supplier?.phone ?? "—" },
                    { label: "Supplier email", value: supplier?.email ?? "—" },
                    { label: "Supplier category", value: supplier?.category ?? "—" },
                    { label: "Invoice status", value: (item as any).invoice_status ?? "—" },
                    { label: "Invoice total", value: money((item as any).total_invoice) },
                  ]}
                />
              </div>

              <TransportJobDetailFormEnhancer />
            </>
          )}
        </div>
      </div>
    </ClientShell>
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

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={infoRowStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

function InfoCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <div style={detailsCard}>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row, index) => (
          <InfoRow key={`${title}-${index}`} label={row.label} value={row.value} />
        ))}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
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

const topRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
  marginTop: 18,
};

const sideGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
  marginTop: 18,
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

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const saveBtn: React.CSSProperties = {
  padding: "10px 16px",
  background: "#111",
  color: "#fff",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const successBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.25)",
};

const infoRowStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.30)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const infoLabelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.74,
  fontWeight: 800,
};

const infoValueStyle: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 900,
};
