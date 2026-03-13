import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import POLinesEditorClient from "./POLinesEditorClient";
import { redirect } from "next/navigation";

function generatePONumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const stamp = `${d.getHours()}${d.getMinutes()}${d.getSeconds()}`;
  return `PO-${y}${m}${day}-${stamp}`;
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

type LineInput = {
  description?: string;
  qty?: string | number;
  unit_cost?: string | number;
};

function parseLines(raw: string): LineInput[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function createPurchaseOrder(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const po_number = clean(formData.get("po_number")) || generatePONumber();
  const supplier_id = clean(formData.get("supplier_id")) || null;
  const job_id = clean(formData.get("job_id")) || null;
  const status = clean(formData.get("status")) || "draft";
  const order_date = clean(formData.get("order_date")) || null;
  const required_date = clean(formData.get("required_date")) || null;
  const supplier_reference = clean(formData.get("supplier_reference")) || null;
  const notes = clean(formData.get("notes")) || null;

  const rawLines = clean(formData.get("po_lines_json"));
  const parsedLines = parseLines(rawLines).filter(
    (line) => String(line.description ?? "").trim().length > 0
  );

  const lines = parsedLines.map((line) => {
    const qty = Number(line.qty ?? 0) || 0;
    const unit_cost = Number(line.unit_cost ?? 0) || 0;
    return {
      description: String(line.description ?? "").trim(),
      qty,
      unit_cost,
      total_cost: qty * unit_cost,
    };
  });

  const total_cost = lines.reduce((sum, line) => sum + Number(line.total_cost ?? 0), 0);

  const { data: created, error } = await supabase
    .from("purchase_orders")
    .insert({
      po_number,
      supplier_id,
      job_id,
      status,
      order_date,
      required_date,
      supplier_reference,
      total_cost,
      notes,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    redirect(`/purchase-orders?error=${encodeURIComponent(error?.message ?? "Could not create purchase order.")}`);
  }

  if (lines.length > 0) {
    const { error: lineError } = await supabase.from("purchase_order_lines").insert(
      lines.map((line) => ({
        purchase_order_id: created.id,
        description: line.description,
        qty: line.qty,
        unit_cost: line.unit_cost,
        total_cost: line.total_cost,
      }))
    );

    if (lineError) {
      redirect(`/purchase-orders?error=${encodeURIComponent(lineError.message)}`);
    }
  }

  redirect(`/purchase-orders?success=${encodeURIComponent(`Purchase order ${po_number} saved.`)}`);
}

async function updatePurchaseOrder(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const id = clean(formData.get("id"));
  if (!id) {
    redirect(`/purchase-orders?error=${encodeURIComponent("Purchase order id missing.")}`);
  }

  const supplier_id = clean(formData.get("supplier_id")) || null;
  const job_id = clean(formData.get("job_id")) || null;
  const status = clean(formData.get("status")) || "draft";
  const order_date = clean(formData.get("order_date")) || null;
  const required_date = clean(formData.get("required_date")) || null;
  const supplier_reference = clean(formData.get("supplier_reference")) || null;
  const notes = clean(formData.get("notes")) || null;
  const po_number = clean(formData.get("po_number_display")) || "Purchase order";

  const rawLines = clean(formData.get("po_lines_json"));
  const parsedLines = parseLines(rawLines).filter(
    (line) => String(line.description ?? "").trim().length > 0
  );

  const lines = parsedLines.map((line) => {
    const qty = Number(line.qty ?? 0) || 0;
    const unit_cost = Number(line.unit_cost ?? 0) || 0;
    return {
      description: String(line.description ?? "").trim(),
      qty,
      unit_cost,
      total_cost: qty * unit_cost,
    };
  });

  const total_cost = lines.reduce((sum, line) => sum + Number(line.total_cost ?? 0), 0);

  const { error: updateError } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id,
      job_id,
      status,
      order_date,
      required_date,
      supplier_reference,
      total_cost,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    redirect(`/purchase-orders?error=${encodeURIComponent(updateError.message)}`);
  }

  const { error: deleteLinesError } = await supabase
    .from("purchase_order_lines")
    .delete()
    .eq("purchase_order_id", id);

  if (deleteLinesError) {
    redirect(`/purchase-orders?error=${encodeURIComponent(deleteLinesError.message)}`);
  }

  if (lines.length > 0) {
    const { error: lineInsertError } = await supabase.from("purchase_order_lines").insert(
      lines.map((line) => ({
        purchase_order_id: id,
        description: line.description,
        qty: line.qty,
        unit_cost: line.unit_cost,
        total_cost: line.total_cost,
      }))
    );

    if (lineInsertError) {
      redirect(`/purchase-orders?error=${encodeURIComponent(lineInsertError.message)}`);
    }
  }

  redirect(`/purchase-orders?success=${encodeURIComponent(`${po_number} updated.`)}`);
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams?: { success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: purchaseOrders, error },
    { data: suppliers },
    { data: jobs },
    { data: poLines },
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

    supabase
      .from("suppliers")
      .select("id, company_name")
      .order("company_name", { ascending: true }),

    supabase
      .from("jobs")
      .select("id, job_number, site_name")
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("purchase_order_lines")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);

  const linesByPoId = new Map<string, any[]>();
  for (const line of poLines ?? []) {
    const key = String((line as any).purchase_order_id);
    const existing = linesByPoId.get(key) ?? [];
    existing.push(line);
    linesByPoId.set(key, existing);
  }

  const successMessage = searchParams?.success
    ? decodeURIComponent(searchParams.success)
    : "";
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0, fontSize: 32 }}>Purchase Orders</h1>
          <p style={{ opacity: 0.8 }}>
            Raise, edit and print cross-hire purchase orders for cranes and equipment.
          </p>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <section style={sectionCard}>
            <h2 style={sectionTitle}>Create purchase order</h2>

            <form action={createPurchaseOrder} style={{ display: "grid", gap: 14 }}>
              <div style={gridStyle}>
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
                <Field label="Order date" name="order_date" type="date" />
                <Field label="Required date" name="required_date" type="date" />
                <Field label="Supplier reference" name="supplier_reference" />
              </div>

              <FullWidthField label="Notes" name="notes" />

              <POLinesEditorClient fieldName="po_lines_json" />

              <div>
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
                  const existingLines = linesByPoId.get(String(po.id)) ?? [];

                  return (
                    <form key={po.id} action={updatePurchaseOrder} style={poCard}>
                      <input type="hidden" name="id" value={po.id} />
                      <input type="hidden" name="po_number_display" value={po.po_number ?? ""} />

                      <div style={poHeaderStyle}>
                        <div style={{ fontWeight: 1000, fontSize: 18 }}>
                          {po.po_number}
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <a
                            href={`/purchase-orders/${po.id}/print`}
                            target="_blank"
                            rel="noreferrer"
                            style={printBtn}
                          >
                            Open / Save PDF
                          </a>
                        </div>
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
                        <SelectField
                          label="Status"
                          name="status"
                          defaultValue={po.status ?? "draft"}
                          options={[
                            { value: "draft", label: "Draft" },
                            { value: "sent", label: "Sent" },
                            { value: "approved", label: "Approved" },
                            { value: "completed", label: "Completed" },
                            { value: "cancelled", label: "Cancelled" },
                          ]}
                        />
                        <Field label="Order date" name="order_date" type="date" defaultValue={po.order_date ?? ""} />
                        <Field label="Required date" name="required_date" type="date" defaultValue={po.required_date ?? ""} />
                        <Field label="Supplier reference" name="supplier_reference" defaultValue={po.supplier_reference ?? ""} />
                        <Field label="Total cost" name="total_cost_display" type="number" defaultValue={String(po.total_cost ?? 0)} disabled />
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <FullWidthField label="Notes" name="notes" defaultValue={po.notes ?? ""} />
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <POLinesEditorClient
                          fieldName="po_lines_json"
                          initialLines={existingLines.map((line: any) => ({
                            description: line.description ?? "",
                            qty: String(line.qty ?? 0),
                            unit_cost: String(line.unit_cost ?? 0),
                          }))}
                        />
                      </div>

                      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                        <button type="submit" style={saveBtn}>
                          Update purchase order
                        </button>

                        <div style={{ opacity: 0.72 }}>
                          Supplier: {supplier?.company_name ?? "—"} • Job: {job?.job_number ?? "—"} • Total: £{Number(po.total_cost ?? 0).toFixed(2)}
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
    <div style={{ display: "grid", gap: 6 }}>
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

const poHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 12,
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

const printBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.75)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const successBox: React.CSSProperties = {
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#0b7a4b",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
