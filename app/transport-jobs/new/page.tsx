"use client";

import ClientShell from "../../ClientShell";
import { useMemo, useState } from "react";

function clean(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function numberOrZero(value: string | number | null | undefined) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
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

type Option = {
  value: string;
  label: string;
};

export default function NewTransportJobPage() {
  const transportNumber = useMemo(() => generateTransportNumber(), []);

  const [linkedJobId, setLinkedJobId] = useState("");
  const [clientId, setClientId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [supplierCost, setSupplierCost] = useState("");
  const [jobType, setJobType] = useState("haulage");
  const [collectionAddress, setCollectionAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [transportDate, setTransportDate] = useState("");
  const [collectionTime, setCollectionTime] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [loadDescription, setLoadDescription] = useState("");
  const [status, setStatus] = useState("planned");
  const [notes, setNotes] = useState("");

  const [agreedSellRate, setAgreedSellRate] = useState("0");
  const [invoiceStatus, setInvoiceStatus] = useState("Not Invoiced");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceCreatedAt, setInvoiceCreatedAt] = useState("");
  const [invoiceDueAt, setInvoiceDueAt] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");

  const [invoiceSubtotal, setInvoiceSubtotal] = useState("0");
  const [invoiceVat, setInvoiceVat] = useState("0");
  const [totalInvoice, setTotalInvoice] = useState("0");

  const [subtotalTouched, setSubtotalTouched] = useState(false);
  const [vatTouched, setVatTouched] = useState(false);
  const [totalTouched, setTotalTouched] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const clients: Option[] = [];
  const jobs: Option[] = [];
  const vehicles: Option[] = [];
  const operators: Option[] = [];
  const suppliers: Option[] = [];

  function updateFromCharge(nextCharge: string) {
    const charge = money(numberOrZero(nextCharge));
    const autoSubtotal = charge;
    const autoVat = money(autoSubtotal * 0.2);
    const autoTotal = money(autoSubtotal + autoVat);

    if (!subtotalTouched) setInvoiceSubtotal(String(autoSubtotal));
    if (!vatTouched) setInvoiceVat(String(autoVat));
    if (!totalTouched) setTotalInvoice(String(autoTotal));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/transport-jobs/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transport_number: clean(transportNumber),
          linked_job_id: clean(linkedJobId) || null,
          client_id: clean(clientId) || null,
          vehicle_id: clean(vehicleId) || null,
          operator_id: clean(operatorId) || null,
          supplier_id: clean(supplierId) || null,
          supplier_reference: clean(supplierReference) || null,
          supplier_cost: clean(supplierCost) ? numberOrZero(supplierCost) : null,
          job_type: clean(jobType) || null,
          collection_address: clean(collectionAddress) || null,
          delivery_address: clean(deliveryAddress) || null,
          transport_date: clean(transportDate) || null,
          collection_time: clean(collectionTime) || null,
          delivery_time: clean(deliveryTime) || null,
          load_description: clean(loadDescription) || null,
          status: clean(status) || "planned",
          price: numberOrZero(agreedSellRate),
          agreed_sell_rate: numberOrZero(agreedSellRate),
          invoice_status: clean(invoiceStatus) || "Not Invoiced",
          invoice_number: clean(invoiceNumber) || null,
          invoice_created_at: clean(invoiceCreatedAt) || null,
          invoice_due_at: clean(invoiceDueAt) || null,
          invoice_notes: clean(invoiceNotes) || null,
          invoice_subtotal: numberOrZero(invoiceSubtotal),
          invoice_vat: numberOrZero(invoiceVat),
          total_invoice: numberOrZero(totalInvoice),
          notes: clean(notes) || null,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorMessage(json?.error || "Could not create transport job.");
        return;
      }

      if (json?.id) {
        window.location.href = `/transport-jobs/${json.id}?success=${encodeURIComponent(
          `${json.transport_number ?? transportNumber} saved.`
        )}`;
        return;
      }

      window.location.href = "/transport-jobs";
    } catch {
      setErrorMessage("Could not create transport job.");
    } finally {
      setSaving(false);
    }
  }

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

          <form onSubmit={handleSubmit} style={{ marginTop: 18, display: "grid", gap: 18 }}>
            <section style={sectionCard}>
              <div style={sectionTitle}>Transport job details</div>

              <div style={gridStyle}>
                <Field
                  label="Transport number"
                  name="transport_number"
                  value={transportNumber}
                  onChange={() => {}}
                  disabled
                />

                <SelectField
                  label="Linked crane job"
                  name="linked_job_id"
                  value={linkedJobId}
                  onChange={setLinkedJobId}
                  options={jobs}
                />

                <SelectField
                  label="Customer"
                  name="client_id"
                  value={clientId}
                  onChange={setClientId}
                  options={clients}
                />

                <SelectField
                  label="Vehicle"
                  name="vehicle_id"
                  value={vehicleId}
                  onChange={setVehicleId}
                  options={vehicles}
                />

                <SelectField
                  label="Driver / Operator"
                  name="operator_id"
                  value={operatorId}
                  onChange={setOperatorId}
                  options={operators}
                />

                <SelectField
                  label="Job type"
                  name="job_type"
                  value={jobType}
                  onChange={setJobType}
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
                  value={transportDate}
                  onChange={setTransportDate}
                />

                <Field
                  label="Collection time"
                  name="collection_time"
                  type="time"
                  value={collectionTime}
                  onChange={setCollectionTime}
                />

                <Field
                  label="Delivery time"
                  name="delivery_time"
                  type="time"
                  value={deliveryTime}
                  onChange={setDeliveryTime}
                />

                <Field
                  label="Charge rate"
                  name="agreed_sell_rate"
                  type="number"
                  value={agreedSellRate}
                  onChange={(value) => {
                    setAgreedSellRate(value);
                    updateFromCharge(value);
                  }}
                />

                <SelectField
                  label="Status"
                  name="status"
                  value={status}
                  onChange={setStatus}
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
                  value={collectionAddress}
                  onChange={(e) => setCollectionAddress(e.target.value)}
                  rows={3}
                  style={textareaStyle}
                  placeholder="Enter pickup address"
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Delivery address</label>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  rows={3}
                  style={textareaStyle}
                  placeholder="Enter delivery address"
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Load description</label>
                <textarea
                  value={loadDescription}
                  onChange={(e) => setLoadDescription(e.target.value)}
                  rows={3}
                  style={textareaStyle}
                  placeholder="Describe the load, crane parts, ballast, equipment or haulage item"
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                  value={supplierId}
                  onChange={setSupplierId}
                  options={suppliers}
                />

                <Field
                  label="Supplier reference"
                  name="supplier_reference"
                  value={supplierReference}
                  onChange={setSupplierReference}
                />

                <Field
                  label="Supplier cost"
                  name="supplier_cost"
                  type="number"
                  value={supplierCost}
                  onChange={setSupplierCost}
                />
              </div>
            </section>

            <section style={sectionCard}>
              <div style={sectionTitle}>Invoice details</div>

              <div style={gridStyle}>
                <SelectField
                  label="Invoice status"
                  name="invoice_status"
                  value={invoiceStatus}
                  onChange={setInvoiceStatus}
                  options={INVOICE_STATUSES.map((status) => ({
                    value: status,
                    label: status,
                  }))}
                />

                <Field
                  label="Invoice number"
                  name="invoice_number"
                  value={invoiceNumber}
                  onChange={setInvoiceNumber}
                />

                <Field
                  label="Invoice created"
                  name="invoice_created_at"
                  type="date"
                  value={invoiceCreatedAt}
                  onChange={setInvoiceCreatedAt}
                />

                <Field
                  label="Invoice due"
                  name="invoice_due_at"
                  type="date"
                  value={invoiceDueAt}
                  onChange={setInvoiceDueAt}
                />

                <Field
                  label="Invoice subtotal"
                  name="invoice_subtotal"
                  type="number"
                  value={invoiceSubtotal}
                  onChange={(value) => {
                    setSubtotalTouched(true);
                    setInvoiceSubtotal(value);
                  }}
                />

                <Field
                  label="Invoice VAT"
                  name="invoice_vat"
                  type="number"
                  value={invoiceVat}
                  onChange={(value) => {
                    setVatTouched(true);
                    setInvoiceVat(value);
                  }}
                />

                <Field
                  label="Total invoice"
                  name="total_invoice"
                  type="number"
                  value={totalInvoice}
                  onChange={(value) => {
                    setTotalTouched(true);
                    setTotalInvoice(value);
                  }}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Invoice notes</label>
                <textarea
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  rows={3}
                  style={textareaStyle}
                  placeholder="Internal invoice notes"
                />
              </div>
            </section>

            <div>
              <button type="submit" style={saveBtn} disabled={saving}>
                {saving ? "Saving..." : "Save transport job"}
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
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  name: string;
  value?: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  value,
  onChange,
  options,
}: {
  label: string;
  name: string;
  value?: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
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
