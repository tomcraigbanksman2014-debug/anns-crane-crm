import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { revalidatePath } from "next/cache";

function generatePONumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const stamp = `${d.getHours()}${d.getMinutes()}${d.getSeconds()}`;
  return `PO-${y}${m}${day}-${stamp}`;
}

async function createPurchaseOrder(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const payload = {
    po_number: String(formData.get("po_number") ?? "").trim() || generatePONumber(),
    supplier_id: String(formData.get("supplier_id") ?? "").trim() || null,
    job_id: String(formData.get("job_id") ?? "").trim() || null,
    status: String(formData.get("status") ?? "draft").trim() || "draft",
    order_date: String(formData.get("order_date") ?? "").trim() || null,
    required_date: String(formData.get("required_date") ?? "").trim() || null,
    supplier_reference: String(formData.get("supplier_reference") ?? "").trim() || null,
    total_cost: Number(formData.get("total_cost") ?? 0) || 0,
    notes: String(formData.get("notes") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("purchase_orders").insert(payload);

  revalidatePath("/purchase-orders");
}

async function updatePurchaseOrder(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const payload = {
    supplier_id: String(formData.get("supplier_id") ?? "").trim() || null,
    job_id: String(formData.get("job_id") ?? "").trim() || null,
    status: String(formData.get("status") ?? "draft").trim() || "draft",
    order_date: String(formData.get("order_date") ?? "").trim() || null,
    required_date: String(formData.get("required_date") ?? "").trim() || null,
    supplier_reference: String(formData.get("supplier_reference") ?? "").trim() || null,
    total_cost: Number(formData.get("total_cost") ?? 0) || 0,
    notes: String(formData.get("notes") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("purchase_orders").update(payload).eq("id", id);

  revalidatePath("/purchase-orders");
}

export default async function PurchaseOrdersPage() {
  const supabase = createSupabaseServerClient();

  const [
    { data: purchaseOrders, error },
    { data: suppliers },
    { data: jobs },
  ] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(`
        *,
        suppliers:supplier_id (
          id,
          company_name
        ),
        jobs:job_id (
          id,
          job_number,
          site_name
        )
      `)
      .order("created_at", { ascending: false }),
    supabase.from("suppliers").select("id, company_name").order("company_name", { ascending: true }),
    supabase.from("jobs").select("id, job_number, site_name").order("created_at", { ascending: false }).limit(200),
  ]);

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0, fontSize: 32 }}>Purchase Orders</h1>
          <p style={{ opacity: 0.8 }}>
            Raise and track cross-hire purchase orders for cranes and equipment.
          </p>

          <section style={sectionCard}>
            <h2 style={sectionTitle}>Create purchase order</h2>

            <form action={createPurchaseOrder} style={gridStyle}>
              <Field label="PO number" name="po_number" defaultValue={generatePONumber()} />
              <SelectField
                label="Supplier"
                name="supplier_id"
                options={(suppliers ?? []).map((s: any) => ({
                  value: s.id,
                  label: s.company_name,
                }))}
              />
              <SelectField
                label="Linked job"
                name="job_id"
                options={(jobs ?? []).map((j: any) => ({
                  value: j.id,
                  label: `Job #${j.job_number ?? "—"}${j.site_name ? ` • ${j.site_name}` : ""}`,
                }))}
              />
              <Field label="Status" name="status" defaultValue="draft" />
              <Field label="Order date" name="order_date" type="date" />
              <Field label="Required date" name="required_date" type="date" />
              <Field label="Supplier reference" name="supplier_reference" />
              <Field label="Total cost" name="total_cost" type="number" defaultValue="0" />
              <FullWidthField label="Notes" name="notes" />
              <div style={{ gridColumn: "1 / -1" }}>
                <button type="submit" style={saveBtn}>
                  Save purchase order
                </button>
              </div>
            </form>
          </section>

          <section style={{ ...sectionCard, marginTop: 16 }}>
            <h2 style={sectionTitle}>Existing purchase orders</h2>

            {error ? (
              <div style={errorBox}>{error.message}</div>
            ) : !purchaseOrders || purchaseOrders.length === 0 ? (
              <p style={{ margin: 0 }}>No purchase orders yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {purchaseOrders.map((po: any) => {
                  const supplier = Array.isArray(po.suppliers) ? po.suppliers[0] : po.suppliers;
                  const job = Array.isArray(po.jobs) ? po.jobs[0] : po.jobs;

                  return (
                    <form key={po.id} action={updatePurchaseOrder} style={poCard}>
                      <input type="hidden" name="id" value={po.id} />

                      <div style={{ marginBottom: 10, fontWeight: 1000 }}>
                        {po.po_number}
                      </div>

                      <div style={gridStyle}>
                        <SelectField
                          label="Supplier"
                          name="supplier_id"
                          defaultValue={po.supplier_id ?? ""}
                          options={(suppliers ?? []).map((s: any) => ({
                            value: s.id,
                            label: s.company_name,
                          }))}
                        />
                        <SelectField
                          label="Linked job"
                          name="job_id"
                          defaultValue={po.job_id ?? ""}
                          options={(jobs ?? []).map((j: any) => ({
                            value: j.id,
                            label: `Job #${j.job_number ?? "—"}${j.site_name ? ` • ${j.site_name}` : ""}`,
                          }))}
                        />
                        <Field label="Status" name="status" defaultValue={po.status ?? "draft"} />
                        <Field label="Order date" name="order_date" type="date" defaultValue={po.order_date ?? ""} />
                        <Field label="Required date" name="required_date" type="date" defaultValue={po.required_date ?? ""} />
                        <Field label="Supplier reference" name="supplier_reference" defaultValue={po.supplier_reference ?? ""} />
                        <Field label="Total cost" name="total_cost" type="number" defaultValue={String(po.total_cost ?? 0)} />
                        <FullWidthField label="Notes" name="notes" defaultValue={po.notes ?? ""} />
                      </div>

                      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <button type="submit" style={saveBtn}>
                          Update purchase order
                        </button>

                        <div style={{ opacity: 0.72, alignSelf: "center" }}>
                          Supplier: {supplier?.company_name ?? "—"} • Job: {job?.job_number ?? "—"}
                        </div>
                      </div>
                    </form>
                  );
                })}
              </div>
            )}
          </section>
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
      <input name={name} defaultValue={defaultValue} type={type} style={inputStyle} />
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
          <option key={o.value} value={o.value}>
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
    <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea name={name} defaultValue={defaultValue} rows={4} style={textareaStyle} />
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

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const poCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 14,
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

const saveBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
