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
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
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

function normaliseTransportStatus(
  input: string | null,
  fields: {
    clientId: string | null;
    vehicleId: string | null;
    operatorId: string | null;
    transportDate: string | null;
    collectionTime: string | null;
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
    !!fields.deliveryTime;

  return canConfirm ? "confirmed" : "planned";
}

async function createTransportJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const transportNumber =
    clean(formData.get("transport_number")) || generateTransportNumber();

  const linkedJobId = clean(formData.get("linked_job_id")) || null;
  const clientId = clean(formData.get("client_id")) || null;
  const vehicleId = clean(formData.get("vehicle_id")) || null;
  const operatorId = clean(formData.get("operator_id")) || null;

  const rawSupplierId = clean(formData.get("supplier_id"));
  const otherSupplierName = clean(formData.get("other_supplier_name"));
  const supplierReferenceInput = clean(formData.get("supplier_reference"));
  const supplierCost = numberOrNull(formData.get("supplier_cost"));
  const jobType = clean(formData.get("job_type")) || null;

  const supplierId =
    rawSupplierId && rawSupplierId !== "other" ? rawSupplierId : null;

  const supplierReference =
    rawSupplierId === "other"
      ? [otherSupplierName || null, supplierReferenceInput ? `Ref: ${supplierReferenceInput}` : null]
          .filter(Boolean)
          .join(" | ") || null
      : supplierReferenceInput || null;

  const collectionAddress = clean(formData.get("collection_address")) || null;
  const deliveryAddress = clean(formData.get("delivery_address")) || null;
  const transportDate = clean(formData.get("transport_date")) || null;
  const collectionTime = clean(formData.get("collection_time")) || null;
  const deliveryTime = clean(formData.get("delivery_time")) || null;
  const loadDescription = clean(formData.get("load_description")) || null;
  const status = normaliseTransportStatus(clean(formData.get("status")) || "planned", {
    clientId,
    vehicleId,
    operatorId,
    transportDate,
    collectionTime,
    deliveryTime,
  });
  const notes = clean(formData.get("notes")) || null;

  const agreedSellRate = money(numberOrZero(formData.get("agreed_sell_rate")));
  const invoiceStatus = clean(formData.get("invoice_status")) || "Not Invoiced";
  const invoiceNumber = clean(formData.get("invoice_number")) || null;
  const invoiceCreatedAt = clean(formData.get("invoice_created_at")) || null;
  const invoiceDueAt = clean(formData.get("invoice_due_at")) || null;
  const invoiceNotes = clean(formData.get("invoice_notes")) || null;

  const invoiceSubtotalRaw = money(numberOrZero(formData.get("invoice_subtotal")));
  const invoiceSubtotal = invoiceSubtotalRaw > 0 ? invoiceSubtotalRaw : agreedSellRate;
  const invoiceVat = money(invoiceSubtotal * 0.2);
  const totalInvoice = money(invoiceSubtotal + invoiceVat);

  if (!collectionAddress || !deliveryAddress || !transportDate) {
    redirect(
      `/transport-jobs/new?error=${encodeURIComponent(
        "Pickup address, delivery address and transport date are required."
      )}`
    );
  }

  if (rawSupplierId === "other" && !otherSupplierName) {
    redirect(
      `/transport-jobs/new?error=${encodeURIComponent(
        "Enter the one-off cross-hire supplier name when using Other."
      )}`
    );
  }

  const collectionMinutes = toMinutes(collectionTime);
  const deliveryMinutes = toMinutes(deliveryTime);

  if (
    collectionTime &&
    deliveryTime &&
    collectionMinutes !== null &&
    deliveryMinutes !== null &&
    collectionMinutes > deliveryMinutes
  ) {
    redirect(
      `/transport-jobs/new?error=${encodeURIComponent(
        "Delivery time cannot be earlier than collection time."
      )}`
    );
  }

  if (!INVOICE_STATUSES.includes(invoiceStatus)) {
    redirect(
      `/transport-jobs/new?error=${encodeURIComponent("Invalid invoice status.")}`
    );
  }

  const pickupCoords = collectionAddress
    ? await geocodeAddress(collectionAddress)
    : null;

  const deliveryCoords = deliveryAddress
    ? await geocodeAddress(deliveryAddress)
    : null;

  const { data, error } = await supabase
    .from("transport_jobs")
    .insert({
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
    })
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
  const timeOptions = buildTimeOptions();

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

          <form
            id="transport-job-form"
            action={createTransportJob}
            style={{ marginTop: 18, display: "grid", gap: 18 }}
          >
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

                <SelectField
                  label="Collection time"
                  name="collection_time"
                  options={timeOptions}
                />

                <SelectField
                  label="Delivery time"
                  name="delivery_time"
                  options={timeOptions}
                />

                <Field
                  id="agreed_sell_rate"
                  label="Charge rate"
                  name="agreed_sell_rate"
                  type="number"
                  step="0.01"
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
                  id="supplier_id"
                  label="Supplier"
                  name="supplier_id"
                  options={[
                    ...(suppliers ?? []).map((s: any) => ({
                      value: s.id,
                      label: s.company_name ?? "Supplier",
                    })),
                    { value: "other", label: "Other" },
                  ]}
                />

                <div id="other_supplier_wrap" style={{ display: "none" }}>
                  <Field
                    id="other_supplier_name"
                    label="Other supplier name"
                    name="other_supplier_name"
                    placeholder="Enter one-off cross-hire supplier"
                  />
                </div>

                <Field
                  label="Supplier reference"
                  name="supplier_reference"
                />

                <Field
                  label="Supplier cost"
                  name="supplier_cost"
                  type="number"
                  step="0.01"
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
                  id="invoice_subtotal"
                  label="Invoice subtotal"
                  name="invoice_subtotal"
                  type="number"
                  step="0.01"
                  defaultValue={String(defaultInvoiceSubtotal)}
                />

                <Field
                  id="invoice_vat"
                  label="Invoice VAT"
                  name="invoice_vat"
                  type="number"
                  step="0.01"
                  defaultValue={String(defaultInvoiceVat)}
                  readOnly
                />

                <Field
                  id="total_invoice"
                  label="Total invoice"
                  name="total_invoice"
                  type="number"
                  step="0.01"
                  defaultValue={String(defaultInvoiceTotal)}
                  readOnly
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

          <TransportJobFormScript />
        </div>
      </div>
    </ClientShell>
  );
}

