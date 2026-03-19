import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import { geocodeAddress } from "../../lib/geocode";

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

function generateTransportNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const stamp = `${d.getHours()}${d.getMinutes()}${d.getSeconds()}`;
  return `TR-${y}${m}${day}-${stamp}`;
}

const INVOICE_STATUSES = [
  "Not Invoiced",
  "Invoiced",
  "Part Paid",
  "Paid",
];

async function createTransportJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const transportNumber =
    clean(formData.get("transport_number")) || generateTransportNumber();

  const linkedJobId = clean(formData.get("linked_job_id")) || null;
  const clientId = clean(formData.get("client_id")) || null;
  const vehicleId = clean(formData.get("vehicle_id")) || null;
  const operatorId = clean(formData.get("operator_id")) || null;
  const supplierId = clean(formData.get("supplier_id")) || null;
  const supplierReference = clean(formData.get("supplier_reference")) || null;
  const supplierCost = numberOrNull(formData.get("supplier_cost"));
  const jobType = clean(formData.get("job_type")) || null;

  const collectionAddress = clean(formData.get("collection_address")) || null;
  const deliveryAddress = clean(formData.get("delivery_address")) || null;
  const transportDate = clean(formData.get("transport_date")) || null;
  const collectionTime = clean(formData.get("collection_time")) || null;
  const deliveryTime = clean(formData.get("delivery_time")) || null;
  const loadDescription = clean(formData.get("load_description")) || null;
  const status = clean(formData.get("status")) || "planned";
  const notes = clean(formData.get("notes")) || null;

  const agreedSellRate = numberOrZero(formData.get("agreed_sell_rate"));
  const invoiceStatus = clean(formData.get("invoice_status")) || "Not Invoiced";
  const invoiceNumber = clean(formData.get("invoice_number")) || null;
  const invoiceCreatedAt = clean(formData.get("invoice_created_at")) || null;
  const invoiceDueAt = clean(formData.get("invoice_due_at")) || null;
  const invoiceNotes = clean(formData.get("invoice_notes")) || null;
  const invoiceSubtotal = numberOrZero(formData.get("invoice_subtotal"));
  const invoiceVat = numberOrZero(formData.get("invoice_vat"));
  const totalInvoice = numberOrZero(formData.get("total_invoice"));

  if (!collectionAddress || !deliveryAddress || !transportDate) {
    redirect(
      `/transport-jobs/new?error=${encodeURIComponent(
        "Pickup address, delivery address and transport date are required."
      )}`
    );
  }

  if (!INVOICE_STATUSES.includes(invoiceStatus)) {
    redirect(
      `/transport-jobs/new?error=${encodeURIComponent(
        "Invalid invoice status."
      )}`
    );
  }

  const pickupCoords = collectionAddress
    ? await geocodeAddress(collectionAddress)
    : null;

  const deliveryCoords = deliveryAddress
    ? await geocodeAddress(deliveryAddress)
    : null;

  const payload = {
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
    .insert(payload)
    .select("id, transport_number")
    .single();

  if (error || !data?.id) {
    redirect(
      `/transport-jobs/new?error=${encodeURIComponent(
        error?.message ?? "Could not create transport job."
      )}`
    );
  }

  redirect(
    `/transport-jobs/${data.id}?success=${encodeURIComponent(
      `${data.transport_number} saved.`
    )}`
  );
}

