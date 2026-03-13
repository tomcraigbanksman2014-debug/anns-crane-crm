import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import EquipmentAllocationsCreate from "../../components/EquipmentAllocationsCreate";

type AllocationInput = {
  equipment_id?: string;
  operator_id?: string;
  source_type?: "owned" | "cross_hire";
  supplier_id?: string;
  purchase_order_id?: string;
  item_name?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  agreed_cost?: string | number;
  supplier_reference?: string;
  notes?: string;
};

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function parseAllocations(raw: string): AllocationInput[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function createJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const client_id = clean(formData.get("client_id")) || null;
  const job_date = clean(formData.get("job_date")) || null;
  const start_time = clean(formData.get("start_time")) || null;
  const end_time = clean(formData.get("end_time")) || null;
  const site_name = clean(formData.get("site_name")) || null;
  const site_address = clean(formData.get("site_address")) || null;
  const contact_name = clean(formData.get("contact_name")) || null;
  const contact_phone = clean(formData.get("contact_phone")) || null;
  const hire_type = clean(formData.get("hire_type")) || null;
  const lift_type = clean(formData.get("lift_type")) || null;
  const status = clean(formData.get("status")) || "draft";
  const notes = clean(formData.get("notes")) || null;
  const invoice_status = clean(formData.get("invoice_status")) || "not_invoiced";

  const rawAllocations = clean(formData.get("equipment_allocations_json"));
  const allocations = parseAllocations(rawAllocations).filter(
    (item) => item.equipment_id || item.item_name
  );

  const first = allocations[0];

  const { data: createdJob, error } = await supabase
    .from("jobs")
    .insert({
      client_id,
      job_date,
      start_time,
      end_time,
      site_name,
      site_address,
      contact_name,
      contact_phone,
      hire_type,
      lift_type,
      status,
      notes,
      invoice_status,
      equipment_id: first?.equipment_id || null,
      operator_id: first?.operator_id || null,
      main_operator_id: first?.operator_id || null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !createdJob) {
    throw new Error(error?.message ?? "Could not create job.");
  }

  if (allocations.length > 0) {
    const rows = allocations.map((item) => ({
      job_id: createdJob.id,
      equipment_id: item.equipment_id || null,
      operator_id: item.operator_id || null,
      source_type: item.source_type || "owned",
      supplier_id: item.source_type === "cross_hire" ? item.supplier_id || null : null,
      purchase_order_id: item.source_type === "cross_hire" ? item.purchase_order_id || null : null,
      item_name: item.item_name || null,
      start_date: item.start_date || job_date,
      end_date: item.end_date || job_date,
      start_time: item.start_time || start_time,
      end_time: item.end_time || end_time,
      agreed_cost: Number(item.agreed_cost || 0) || 0,
      supplier_reference: item.supplier_reference || null,
      notes: item.notes || null,
      updated_at: new Date().toISOString(),
    }));

    await supabase.from("job_equipment").insert(rows);

    const crossHireTotal = rows
      .filter((r) => r.source_type === "cross_hire")
      .reduce((sum, r) => sum + Number(r.agreed_cost || 0), 0);

    await supabase
      .from("jobs")
      .update({
        equipment_count: rows.length,
        cross_hire_cost_total: crossHireTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", createdJob.id);
  }

  redirect(`/jobs/${createdJob.id}`);
}

export default async function NewJobPage() {
  const supabase = createSupabaseServerClient();

  const [{ data: clients }, { data: equipment }, { data: operators }, { data: suppliers }, { data: purchaseOrders }] =
    await Promise.all([
      supabase.from("clients").select("id, company_name").order("company_name", { ascending: true }),
      supabase.from("equipment").select("id, name, asset_number").order("name", { ascending: true }),
      supabase.from("operators").select("id, full_name").eq("status", "active").order("full_name", { ascending: true }),
      supabase.from("suppliers").select("id, company_name").eq("status", "active").order("company_name", { ascending: true }),
      supabase.from("purchase_orders").select("id, po_number").order("created_at", { ascending: false }).limit(300),
    ]);

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={topRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Create Job</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Create a job and assign multiple cranes, HIABs or cross-hired items in one go.
              </p>
            </div>

            <a href="/jobs" style={btnStyle}>
              ← Back
            </a>
          </div>

          <form action={createJob} style={{ marginTop: 18 }}>
            <div style={gridStyle}>
              <SelectField
                label="Customer"
                name="client_id"
                options={(clients ?? []).map((c: any) => ({
                  value: c.id,
                  label: c.company_name ?? "Customer",
                }))}
              />

              <Field label="Job date" name="job_date" type="date" />
              <Field label="Start time" name="start_time" />
              <Field label="End time" name="end_time" />
              <Field label="Site name" name="site_name" />
              <Field label="Site contact" name="contact_name" />
              <Field label="Site phone" name="contact_phone" />
              <Field label="Hire type" name="hire_type" />
              <Field label="Lift type" name="lift_type" />

              <SelectField
                label="Status"
                name="status"
                defaultValue="draft"
                options={[
                  { value: "draft", label: "draft" },
                  { value: "confirmed", label: "confirmed" },
                  { value: "in_progress", label: "in_progress" },
                  { value: "completed", label: "completed" },
                  { value: "cancelled", label: "cancelled" },
                ]}
              />

              <SelectField
                label="Invoice status"
                name="invoice_status"
                defaultValue="not_invoiced"
                options={[
                  { value: "not_invoiced", label: "not_invoiced" },
                  { value: "invoiced", label: "invoiced" },
                  { value: "part_paid", label: "part_paid" },
                  { value: "paid", label: "paid" },
                ]}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Site address</label>
              <textarea name="site_address" rows={3} style={textareaStyle} />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Notes</label>
              <textarea name="notes" rows={5} style={textareaStyle} />
            </div>

            <EquipmentAllocationsCreate
              equipmentOptions={(equipment ?? []).map((e: any) => ({
                value: e.id,
                label: `${e.name ?? "Equipment"}${e.asset_number ? ` (${e.asset_number})` : ""}`,
              }))}
              operatorOptions={(operators ?? []).map((o: any) => ({
                value: o.id,
                label: o.full_name ?? "Operator",
              }))}
              supplierOptions={(suppliers ?? []).map((s: any) => ({
                value: s.id,
                label: s.company_name ?? "Supplier",
              }))}
              purchaseOrderOptions={(purchaseOrders ?? []).map((po: any) => ({
                value: po.id,
                label: po.po_number ?? "PO",
              }))}
              title="Job Equipment Allocations"
            />

            <div style={{ marginTop: 18 }}>
              <button type="submit" style={saveBtn}>
                Create job
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
  type = "text",
}: {
  label: string;
  name: string;
  type?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input name={name} type={type} style={inputStyle} />
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
