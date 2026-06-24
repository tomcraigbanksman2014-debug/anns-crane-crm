import ClientShell from "../../../ClientShell";
import PreviousPageBackButton from "../../../components/PreviousPageBackButton";
import ServerSubmitButton from "../../../components/ServerSubmitButton";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";
import { buildQuarterHourOptions } from "../../../lib/timeOptions";
import MultiSupplierFields from "../../../components/MultiSupplierFields";
import { CRANE_JOB_SITE_CONTACT_ERROR } from "../../../lib/jobContactValidation";
import {
  buildFallbackSupplierLink,
  normaliseSupplierLinks,
  parseSupplierLinksFromFormData,
  replaceJobSupplierLinks,
} from "../../../lib/jobSupplierLinks";

function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
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

function countBillableDays(startDate: string, endDate: string, excludeWeekends: boolean) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    const isWeekend = day === 0 || day === 6;

    if (!excludeWeekends || !isWeekend) {
      count += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function money(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const INVOICE_STATUSES = [
  "Not Invoiced",
  "Invoiced",
  "Part Paid",
  "Paid",
];

async function updateJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect(`/jobs?error=${encodeURIComponent("Job id missing.")}`);
  }

  const startDate = clean(formData.get("start_date")) || null;
  const endDate = clean(formData.get("end_date")) || null;

  if (!startDate || !endDate) {
    redirect(`/jobs/${id}/edit?error=${encodeURIComponent("Start date and end date are required.")}`);
  }

  if (endDate < startDate) {
    redirect(`/jobs/${id}/edit?error=${encodeURIComponent("End date cannot be earlier than start date.")}`);
  }

  const siteContactName = clean(formData.get("contact_name")) || null;
  const siteContactPhone = clean(formData.get("contact_phone")) || null;

  if (!siteContactName || !siteContactPhone) {
    redirect(`/jobs/${id}/edit?error=${encodeURIComponent(CRANE_JOB_SITE_CONTACT_ERROR)}`);
  }

  const priceMode = clean(formData.get("price_mode")) || "full_job";
  const excludeWeekends = clean(formData.get("exclude_weekends")) === "on";
  const fullJobPrice = numberOrZero(formData.get("full_job_price"));
  const pricePerDay = numberOrZero(formData.get("price_per_day"));
  const billableDays = countBillableDays(startDate, endDate, excludeWeekends);

  const calculatedSubtotal =
    priceMode === "per_day"
      ? Number((pricePerDay * billableDays).toFixed(2))
      : Number(fullJobPrice.toFixed(2));

  // Price mode/full-job price/price-per-day are the source of truth when editing a job.
  // The invoice_subtotal input is displayed for visibility, but older form values must not
  // override a newly edited job price and leave the planner showing stale money.
  const invoiceSubtotal = calculatedSubtotal;
  const invoiceVat = Number((invoiceSubtotal * 0.2).toFixed(2));
  const invoiceTotal = Number((invoiceSubtotal + invoiceVat).toFixed(2));
  const supplierLinks = parseSupplierLinksFromFormData(formData);
  const primarySupplierLink = supplierLinks.find((row) => row.is_primary) ?? supplierLinks[0] ?? null;

  const payload = {
    client_id: clean(formData.get("client_id")) || null,
    equipment_id: clean(formData.get("equipment_id")) || null,
    supplier_id: (primarySupplierLink?.supplier_id ?? clean(formData.get("supplier_id"))) || null,
    site_name: clean(formData.get("site_name")) || null,
    site_address: clean(formData.get("site_address")) || null,
    contact_name: siteContactName,
    contact_phone: siteContactPhone,
    start_date: startDate,
    end_date: endDate,
    job_date: startDate,
    start_time: clean(formData.get("start_time")) || "08:00",
    end_time: clean(formData.get("end_time")) || "16:00",
    status: clean(formData.get("status")) || "draft",
    hire_type: clean(formData.get("hire_type")) || null,
    lift_type: clean(formData.get("lift_type")) || null,
    notes: clean(formData.get("notes")) || null,
    price_mode: priceMode,
    price_per_day: priceMode === "per_day" ? pricePerDay : null,
    exclude_weekends: excludeWeekends,
    invoice_status: clean(formData.get("invoice_status")) || "Not Invoiced",
    invoice_number: clean(formData.get("invoice_number")) || null,
    invoice_date: clean(formData.get("invoice_date")) || null,
    invoice_due_date: clean(formData.get("invoice_due_date")) || null,
    invoice_notes: clean(formData.get("invoice_notes")) || null,
    invoice_subtotal: invoiceSubtotal,
    invoice_vat: invoiceVat,
    invoice_total: invoiceTotal,
    total_invoice: invoiceTotal,
    amount_paid: numberOrNull(formData.get("amount_paid")),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("jobs")
    .update(payload)
    .eq("id", id);

  if (error) {
    redirect(`/jobs/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  try {
    await replaceJobSupplierLinks(supabase, id, supplierLinks);
  } catch (supplierError: any) {
    redirect(`/jobs/${id}/edit?error=${encodeURIComponent(supplierError?.message || "Could not save job suppliers.")}`);
  }

  redirect(`/jobs/${id}?success=${encodeURIComponent("Job updated.")}`);
}

export default async function EditJobPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const timeOptions = buildQuarterHourOptions();

  const [
    { data: job, error: jobError },
    { data: customers, error: customersError },
    { data: equipment, error: equipmentError },
    { data: suppliers, error: suppliersError },
    { data: jobSupplierLinks },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        client_id,
        equipment_id,
        supplier_id,
        booking_id,
        site_name,
        site_address,
        contact_name,
        contact_phone,
        job_date,
        start_date,
        end_date,
        start_time,
        end_time,
        status,
        hire_type,
        lift_type,
        notes,
        invoice_status,
        invoice_number,
        invoice_date,
        invoice_due_date,
        invoice_notes,
        invoice_subtotal,
        invoice_vat,
        invoice_total,
        invoice_amount,
        total_invoice,
        amount_paid,
        price_mode,
        price_per_day,
        exclude_weekends
      `)
      .eq("id", params.id)
      .single(),

    supabase
      .from("clients")
      .select("id, company_name, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),

    supabase
      .from("equipment")
      .select("id, name, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("suppliers")
      .select("id, company_name, category, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),

    supabase
      .from("job_supplier_links")
      .select(`
        id,
        supplier_id,
        supplier_display_name,
        supplier_category,
        supplier_reference,
        service_description,
        supplier_cost,
        notes,
        is_primary,
        sort_order,
        suppliers:supplier_id (
          id,
          company_name,
          category
        )
      `)
      .eq("job_id", params.id)
      .order("sort_order", { ascending: true }),
  ]);

  const errorMessage =
    searchParams?.error ||
    jobError?.message ||
    customersError?.message ||
    equipmentError?.message ||
    suppliersError?.message ||
    "";

  const currentFullJobPrice =
    job?.invoice_subtotal ?? job?.invoice_amount ?? job?.total_invoice ?? 0;

  const defaultStartTime = job?.start_time ? String(job.start_time).slice(0, 5) : "08:00";
  const defaultEndTime = job?.end_time ? String(job.end_time).slice(0, 5) : "16:00";
  const currentInvoiceSubtotal = job?.invoice_subtotal ?? currentFullJobPrice ?? 0;
  const currentInvoiceVat = job?.invoice_vat ?? Number((Number(currentInvoiceSubtotal || 0) * 0.2).toFixed(2));
  const currentInvoiceTotal = job?.invoice_total ?? job?.total_invoice ?? Number((Number(currentInvoiceSubtotal || 0) + Number(currentInvoiceVat || 0)).toFixed(2));
  const supplierLinksForForm = normaliseSupplierLinks(
    jobSupplierLinks as any[] | null | undefined,
    buildFallbackSupplierLink({
      supplier_id: job?.supplier_id ?? null,
      service_description: "Legacy / primary supplier",
    })
  );

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
        <div style={topRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Edit Job</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Update live job details.
            </p>
          </div>

          <PreviousPageBackButton fallbackHref={job?.id ? `/jobs/${job.id}` : "/jobs"} label="← Back" style={backBtn} />
        </div>

        {errorMessage ? (
          <div style={errorBox}>{decodeURIComponent(errorMessage)}</div>
        ) : !job ? (
          <div style={errorBox}>Job not found.</div>
        ) : (
          <form action={updateJob} style={cardStyle}>
            <input type="hidden" name="id" value={job.id} />

            <div style={grid2}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Customer</label>
                <select name="client_id" defaultValue={job.client_id ?? ""} style={inputStyle}>
                  <option value="">Select customer</option>
                  {(customers ?? []).map((customer: any) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company_name ?? "Unnamed customer"}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Crane / equipment</label>
                <select name="equipment_id" defaultValue={job.equipment_id ?? ""} style={inputStyle}>
                  <option value="">Select equipment</option>
                  {(equipment ?? []).map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name ?? "Unnamed equipment"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={grid3}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Job start date *</label>
                <input
                  type="date"
                  name="start_date"
                  defaultValue={job.start_date ?? job.job_date ?? ""}
                  style={inputStyle}
                />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Job end date *</label>
                <input
                  type="date"
                  name="end_date"
                  defaultValue={job.end_date ?? job.job_date ?? ""}
                  style={inputStyle}
                />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Status</label>
                <select name="status" defaultValue={job.status ?? "draft"} style={inputStyle}>
                  <option value="draft">Draft</option>
                  <option value="provisional">Provisional</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="late_cancelled">Late Cancelled</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div style={grid2}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Start time</label>
                <select name="start_time" defaultValue={defaultStartTime} style={inputStyle}>
                  <option value="">Select time</option>
                  {timeOptions.map((option) => (
                    <option key={`start-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>End time</label>
                <select name="end_time" defaultValue={defaultEndTime} style={inputStyle}>
                  <option value="">Select time</option>
                  {timeOptions.map((option) => (
                    <option key={`end-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Site name</label>
              <input name="site_name" defaultValue={job.site_name ?? ""} style={inputStyle} />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Site address</label>
              <textarea name="site_address" defaultValue={job.site_address ?? ""} rows={3} style={textareaStyle} />
            </div>

            <div style={grid2}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Site contact name *</label>
                <input name="contact_name" defaultValue={job.contact_name ?? ""} style={inputStyle} required />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Site contact number *</label>
                <input name="contact_phone" defaultValue={job.contact_phone ?? ""} style={inputStyle} required />
              </div>
            </div>

            <div style={grid2}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Hire type</label>
                <input name="hire_type" defaultValue={job.hire_type ?? ""} style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Lift type</label>
                <input name="lift_type" defaultValue={job.lift_type ?? ""} style={inputStyle} />
              </div>
            </div>

            <section style={pricingBox}>
              <h3 style={pricingHeading}>Pricing</h3>

              <div style={grid4}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Price mode</label>
                  <select name="price_mode" defaultValue={job.price_mode ?? "full_job"} style={inputStyle}>
                    <option value="full_job">Full job price</option>
                    <option value="per_day">Price per day</option>
                  </select>
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Full job price</label>
                  <input
                    name="full_job_price"
                    type="number"
                    step="0.01"
                    defaultValue={job.price_mode === "per_day" ? "" : String(currentFullJobPrice ?? 0)}
                    style={inputStyle}
                  />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Price per day</label>
                  <input
                    name="price_per_day"
                    type="number"
                    step="0.01"
                    defaultValue={job.price_per_day != null ? String(job.price_per_day) : "0"}
                    style={inputStyle}
                  />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Invoice subtotal</label>
                  <input
                    name="invoice_subtotal"
                    type="number"
                    step="0.01"
                    defaultValue={String(currentInvoiceSubtotal ?? 0)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={detailsSummaryRow}>
                <label style={checkboxRow}>
                  <input type="checkbox" name="exclude_weekends" defaultChecked={Boolean(job.exclude_weekends)} />
                  Free up weekends and continue the job after
                </label>
              </div>
            </section>

            <details style={detailsBox} open>
              <summary style={detailsSummary}>Cross-hire / supplier details</summary>

              <div style={{ marginTop: 14 }}>
                <input type="hidden" name="supplier_id" value={job.supplier_id ?? ""} />
                <MultiSupplierFields
                  initialLinks={supplierLinksForForm}
                  supplierOptions={((suppliers as any[]) ?? []).map((supplier: any) => ({
                    value: supplier.id,
                    label: supplier.company_name ?? "Supplier",
                    category: supplier.category ?? "",
                  }))}
                />
              </div>
            </details>

            <section style={pricingBox}>
              <h3 style={pricingHeading}>Invoice</h3>

              <div style={grid4}>
                <div style={fieldWrap}>
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

                <div style={fieldWrap}>
                  <label style={labelStyle}>Invoice number</label>
                  <input
                    name="invoice_number"
                    defaultValue={job.invoice_number ?? ""}
                    style={inputStyle}
                  />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Invoice date</label>
                  <input
                    type="date"
                    name="invoice_date"
                    defaultValue={job.invoice_date ?? ""}
                    style={inputStyle}
                  />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Due date</label>
                  <input
                    type="date"
                    name="invoice_due_date"
                    defaultValue={job.invoice_due_date ?? ""}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={grid3}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>VAT</label>
                  <input
                    value={String(currentInvoiceVat ?? 0)}
                    readOnly
                    style={{ ...inputStyle, background: "rgba(255,255,255,0.7)" }}
                  />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Invoice total</label>
                  <input
                    value={String(currentInvoiceTotal ?? 0)}
                    readOnly
                    style={{ ...inputStyle, background: "rgba(255,255,255,0.7)" }}
                  />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Amount paid</label>
                  <input
                    name="amount_paid"
                    type="number"
                    step="0.01"
                    defaultValue={job.amount_paid != null ? String(job.amount_paid) : ""}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Invoice notes</label>
                <textarea
                  name="invoice_notes"
                  defaultValue={job.invoice_notes ?? ""}
                  rows={4}
                  style={textareaStyle}
                />
              </div>
            </section>

            <div style={fieldWrap}>
              <label style={labelStyle}>Notes</label>
              <textarea name="notes" defaultValue={job.notes ?? ""} rows={5} style={textareaStyle} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <ServerSubmitButton style={primaryBtn} pendingText="Updating job…">Update job</ServerSubmitButton>
              <a href={`/jobs/${job.id}`} style={secondaryBtn}>Cancel</a>
            </div>
          </form>
        )}
      </div>
    </ClientShell>
  );
}

const topRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const backBtn: React.CSSProperties = {
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

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  display: "grid",
  gap: 14,
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.88)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.88)",
  boxSizing: "border-box",
  resize: "vertical",
};

const pricingBox: React.CSSProperties = {
  background: "rgba(255,255,255,0.28)",
  borderRadius: 14,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.35)",
  display: "grid",
  gap: 12,
};

const pricingHeading: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 900,
};

const detailsBox: React.CSSProperties = {
  background: "rgba(255,255,255,0.28)",
  borderRadius: 14,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.35)",
};

const detailsSummary: React.CSSProperties = {
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 16,
};

const detailsSummaryRow: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontSize: 14,
  fontWeight: 700,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  textDecoration: "none",
};
