import ClientShell from "../../../ClientShell";
import JobEquipmentManager from "../JobEquipmentManager";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

function clean(value: FormDataEntryValue | null) {
  const v = String(value ?? "").trim();
  return v.length ? v : null;
}

function numberOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const INVOICE_STATUSES = [
  "Not Invoiced",
  "Invoiced",
  "Part Paid",
  "Paid",
];

export default async function EditJobPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  async function updateJob(formData: FormData) {
    "use server";

    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      redirect(`/jobs/${params.id}/edit?error=${encodeURIComponent("Not signed in.")}`);
    }

    const client_id = clean(formData.get("client_id"));
    const operator_id = clean(formData.get("operator_id"));
    const status = clean(formData.get("status")) ?? "planned";
    const job_date = clean(formData.get("job_date"));
    const start_time = clean(formData.get("start_time"));
    const end_time = clean(formData.get("end_time"));
    const site_name = clean(formData.get("site_name"));
    const site_contact = clean(formData.get("site_contact"));
    const site_phone = clean(formData.get("site_phone"));
    const hire_type = clean(formData.get("hire_type"));
    const lift_type = clean(formData.get("lift_type"));
    const supplier_id = clean(formData.get("supplier_id"));
    const supplier_reference = clean(formData.get("supplier_reference"));
    const supplier_cost = numberOrNull(formData.get("supplier_cost"));
    const site_address = clean(formData.get("site_address"));
    const notes = clean(formData.get("notes"));

    const invoice_status =
      clean(formData.get("invoice_status")) ?? "Not Invoiced";
    const invoice_number = clean(formData.get("invoice_number"));
    const invoice_created_at = clean(formData.get("invoice_created_at"));
    const invoice_due_at = clean(formData.get("invoice_due_at"));
    const invoice_notes = clean(formData.get("invoice_notes"));
    const invoice_subtotal = numberOrNull(formData.get("invoice_subtotal"));
    const invoice_vat = numberOrNull(formData.get("invoice_vat"));
    const total_invoice = numberOrNull(formData.get("total_invoice"));

    if (!job_date) {
      redirect(
        `/jobs/${params.id}/edit?error=${encodeURIComponent("Job date is required.")}`
      );
    }

    if (!INVOICE_STATUSES.includes(invoice_status)) {
      redirect(
        `/jobs/${params.id}/edit?error=${encodeURIComponent("Invalid invoice status.")}`
      );
    }

    const payload: Record<string, any> = {
      client_id,
      operator_id,
      status,
      job_date,
      start_time,
      end_time,
      site_name,
      site_contact,
      site_phone,
      hire_type,
      lift_type,
      supplier_id,
      supplier_reference,
      supplier_cost,
      site_address,
      notes,
      invoice_status,
      invoice_number,
      invoice_created_at,
      invoice_due_at,
      invoice_notes,
      invoice_subtotal,
      invoice_vat,
      total_invoice,
    };

    const { error } = await supabase
      .from("jobs")
      .update(payload)
      .eq("id", params.id);

    if (error) {
      redirect(
        `/jobs/${params.id}/edit?error=${encodeURIComponent(error.message)}`
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "update",
      entity_type: "job",
      entity_id: params.id,
      meta: {
        client_id,
        operator_id,
        job_date,
        status,
        site_name,
        invoice_status,
        invoice_number,
        total_invoice,
      },
    });

    redirect(`/jobs/${params.id}?saved=1`);
  }

  const [
    { data: job },
    { data: clients },
    { data: operators },
    { data: suppliers },
    { data: allocations },
    { data: cranes },
    { data: vehicles },
    { data: equipment },
    { data: purchaseOrders },
  ] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", params.id).single(),
    supabase.from("clients").select("id, company_name").order("company_name"),
    supabase.from("operators").select("id, full_name").order("full_name"),
    supabase.from("suppliers").select("id, company_name, category").order("company_name"),
    supabase.from("job_equipment").select("*").eq("job_id", params.id).order("created_at"),
    supabase.from("cranes").select("id, name, reg_number, capacity").eq("archived", false).order("name"),
    supabase.from("vehicles").select("id, name, reg_number").eq("archived", false).order("name"),
    supabase.from("equipment").select("id, name, asset_number").eq("archived", false).order("name"),
    supabase.from("purchase_orders").select("id, po_number, status").order("created_at", { ascending: false }),
  ]);

  if (!job) {
    return (
      <ClientShell>
        <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
          <h1 style={{ marginBottom: 12 }}>Edit Job</h1>
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,0,0,0.08)",
              border: "1px solid rgba(255,0,0,0.18)",
            }}
          >
            Job not found.
          </div>
        </div>
      </ClientShell>
    );
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Edit Job</h1>
            <div style={{ opacity: 0.75, marginTop: 6 }}>
              Update main job details, invoice details, supplier details and manage multiple equipment allocations.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <a
              href={`/jobs/${params.id}`}
              style={secondaryLinkStyle}
            >
              View job
            </a>
            <a
              href="/jobs"
              style={secondaryLinkStyle}
            >
              ← Back
            </a>
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.18)",
            padding: 18,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.35)",
          }}
        >
          <form action={updateJob} style={{ display: "grid", gap: 18 }}>
            <section style={{ display: "grid", gap: 12 }}>
              <div style={sectionTitleStyle}>Main Job Details</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Customer</label>
                  <select name="client_id" defaultValue={job.client_id ?? ""} style={inputStyle}>
                    <option value="">— Select —</option>
                    {(clients ?? []).map((client: any) => (
                      <option key={client.id} value={client.id}>
                        {client.company_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Primary operator</label>
                  <select name="operator_id" defaultValue={job.operator_id ?? ""} style={inputStyle}>
                    <option value="">— Select —</option>
                    {(operators ?? []).map((operator: any) => (
                      <option key={operator.id} value={operator.id}>
                        {operator.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Status</label>
                  <select name="status" defaultValue={job.status ?? "planned"} style={inputStyle}>
                    <option value="enquiry">Enquiry</option>
                    <option value="quoted">Quoted</option>
                    <option value="provisional">Provisional</option>
                    <option value="planned">Planned</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Job date</label>
                  <input type="date" name="job_date" defaultValue={job.job_date ?? ""} style={inputStyle} />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Start time</label>
                  <input type="time" name="start_time" defaultValue={job.start_time ?? ""} style={inputStyle} />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>End time</label>
                  <input type="time" name="end_time" defaultValue={job.end_time ?? ""} style={inputStyle} />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Site name</label>
                  <input type="text" name="site_name" defaultValue={job.site_name ?? ""} style={inputStyle} />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Site contact</label>
                  <input type="text" name="site_contact" defaultValue={job.site_contact ?? job.contact_name ?? ""} style={inputStyle} />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Site phone</label>
                  <input type="text" name="site_phone" defaultValue={job.site_phone ?? job.contact_phone ?? ""} style={inputStyle} />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Hire type</label>
                  <input type="text" name="hire_type" defaultValue={job.hire_type ?? ""} style={inputStyle} />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Lift type</label>
                  <input type="text" name="lift_type" defaultValue={job.lift_type ?? ""} style={inputStyle} />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Primary supplier</label>
                  <select name="supplier_id" defaultValue={job.supplier_id ?? ""} style={inputStyle}>
                    <option value="">— Select —</option>
                    {(suppliers ?? []).map((supplier: any) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.company_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Supplier reference</label>
                  <input
                    type="text"
                    name="supplier_reference"
                    defaultValue={job.supplier_reference ?? ""}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Supplier cost</label>
                  <input
                    type="number"
                    step="0.01"
                    name="supplier_cost"
                    defaultValue={job.supplier_cost ?? ""}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label style={labelStyle}>Site address</label>
                <textarea
                  name="site_address"
                  defaultValue={job.site_address ?? ""}
                  rows={3}
                  style={textareaStyle}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label style={labelStyle}>Notes</label>
                <textarea name="notes" defaultValue={job.notes ?? ""} rows={4} style={textareaStyle} />
              </div>
            </section>

            <section style={{ display: "grid", gap: 12 }}>
              <div style={sectionTitleStyle}>Invoice Details</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Invoice status</label>
                  <select
                    name="invoice_status"
                    defaultValue={job.invoice_status ?? "Not Invoiced"}
                    style={inputStyle}
                  >
                    {INVOICE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Invoice number</label>
                  <input
                    type="text"
                    name="invoice_number"
                    defaultValue={job.invoice_number ?? ""}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Invoice created</label>
                  <input
                    type="date"
                    name="invoice_created_at"
                    defaultValue={
                      job.invoice_created_at
                        ? String(job.invoice_created_at).slice(0, 10)
                        : ""
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Invoice due</label>
                  <input
                    type="date"
                    name="invoice_due_at"
                    defaultValue={
                      job.invoice_due_at ? String(job.invoice_due_at).slice(0, 10) : ""
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Invoice subtotal</label>
                  <input
                    type="number"
                    step="0.01"
                    name="invoice_subtotal"
                    defaultValue={job.invoice_subtotal ?? ""}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Invoice VAT</label>
                  <input
                    type="number"
                    step="0.01"
                    name="invoice_vat"
                    defaultValue={job.invoice_vat ?? ""}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Total invoice</label>
                  <input
                    type="number"
                    step="0.01"
                    name="total_invoice"
                    defaultValue={job.total_invoice ?? ""}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label style={labelStyle}>Invoice notes</label>
                <textarea
                  name="invoice_notes"
                  defaultValue={job.invoice_notes ?? ""}
                  rows={3}
                  style={textareaStyle}
                />
              </div>
            </section>

            <div>
              <button type="submit" style={buttonStyle}>
                Save job details
              </button>
            </div>
          </form>

          <div style={{ marginTop: 18 }}>
            <JobEquipmentManager
              jobId={params.id}
              initialAllocations={allocations ?? []}
              craneOptions={((cranes ?? []) as any[]).map((crane) => ({
                value: crane.id,
                label: `${crane.name ?? "Crane"}${crane.reg_number ? ` (${crane.reg_number})` : ""}${crane.capacity ? ` • ${crane.capacity}` : ""}`,
              }))}
              vehicleOptions={((vehicles ?? []) as any[]).map((vehicle) => ({
                value: vehicle.id,
                label: `${vehicle.name ?? "Vehicle"}${vehicle.reg_number ? ` (${vehicle.reg_number})` : ""}`,
              }))}
              equipmentOptions={((equipment ?? []) as any[]).map((item) => ({
                value: item.id,
                label: `${item.name ?? "Equipment"}${item.asset_number ? ` (${item.asset_number})` : ""}`,
              }))}
              operatorOptions={((operators ?? []) as any[]).map((operator) => ({
                value: operator.id,
                label: operator.full_name ?? "Operator",
              }))}
              supplierOptions={((suppliers ?? []) as any[]).map((supplier) => ({
                value: supplier.id,
                label: supplier.company_name ?? "Supplier",
                category: supplier.category ?? "",
              }))}
              purchaseOrderOptions={((purchaseOrders ?? []) as any[]).map((po) => ({
                value: po.id,
                label: `${po.po_number ?? "PO"}${po.status ? ` • ${po.status}` : ""}`,
              }))}
              defaultDate={job.job_date ?? ""}
              defaultStartTime={job.start_time ?? ""}
              defaultEndTime={job.end_time ?? ""}
            />
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  opacity: 0.9,
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

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.8)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};
