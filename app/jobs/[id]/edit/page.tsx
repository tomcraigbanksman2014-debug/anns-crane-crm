import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";
import { buildQuarterHourOptions } from "../../../lib/timeOptions";

function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

function numberOrZero(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
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

  const priceMode = clean(formData.get("price_mode")) || "full_job";
  const excludeWeekends = clean(formData.get("exclude_weekends")) === "on";
  const fullJobPrice = numberOrZero(formData.get("full_job_price"));
  const pricePerDay = numberOrZero(formData.get("price_per_day"));
  const billableDays = countBillableDays(startDate, endDate, excludeWeekends);

  const calculatedSubtotal =
    priceMode === "per_day"
      ? Number((pricePerDay * billableDays).toFixed(2))
      : Number(fullJobPrice.toFixed(2));

  const payload = {
    client_id: clean(formData.get("client_id")) || null,
    equipment_id: clean(formData.get("equipment_id")) || null,
    site_name: clean(formData.get("site_name")) || null,
    site_address: clean(formData.get("site_address")) || null,
    contact_name: clean(formData.get("contact_name")) || null,
    contact_phone: clean(formData.get("contact_phone")) || null,
    start_date: startDate,
    end_date: endDate,
    job_date: startDate,
    start_time: clean(formData.get("start_time")) || null,
    end_time: clean(formData.get("end_time")) || null,
    status: clean(formData.get("status")) || "draft",
    hire_type: clean(formData.get("hire_type")) || null,
    lift_type: clean(formData.get("lift_type")) || null,
    notes: clean(formData.get("notes")) || null,
    price_mode: priceMode,
    price_per_day: priceMode === "per_day" ? pricePerDay : null,
    exclude_weekends: excludeWeekends,
    invoice_subtotal: calculatedSubtotal,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("jobs")
    .update(payload)
    .eq("id", id);

  if (error) {
    redirect(`/jobs/${id}/edit?error=${encodeURIComponent(error.message)}`);
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
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        client_id,
        equipment_id,
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
        invoice_subtotal,
        invoice_amount,
        total_invoice,
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
  ]);

  const errorMessage =
    searchParams?.error ||
    jobError?.message ||
    customersError?.message ||
    equipmentError?.message ||
    "";

  const currentFullJobPrice =
    job?.invoice_subtotal ?? job?.invoice_amount ?? job?.total_invoice ?? 0;

  return (
    <ClientShell>
      <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
        <div style={topRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Edit Job</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Update live job details.
            </p>
          </div>

          <a href={job?.id ? `/jobs/${job.id}` : "/jobs"} style={backBtn}>
            ← Back
          </a>
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
                <input type="date" name="start_date" defaultValue={job.start_date ?? job.job_date ?? ""} style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Job end date *</label>
                <input type="date" name="end_date" defaultValue={job.end_date ?? job.job_date ?? ""} style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Status</label>
                <select name="status" defaultValue={job.status ?? "draft"} style={inputStyle}>
                  <option value="draft">Draft</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div style={grid2}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Start time</label>
                <select name="start_time" defaultValue={job.start_time ? String(job.start_time).slice(0, 5) : ""} style={inputStyle}>
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
                <select name="end_time" defaultValue={job.end_time ? String(job.end_time).slice(0, 5) : ""} style={inputStyle}>
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
                <label style={labelStyle}>Site contact name</label>
                <input name="contact_name" defaultValue={job.contact_name ?? ""} style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Site contact phone</label>
                <input name="contact_phone" defaultValue={job.contact_phone ?? ""} style={inputStyle} />
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

              <div style={grid2}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Price mode</label>
                  <select name="price_mode" defaultValue={job.price_mode ?? "full_job"} style={inputStyle}>
                    <option value="full_job">Full job price</option>
                    <option value="per_day">Price per day</option>
                  </select>
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Exclude weekends on multi-day jobs</label>
                  <label style={checkboxRow}>
                    <input type="checkbox" name="exclude_weekends" defaultChecked={Boolean(job.exclude_weekends)} />
                    Free up weekends and continue the job after
                  </label>
                </div>
              </div>

              <div style={grid2}>
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
                    defaultValue={job.price_per_day != null ? String(job.price_per_day) : ""}
                    style={inputStyle}
                  />
                </div>
              </div>
            </section>

            <div style={fieldWrap}>
              <label style={labelStyle}>Notes</label>
              <textarea name="notes" defaultValue={job.notes ?? ""} rows={5} style={textareaStyle} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>Update job</button>
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
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
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
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
  resize: "vertical",
};

const pricingBox: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const pricingHeading: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  minHeight: 42,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
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
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};
