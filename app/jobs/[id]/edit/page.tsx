import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import JobEquipmentManager from "../JobEquipmentManager";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function updateJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const id = clean(formData.get("id"));
  if (!id) return;

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
  const equipment_id = clean(formData.get("equipment_id")) || null;
  const operator_id = clean(formData.get("operator_id")) || null;
  const supplier_id = clean(formData.get("supplier_id")) || null;
  const supplier_reference = clean(formData.get("supplier_reference")) || null;
  const supplier_cost = Number(clean(formData.get("supplier_cost")) || "0");

  const { error } = await supabase
    .from("jobs")
    .update({
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
      equipment_id,
      operator_id,
      main_operator_id: operator_id,
      supplier_id,
      supplier_reference,
      supplier_cost: Number.isFinite(supplier_cost) ? supplier_cost : 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/jobs/${id}/edit`);

  redirect(`/jobs/${id}`);
}

export default async function EditJobPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: job, error: jobError },
    { data: clients },
    { data: equipment },
    { data: operators },
    { data: allocations },
    { data: suppliers },
    { data: purchaseOrders },
    { data: cranes },
    { data: vehicles },
  ] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", params.id).single(),

    supabase
      .from("clients")
      .select("id, company_name")
      .order("company_name", { ascending: true }),

    supabase
      .from("equipment")
      .select("id, name, asset_number")
      .order("name", { ascending: true }),

    supabase
      .from("operators")
      .select("id, full_name")
      .eq("status", "active")
      .order("full_name", { ascending: true }),

    supabase
      .from("job_equipment")
      .select(`
        *,
        cranes:crane_id (
          id,
          name,
          reg_number,
          capacity
        ),
        vehicles:vehicle_id (
          id,
          name,
          reg_number
        ),
        equipment:equipment_id (
          id,
          name,
          asset_number
        ),
        operators:operator_id (
          id,
          full_name
        ),
        suppliers:supplier_id (
          id,
          company_name,
          category
        ),
        purchase_orders:purchase_order_id (
          id,
          po_number,
          status
        )
      `)
      .eq("job_id", params.id)
      .order("created_at", { ascending: true }),

    supabase
      .from("suppliers")
      .select("id, company_name, category")
      .eq("status", "active")
      .order("company_name", { ascending: true }),

    supabase
      .from("purchase_orders")
      .select("id, po_number, status")
      .order("created_at", { ascending: false })
      .limit(300),

    supabase
      .from("cranes")
      .select("id, name, reg_number, capacity, status, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("vehicles")
      .select("id, name, reg_number, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),
  ]);

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Edit Job</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Update main job details, supplier details and manage multiple equipment allocations.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {job?.id ? (
                <a href={`/jobs/${job.id}`} style={btnStyle}>
                  View job
                </a>
              ) : null}
              <a href="/jobs" style={btnStyle}>
                ← Back
              </a>
            </div>
          </div>

          {jobError ? (
            <div style={errorBox}>{jobError.message}</div>
          ) : !job ? (
            <div style={errorBox}>Job not found.</div>
          ) : (
            <>
              <form action={updateJob} style={{ marginTop: 18 }}>
                <input type="hidden" name="id" value={job.id} />

                <div style={gridStyle}>
                  <SelectField
                    label="Customer"
                    name="client_id"
                    defaultValue={job.client_id ?? ""}
                    options={(clients ?? []).map((c: any) => ({
                      value: c.id,
                      label: c.company_name ?? "Customer",
                    }))}
                  />

                  <SelectField
                    label="Legacy primary equipment"
                    name="equipment_id"
                    defaultValue={job.equipment_id ?? ""}
                    options={(equipment ?? []).map((e: any) => ({
                      value: e.id,
                      label: `${e.name ?? "Equipment"}${e.asset_number ? ` (${e.asset_number})` : ""}`,
                    }))}
                  />

                  <SelectField
                    label="Legacy primary operator"
                    name="operator_id"
                    defaultValue={job.operator_id ?? ""}
                    options={(operators ?? []).map((o: any) => ({
                      value: o.id,
                      label: o.full_name ?? "Operator",
                    }))}
                  />

                  <SelectField
                    label="Status"
                    name="status"
                    defaultValue={job.status ?? "draft"}
                    options={[
                      { value: "draft", label: "draft" },
                      { value: "confirmed", label: "confirmed" },
                      { value: "in_progress", label: "in_progress" },
                      { value: "completed", label: "completed" },
                      { value: "cancelled", label: "cancelled" },
                    ]}
                  />

                  <Field
                    label="Job date"
                    name="job_date"
                    type="date"
                    defaultValue={job.job_date ?? ""}
                  />
                  <Field
                    label="Start time"
                    name="start_time"
                    defaultValue={job.start_time ?? ""}
                  />
                  <Field
                    label="End time"
                    name="end_time"
                    defaultValue={job.end_time ?? ""}
                  />
                  <Field
                    label="Site name"
                    name="site_name"
                    defaultValue={job.site_name ?? ""}
                  />
                  <Field
                    label="Site contact"
                    name="contact_name"
                    defaultValue={job.contact_name ?? ""}
                  />
                  <Field
                    label="Site phone"
                    name="contact_phone"
                    defaultValue={job.contact_phone ?? ""}
                  />
                  <Field
                    label="Hire type"
                    name="hire_type"
                    defaultValue={job.hire_type ?? ""}
                  />
                  <Field
                    label="Lift type"
                    name="lift_type"
                    defaultValue={job.lift_type ?? ""}
                  />
                </div>

                <div style={grid3Style}>
                  <SelectField
                    label="Primary supplier"
                    name="supplier_id"
                    defaultValue={job.supplier_id ?? ""}
                    options={(suppliers ?? []).map((s: any) => ({
                      value: s.id,
                      label: `${s.company_name ?? "Supplier"}${s.category ? ` • ${s.category}` : ""}`,
                    }))}
                  />
                  <Field
                    label="Supplier reference"
                    name="supplier_reference"
                    defaultValue={job.supplier_reference ?? ""}
                  />
                  <Field
                    label="Supplier cost"
                    name="supplier_cost"
                    type="number"
                    defaultValue={String(job.supplier_cost ?? 0)}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Site address</label>
                  <textarea
                    name="site_address"
                    defaultValue={job.site_address ?? ""}
                    rows={3}
                    style={textareaStyle}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    name="notes"
                    defaultValue={job.notes ?? ""}
                    rows={5}
                    style={textareaStyle}
                  />
                </div>

                <div style={{ marginTop: 18 }}>
                  <button type="submit" style={saveBtn}>
                    Save job details
                  </button>
                </div>
              </form>

              <JobEquipmentManager
                jobId={job.id}
                initialAllocations={allocations ?? []}
                craneOptions={(cranes ?? []).map((c: any) => ({
                  value: c.id,
                  label: `${c.name ?? "Crane"}${c.reg_number ? ` (${c.reg_number})` : ""}${c.capacity ? ` • ${c.capacity}` : ""}`,
                }))}
                vehicleOptions={(vehicles ?? []).map((v: any) => ({
                  value: v.id,
                  label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
                }))}
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
                  category: s.category ?? "",
                }))}
                purchaseOrderOptions={(purchaseOrders ?? []).map((po: any) => ({
                  value: po.id,
                  label: `${po.po_number ?? "PO"}${po.status ? ` • ${po.status}` : ""}`,
                }))}
                defaultDate={job.job_date}
                defaultStartTime={job.start_time}
                defaultEndTime={job.end_time}
              />
            </>
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
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input name={name} type={type} defaultValue={defaultValue} style={inputStyle} />
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
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select name={name} defaultValue={defaultValue} style={inputStyle}>
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
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  textDecoration: "none",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const grid3Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginTop: 12,
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
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};
