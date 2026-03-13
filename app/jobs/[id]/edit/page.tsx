import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import JobEquipmentManager from "../JobEquipmentManager";

async function updateJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const client_id = String(formData.get("client_id") ?? "").trim() || null;
  const job_date = String(formData.get("job_date") ?? "").trim() || null;
  const start_time = String(formData.get("start_time") ?? "").trim() || null;
  const end_time = String(formData.get("end_time") ?? "").trim() || null;
  const site_name = String(formData.get("site_name") ?? "").trim() || null;
  const site_address = String(formData.get("site_address") ?? "").trim() || null;
  const contact_name = String(formData.get("contact_name") ?? "").trim() || null;
  const contact_phone = String(formData.get("contact_phone") ?? "").trim() || null;
  const hire_type = String(formData.get("hire_type") ?? "").trim() || null;
  const lift_type = String(formData.get("lift_type") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "").trim() || "draft";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const equipment_id = String(formData.get("equipment_id") ?? "").trim() || null;
  const operator_id = String(formData.get("operator_id") ?? "").trim() || null;

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
  ] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", params.id).single(),
    supabase.from("clients").select("id, company_name").order("company_name", { ascending: true }),
    supabase.from("equipment").select("id, name, asset_number").order("name", { ascending: true }),
    supabase.from("operators").select("id, full_name").eq("status", "active").order("full_name", { ascending: true }),
    supabase
      .from("job_equipment")
      .select(`
        *,
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
          company_name
        ),
        purchase_orders:purchase_order_id (
          id,
          po_number,
          status
        )
      `)
      .eq("job_id", params.id)
      .order("created_at", { ascending: true }),
    supabase.from("suppliers").select("id, company_name").eq("status", "active").order("company_name", { ascending: true }),
    supabase.from("purchase_orders").select("id, po_number").order("created_at", { ascending: false }).limit(300),
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
                Update main job details and manage multiple equipment allocations.
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
                    label="Legacy primary crane"
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

                  <Field label="Job date" name="job_date" type="date" defaultValue={job.job_date ?? ""} />
                  <Field label="Start time" name="start_time" defaultValue={job.start_time ?? ""} />
                  <Field label="End time" name="end_time" defaultValue={job.end_time ?? ""} />
                  <Field label="Site name" name="site_name" defaultValue={job.site_name ?? ""} />
                  <Field label="Site contact" name="contact_name" defaultValue={job.contact_name ?? ""} />
                  <Field label="Site phone" name="contact_phone" defaultValue={job.contact_phone ?? ""} />
                  <Field label="Hire type" name="hire_type" defaultValue={job.hire_type ?? ""} />
                  <Field label="Lift type" name="lift_type" defaultValue={job.lift_type ?? ""} />
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