export default async function NewTransportJobPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : "";

  const defaultSellRate = 0;
  const defaultInvoiceSubtotal = money(defaultSellRate);
  const defaultInvoiceVat = money(defaultInvoiceSubtotal * 0.2);
  const defaultInvoiceTotal = money(defaultInvoiceSubtotal + defaultInvoiceVat);

  const [
    { data: clients },
    { data: jobs },
    { data: vehicles },
    { data: operators },
    { data: suppliers },
  ] = await Promise.all([
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
      .eq("status", "active")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("operators")
      .select("id, full_name, status, archived")
      .eq("status", "active")
      .eq("archived", false)
      .order("full_name", { ascending: true }),

    supabase
      .from("suppliers")
      .select("id, company_name, category")
      .order("company_name", { ascending: true }),
  ]);

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={topRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Create Transport Job</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Create haulage, delivery, collection or crane support transport work with sell rate, supplier cost and invoice details.
              </p>
            </div>

            <a href="/transport-jobs" style={btnStyle}>
              ← Back
            </a>
          </div>

          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <form action={createTransportJob} style={{ marginTop: 18, display: "grid", gap: 18 }}>
            <section style={sectionCard}>
              <div style={sectionTitle}>Transport job details</div>

              <div style={gridStyle}>
                <Field
                  label="Transport number"
                  name="transport_number"
                  defaultValue={generateTransportNumber()}
                />

                <SelectField
                  label="Linked crane job"
                  name="linked_job_id"
                  options={(jobs ?? []).map((j: any) => ({
                    value: j.id,
                    label: `Job #${j.job_number ?? "—"}${j.site_name ? ` • ${j.site_name}` : ""}`,
                  }))}
                />

                <SelectField
                  label="Customer"
                  name="client_id"
                  options={(clients ?? []).map((c: any) => ({
                    value: c.id,
                    label: c.company_name ?? "Customer",
                  }))}
                />

                <SelectField
                  label="Vehicle"
                  name="vehicle_id"
                  options={(vehicles ?? []).map((v: any) => ({
                    value: v.id,
                    label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
                  }))}
                />

                <SelectField
                  label="Driver / Operator"
                  name="operator_id"
                  options={(operators ?? []).map((o: any) => ({
                    value: o.id,
                    label: o.full_name ?? "Operator",
                  }))}
                />

                <SelectField
                  label="Job type"
                  name="job_type"
                  defaultValue="haulage"
                  options={[
                    { value: "haulage", label: "haulage" },
                    { value: "delivery", label: "delivery" },
                    { value: "collection", label: "collection" },
                    { value: "ballast", label: "ballast" },
                    { value: "crane_support", label: "crane_support" },
                  ]}
                />

                <Field label="Transport date" name="transport_date" type="date" />
                <Field label="Collection time" name="collection_time" type="time" />
                <Field label="Delivery time" name="delivery_time" type="time" />
                <Field
                  label="Charge rate"
                  name="agreed_sell_rate"
                  type="number"
                  defaultValue={String(defaultSellRate)}
                />

                <SelectField
                  label="Status"
                  name="status"
                  defaultValue="planned"
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
                <label style={labelStyle}>Pickup address</label>
                <textarea
                  name="collection_address"
                  rows={3}
                  style={textareaStyle}
                  placeholder="Enter pickup address"
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Delivery address</label>
                <textarea
                  name="delivery_address"
                  rows={3}
                  style={textareaStyle}
                  placeholder="Enter delivery address"
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Load description</label>
                <textarea
                  name="load_description"
                  rows={3}
                  style={textareaStyle}
                  placeholder="Describe the load, crane parts, ballast, equipment or haulage item"
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  name="notes"
                  rows={5}
                  style={textareaStyle}
                  placeholder="Extra transport instructions"
                />
              </div>
            </section>

            <section style={sectionCard}>
              <div style={sectionTitle}>Cross-hire / supplier details</div>
              <div style={{ fontSize: 13, opacity: 0.78, marginBottom: 12 }}>
                Only fill this in when the transport job is supplier-backed or cross-hired.
              </div>

              <div style={gridStyle}>
                <SelectField
                  label="Supplier"
                  name="supplier_id"
                  options={(suppliers ?? []).map((s: any) => ({
                    value: s.id,
                    label: s.company_name ?? "Supplier",
                  }))}
                />

                <Field
                  label="Supplier reference"
                  name="supplier_reference"
                />

                <Field
                  label="Supplier cost"
                  name="supplier_cost"
                  type="number"
                />
              </div>
            </section>

            <section style={sectionCard}>
              <div style={sectionTitle}>Invoice details</div>

              <div style={gridStyle}>
                <SelectField
                  label="Invoice status"
                  name="invoice_status"
                  defaultValue="Not Invoiced"
                  options={INVOICE_STATUSES.map((status) => ({
                    value: status,
                    label: status,
                  }))}
                />

                <Field
                  label="Invoice number"
                  name="invoice_number"
                />

                <Field
                  label="Invoice created"
                  name="invoice_created_at"
                  type="date"
                />

                <Field
                  label="Invoice due"
                  name="invoice_due_at"
                  type="date"
                />

                <Field
                  label="Invoice subtotal"
                  name="invoice_subtotal"
                  type="number"
                  defaultValue={String(defaultInvoiceSubtotal)}
                />

                <Field
                  label="Invoice VAT"
                  name="invoice_vat"
                  type="number"
                  defaultValue={String(defaultInvoiceVat)}
                />

                <Field
                  label="Total invoice"
                  name="total_invoice"
                  type="number"
                  defaultValue={String(defaultInvoiceTotal)}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Invoice notes</label>
                <textarea
                  name="invoice_notes"
                  rows={3}
                  style={textareaStyle}
                  placeholder="Internal invoice notes"
                />
              </div>
            </section>

            <div>
              <button type="submit" style={saveBtn}>
                Save transport job
              </button>
            </div>
          </form>
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
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        type={type}
        style={inputStyle}
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
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  marginBottom: 12,
};

const topRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
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
