import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function generateTransportNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const stamp = `${d.getHours()}${d.getMinutes()}${d.getSeconds()}`;
  return `TR-${y}${m}${day}-${stamp}`;
}

async function createTransportJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const payload = {
    transport_number: clean(formData.get("transport_number")) || generateTransportNumber(),
    linked_job_id: clean(formData.get("linked_job_id")) || null,
    client_id: clean(formData.get("client_id")) || null,
    vehicle_id: clean(formData.get("vehicle_id")) || null,
    operator_id: clean(formData.get("operator_id")) || null,
    job_type: clean(formData.get("job_type")) || null,
    collection_address: clean(formData.get("collection_address")) || null,
    delivery_address: clean(formData.get("delivery_address")) || null,
    transport_date: clean(formData.get("transport_date")) || null,
    collection_time: clean(formData.get("collection_time")) || null,
    delivery_time: clean(formData.get("delivery_time")) || null,
    load_description: clean(formData.get("load_description")) || null,
    status: clean(formData.get("status")) || "planned",
    price: Number(formData.get("price") ?? 0) || 0,
    notes: clean(formData.get("notes")) || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("transport_jobs")
    .insert(payload)
    .select("id, transport_number")
    .single();

  if (error || !data?.id) {
    redirect(`/transport-jobs/new?error=${encodeURIComponent(error?.message ?? "Could not create transport job.")}`);
  }

  redirect(`/transport-jobs/${data.id}?success=${encodeURIComponent(`${data.transport_number ?? "Transport job"} saved.`)}`);
}

export default async function NewTransportJobPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: clients }, { data: jobs }, { data: vehicles }, { data: operators }] =
    await Promise.all([
      supabase.from("clients").select("id, company_name").order("company_name", { ascending: true }),
      supabase.from("jobs").select("id, job_number, site_name").order("created_at", { ascending: false }).limit(300),
      supabase.from("vehicles").select("id, name, reg_number").order("name", { ascending: true }),
      supabase.from("operators").select("id, full_name").eq("status", "active").order("full_name", { ascending: true }),
    ]);

  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 32 }}>Create Transport Job</h1>
              <p style={{ opacity: 0.8, marginTop: 6 }}>
                Create haulage, delivery, collection or ballast transport work.
              </p>
            </div>

            <a href="/transport-jobs" style={secondaryBtn}>
              ← Back to transport jobs
            </a>
          </div>

          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <section style={sectionCard}>
            <form action={createTransportJob} style={{ display: "grid", gap: 14 }}>
              <div style={gridStyle}>
                <Field label="Transport number" name="transport_number" defaultValue={generateTransportNumber()} />
                <SelectField
                  label="Linked crane job"
                  name="linked_job_id"
                  options={(jobs ?? []).map((j: any) => ({
                    value: j.id,
                    label: `Job #${j.job_number ?? "—"}${j.site_name ? ` • ${j.site_name}` : ""}`,
                  }))}
                />
                <SelectField
                  label="Customer"
                  name="client_id"
                  options={(clients ?? []).map((c: any) => ({
                    value: c.id,
                    label: c.company_name ?? "Customer",
                  }))}
                />
                <SelectField
                  label="Vehicle"
                  name="vehicle_id"
                  options={(vehicles ?? []).map((v: any) => ({
                    value: v.id,
                    label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
                  }))}
                />
                <SelectField
                  label="Driver"
                  name="operator_id"
                  options={(operators ?? []).map((o: any) => ({
                    value: o.id,
                    label: o.full_name ?? "Driver",
                  }))}
                />
                <SelectField
                  label="Job type"
                  name="job_type"
                  defaultValue="haulage"
                  options={[
                    { value: "haulage", label: "haulage" },
                    { value: "delivery", label: "delivery" },
                    { value: "collection", label: "collection" },
                    { value: "ballast", label: "ballast" },
                    { value: "crane_support", label: "crane_support" },
                  ]}
                />
                <Field label="Transport date" name="transport_date" type="date" />
                <Field label="Collection time" name="collection_time" type="time" />
                <Field label="Delivery time" name="delivery_time" type="time" />
                <SelectField
                  label="Status"
                  name="status"
                  defaultValue="planned"
                  options={[
                    { value: "planned", label: "planned" },
                    { value: "confirmed", label: "confirmed" },
                    { value: "in_progress", label: "in_progress" },
                    { value: "completed", label: "completed" },
                    { value: "cancelled", label: "cancelled" },
                  ]}
                />
                <Field label="Price" name="price" type="number" defaultValue="0" />
              </div>

              <FullWidthField label="Collection address" name="collection_address" />
              <FullWidthField label="Delivery address" name="delivery_address" />
              <FullWidthField label="Load description" name="load_description" />
              <FullWidthField label="Notes" name="notes" />

              <div>
                <button type="submit" style={primaryBtn}>
                  Save transport job
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
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea name={name} defaultValue={defaultValue} rows={3} style={textareaStyle} />
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