function TransportJobFormScript() {
  const script = `
    (function () {
      function roundMoney(value) {
        var n = Number(value || 0);
        if (!Number.isFinite(n)) return 0;
        return Math.round(n * 100) / 100;
      }

      function formatMoney(value) {
        return roundMoney(value).toFixed(2);
      }

      function parseInputValue(input) {
        if (!input) return 0;
        var n = Number(String(input.value || "").trim());
        return Number.isFinite(n) ? n : 0;
      }

      function init() {
        var form = document.getElementById("transport-job-form");
        if (!form) return;

        var sellRateInput = document.getElementById("agreed_sell_rate");
        var subtotalInput = document.getElementById("invoice_subtotal");
        var vatInput = document.getElementById("invoice_vat");
        var totalInput = document.getElementById("total_invoice");

        var supplierSelect = document.getElementById("supplier_id");
        var otherSupplierWrap = document.getElementById("other_supplier_wrap");
        var otherSupplierInput = document.getElementById("other_supplier_name");

        if (!subtotalInput || !vatInput || !totalInput) return;

        var lastSyncedSubtotal = parseInputValue(subtotalInput);

        function recalcFromSubtotal() {
          var subtotal = roundMoney(parseInputValue(subtotalInput));
          var vat = roundMoney(subtotal * 0.2);
          var total = roundMoney(subtotal + vat);

          vatInput.value = formatMoney(vat);
          totalInput.value = formatMoney(total);
          lastSyncedSubtotal = subtotal;
        }

        function syncSubtotalFromSellRate() {
          if (!sellRateInput) return;

          var sellRate = roundMoney(parseInputValue(sellRateInput));
          var currentSubtotal = roundMoney(parseInputValue(subtotalInput));

          if (currentSubtotal === 0 || currentSubtotal === lastSyncedSubtotal) {
            subtotalInput.value = formatMoney(sellRate);
          }

          recalcFromSubtotal();
        }

        function toggleOtherSupplier() {
          if (!supplierSelect || !otherSupplierWrap || !otherSupplierInput) return;

          var isOther = supplierSelect.value === "other";
          otherSupplierWrap.style.display = isOther ? "block" : "none";
          otherSupplierInput.required = isOther;

          if (!isOther) {
            otherSupplierInput.value = "";
          }
        }

        if (sellRateInput) {
          sellRateInput.addEventListener("input", syncSubtotalFromSellRate);
          sellRateInput.addEventListener("change", syncSubtotalFromSellRate);
        }

        subtotalInput.addEventListener("input", recalcFromSubtotal);
        subtotalInput.addEventListener("change", recalcFromSubtotal);

        if (supplierSelect) {
          supplierSelect.addEventListener("change", toggleOtherSupplier);
        }

        form.addEventListener("submit", function (event) {
          recalcFromSubtotal();
          toggleOtherSupplier();

          if (supplierSelect && supplierSelect.value === "other" && otherSupplierInput && !String(otherSupplierInput.value || "").trim()) {
            event.preventDefault();
            window.alert("Please enter the other supplier name.");
          }
        });

        if (parseInputValue(subtotalInput) === 0 && sellRateInput) {
          subtotalInput.value = formatMoney(parseInputValue(sellRateInput));
        }

        recalcFromSubtotal();
        toggleOtherSupplier();
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
      } else {
        init();
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  id,
  step,
  placeholder,
  readOnly = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
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
        readOnly={readOnly}
        style={readOnly ? readOnlyInputStyle : inputStyle}
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
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
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
