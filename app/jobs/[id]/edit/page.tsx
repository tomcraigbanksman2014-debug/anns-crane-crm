import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function numberOrZero(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function updateJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect("/jobs?error=Missing job id");
  }

  const payload = {
    client_id: clean(formData.get("client_id")) || null,
    site_name: clean(formData.get("site_name")) || null,
    site_address: clean(formData.get("site_address")) || null,
    contact_name: clean(formData.get("contact_name")) || null,
    contact_phone: clean(formData.get("contact_phone")) || null,
    job_date: clean(formData.get("job_date")) || null,
    start_time: clean(formData.get("start_time")) || null,
    end_time: clean(formData.get("end_time")) || null,
    status: clean(formData.get("status")) || "draft",
    hire_type: clean(formData.get("hire_type")) || null,
    lift_type: clean(formData.get("lift_type")) || null,
    notes: clean(formData.get("notes")) || null,
    supplier_id: clean(formData.get("supplier_id")) || null,
    supplier_reference: clean(formData.get("supplier_reference")) || null,
    supplier_cost: numberOrZero(formData.get("supplier_cost")),
    invoice_status: clean(formData.get("invoice_status")) || "Not Invoiced",
    invoice_number: clean(formData.get("invoice_number")) || null,
    invoice_created_at: clean(formData.get("invoice_created_at")) || null,
    invoice_due_date: clean(formData.get("invoice_due_date")) || null,
    invoice_notes: clean(formData.get("invoice_notes")) || null,
    invoice_subtotal: numberOrZero(formData.get("invoice_subtotal")),
    invoice_vat: numberOrZero(formData.get("invoice_vat")),
    invoice_total: numberOrZero(formData.get("invoice_total")),
    total_invoice: numberOrZero(formData.get("invoice_total")),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("jobs").update(payload).eq("id", id);

  if (error) {
    redirect(`/jobs/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/jobs/${id}?success=${encodeURIComponent("Job updated.")}`);
}

function moneyString(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

export default async function EditJobPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: job, error: jobError },
    { data: clients },
    { data: suppliers },
    { data: allocations },
  ] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", params.id).single(),
    supabase
      .from("clients")
      .select("id, company_name")
      .eq("archived", false)
      .order("company_name", { ascending: true }),
    supabase
      .from("suppliers")
      .select("id, company_name")
      .eq("archived", false)
      .order("company_name", { ascending: true }),
    supabase
      .from("job_equipment")
      .select("agreed_sell_rate, agreed_cost, supplier_cost")
      .eq("job_id", params.id),
  ]);

  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  const allocationList = allocations ?? [];
  const liveSellSubtotal = allocationList.reduce(
    (sum: number, item: any) => sum + Number(item.agreed_sell_rate ?? item.agreed_cost ?? 0),
    0
  );
  const liveCostSubtotal = allocationList.reduce(
    (sum: number, item: any) => sum + Number(item.supplier_cost ?? item.agreed_cost ?? 0),
    0
  );

  const defaultInvoiceSubtotal = Number(job?.invoice_subtotal ?? liveSellSubtotal ?? 0);
  const defaultInvoiceVat = Number(job?.invoice_vat ?? 0);
  const defaultInvoiceTotal = Number(job?.invoice_total ?? defaultInvoiceSubtotal + defaultInvoiceVat);

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={topRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>
                Edit Job {job?.job_number ? `#${job.job_number}` : ""}
              </h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Update job details, invoice fields and supplier information.
              </p>
            </div>

            <a href={`/jobs/${params.id}`} style={btnStyle}>
              ← Back to job
            </a>
          </div>

          {jobError ? <div style={errorBox}>{jobError.message}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
          {!job ? <div style={errorBox}>Job not found.</div> : null}

          {job ? (
            <form action={updateJob} style={{ marginTop: 18, display: "grid", gap: 18 }}>
              <input type="hidden" name="id" value={job.id} />

              <section style={sectionCard}>
                <div style={sectionTitle}>Job details</div>

                <div style={gridStyle}>
                  <Field label="Job number" value={String(job.job_number ?? "")} disabled />

                  <SelectField
                    label="Customer"
                    name="client_id"
                    defaultValue={job.client_id ?? ""}
                    options={(clients ?? []).map((c: any) => ({
                      value: c.id,
                      label: c.company_name ?? "Customer",
                    }))}
                  />

                  <Field label="Site name" name="site_name" defaultValue={job.site_name ?? ""} />
                  <Field label="Contact name" name="contact_name" defaultValue={job.contact_name ?? ""} />
                  <Field label="Contact phone" name="contact_phone" defaultValue={job.contact_phone ?? ""} />
                  <Field label="Job date" name="job_date" type="date" defaultValue={job.job_date ?? ""} />
                  <Field label="Start time" name="start_time" type="time" defaultValue={job.start_time ?? ""} />
                  <Field label="End time" name="end_time" type="time" defaultValue={job.end_time ?? ""} />

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

                  <Field label="Hire type" name="hire_type" defaultValue={job.hire_type ?? ""} />
                  <Field label="Lift type" name="lift_type" defaultValue={job.lift_type ?? ""} />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Site address</label>
                  <textarea name="site_address" defaultValue={job.site_address ?? ""} rows={3} style={textareaStyle} />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Notes</label>
                  <textarea name="notes" defaultValue={job.notes ?? ""} rows={4} style={textareaStyle} />
                </div>
              </section>

              <section style={sectionCard}>
                <div style={sectionTitle}>Supplier details</div>

                <div style={gridStyle}>
                  <SelectField
                    label="Supplier"
                    name="supplier_id"
                    defaultValue={job.supplier_id ?? ""}
                    options={(suppliers ?? []).map((s: any) => ({
                      value: s.id,
                      label: s.company_name ?? "Supplier",
                    }))}
                  />

                  <Field label="Supplier reference" name="supplier_reference" defaultValue={job.supplier_reference ?? ""} />
                  <Field label="Primary supplier cost" name="supplier_cost" type="number" defaultValue={moneyString(job.supplier_cost)} />
                  <Field label="Allocated cost live" value={moneyString(liveCostSubtotal)} disabled />
                </div>
              </section>

              <section style={sectionCard}>
                <div style={sectionTitle}>Invoice details</div>

                <div style={gridStyle}>
                  <SelectField
                    label="Invoice status"
                    name="invoice_status"
                    defaultValue={job.invoice_status ?? "Not Invoiced"}
                    options={[
                      { value: "Not Invoiced", label: "Not Invoiced" },
                      { value: "Invoiced", label: "Invoiced" },
                      { value: "Part Paid", label: "Part Paid" },
                      { value: "Paid", label: "Paid" },
                    ]}
                  />

                  <Field label="Invoice number" name="invoice_number" defaultValue={job.invoice_number ?? ""} />
                  <Field label="Invoice created" name="invoice_created_at" type="date" defaultValue={job.invoice_created_at ? String(job.invoice_created_at).slice(0, 10) : (job.invoice_date ?? "")} />
                  <Field label="Invoice due" name="invoice_due_date" type="date" defaultValue={job.invoice_due_date ?? ""} />
                  <Field label="Live allocated sell subtotal" value={moneyString(liveSellSubtotal)} disabled />
                  <Field label="Invoice subtotal" name="invoice_subtotal" type="number" defaultValue={moneyString(defaultInvoiceSubtotal)} />
                  <Field label="Invoice VAT" name="invoice_vat" type="number" defaultValue={moneyString(defaultInvoiceVat)} />
                  <Field label="Invoice total" name="invoice_total" type="number" defaultValue={moneyString(defaultInvoiceTotal)} />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Invoice notes</label>
                  <textarea name="invoice_notes" defaultValue={job.invoice_notes ?? ""} rows={4} style={textareaStyle} />
                </div>
              </section>

              <div>
                <button type="submit" style={saveBtn}>Save job details</button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  name,
  defaultValue,
  value,
  type = "text",
  disabled = false,
}: {
  label: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        value={value}
        type={type}
        style={inputStyle}
        disabled={disabled}
        readOnly={disabled}
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
