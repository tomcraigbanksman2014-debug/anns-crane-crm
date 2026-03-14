import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import POLinesEditorClient from "../POLinesEditorClient";
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

  const total_cost = lines.reduce(
    (sum, line) => sum + Number(line.total_cost ?? 0),
    0
  );

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
    redirect(
      `/purchase-orders/new?error=${encodeURIComponent(
        error?.message ?? "Could not create purchase order."
      )}`
    );
  }

  if (lines.length > 0) {
    const { error: lineError } = await supabase
      .from("purchase_order_lines")
      .insert(
        lines.map((line) => ({
          purchase_order_id: created.id,
          description: line.description,
          qty: line.qty,
          unit_cost: line.unit_cost,
          total_cost: line.total_cost,
        }))
      );

    if (lineError) {
      redirect(
        `/purchase-orders/new?error=${encodeURIComponent(lineError.message)}`
      );
    }
  }

  if (supplier_id) {
    const correspondenceMessageParts = [
      `Purchase order ${po_number} created.`,
      `Status: ${status}.`,
      `Total value £${total_cost.toFixed(2)}.`,
      supplier_reference ? `Supplier ref: ${supplier_reference}.` : "",
      required_date ? `Required date: ${required_date}.` : "",
      notes ? `Notes: ${notes}` : "",
    ].filter(Boolean);

    await supabase.from("supplier_correspondence").insert({
      supplier_id,
      type: status === "sent" ? "email" : "note",
      subject: status === "sent" ? "Purchase Order Sent" : "Purchase Order Created",
      message: correspondenceMessageParts.join(" "),
      created_by: "system",
    });
  }

  redirect(
    `/purchase-orders/${created.id}?success=${encodeURIComponent(
      `Purchase order ${po_number} saved.`
    )}`
  );
}

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: suppliers }, { data: jobs }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, company_name")
      .order("company_name", { ascending: true }),
    supabase
      .from("jobs")
      .select("id, job_number, site_name")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 32 }}>Create Purchase Order</h1>
              <p style={{ opacity: 0.8, marginTop: 6 }}>
                Create a supplier purchase order and go straight to the PO record.
              </p>
            </div>

            <a href="/purchase-orders" style={secondaryBtn}>
              ← Back to PO list
            </a>
          </div>

          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <section style={sectionCard}>
            <form action={createPurchaseOrder} style={{ display: "grid", gap: 14 }}>
              <div style={gridStyle}>
                <Field
                  label="PO number"
                  name="po_number"
                  defaultValue={generatePONumber()}
                />
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
                    label: `Job #${j.job_number ?? "—"}${
                      j.site_name ? ` • ${j.site_name}` : ""
                    }`,
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
                <button type="submit" style={primaryBtn}>
                  Save purchase order
                </button>
              </div>
            </form>
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
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={4}
        style={textareaStyle}
      />
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

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
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

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
