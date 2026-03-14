import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function updateVehicle(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect(`/vehicles?error=${encodeURIComponent("Vehicle id missing.")}`);
  }

  const payload = {
    name: clean(formData.get("name")) || null,
    reg_number: clean(formData.get("reg_number")) || null,
    vehicle_type: clean(formData.get("vehicle_type")) || null,
    capacity: clean(formData.get("capacity")) || null,
    trailer_type: clean(formData.get("trailer_type")) || null,
    status: clean(formData.get("status")) || "active",
    mot_due_date: clean(formData.get("mot_due_date")) || null,
    service_due_date: clean(formData.get("service_due_date")) || null,
    inspection_due_date: clean(formData.get("inspection_due_date")) || null,
    notes: clean(formData.get("notes")) || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("vehicles").update(payload).eq("id", id);

  if (error) {
    redirect(`/vehicles/${id}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/vehicles/${id}?success=${encodeURIComponent(`${payload.name ?? "Vehicle"} updated.`)}`);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

export default async function VehicleDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: vehicle, error }, { data: transportJobs }] = await Promise.all([
    supabase.from("vehicles").select("*").eq("id", params.id).single(),
    supabase
      .from("transport_jobs")
      .select(`
        *,
        clients:client_id (
          company_name
        ),
        jobs:linked_job_id (
          id,
          job_number,
          site_name
        )
      `)
      .eq("vehicle_id", params.id)
      .order("transport_date", { ascending: false }),
  ]);

  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 32 }}>{vehicle?.name ?? "Vehicle"}</h1>
              <p style={{ opacity: 0.8, marginTop: 6 }}>
                Vehicle details and linked transport jobs.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/vehicles" style={secondaryBtn}>
                ← Back to vehicles
              </a>
              <a href="/transport-jobs/new" style={secondaryBtn}>
                + New transport job
              </a>
            </div>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
          {error ? <div style={errorBox}>{error.message}</div> : null}

          {!vehicle ? (
            <div style={errorBox}>Vehicle not found.</div>
          ) : (
            <div style={pageGrid}>
              <section style={sectionCard}>
                <h2 style={sectionTitle}>Vehicle details</h2>

                <form action={updateVehicle} style={{ display: "grid", gap: 14 }}>
                  <input type="hidden" name="id" value={vehicle.id} />

                  <div style={gridStyle}>
                    <Field label="Vehicle name" name="name" defaultValue={vehicle.name ?? ""} />
                    <Field label="Registration" name="reg_number" defaultValue={vehicle.reg_number ?? ""} />
                    <Field label="Vehicle type" name="vehicle_type" defaultValue={vehicle.vehicle_type ?? ""} />
                    <Field label="Capacity" name="capacity" defaultValue={vehicle.capacity ?? ""} />
                    <Field label="Trailer type" name="trailer_type" defaultValue={vehicle.trailer_type ?? ""} />
                    <SelectField
                      label="Status"
                      name="status"
                      defaultValue={vehicle.status ?? "active"}
                      options={[
                        { value: "active", label: "active" },
                        { value: "workshop", label: "workshop" },
                        { value: "off_hire", label: "off_hire" },
                        { value: "inactive", label: "inactive" },
                      ]}
                    />
                    <Field label="MOT due" name="mot_due_date" type="date" defaultValue={vehicle.mot_due_date ?? ""} />
                    <Field label="Service due" name="service_due_date" type="date" defaultValue={vehicle.service_due_date ?? ""} />
                    <Field label="Inspection due" name="inspection_due_date" type="date" defaultValue={vehicle.inspection_due_date ?? ""} />
                  </div>

                  <FullWidthField label="Notes" name="notes" defaultValue={vehicle.notes ?? ""} />

                  <div>
                    <button type="submit" style={primaryBtn}>
                      Update vehicle
                    </button>
                  </div>
                </form>
              </section>

              <section style={sectionCard}>
                <h2 style={sectionTitle}>Linked transport jobs</h2>

                {!transportJobs || transportJobs.length === 0 ? (
                  <p style={{ margin: 0 }}>No transport jobs linked to this vehicle yet.</p>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {transportJobs.map((item: any) => {
                      const client = Array.isArray(item.clients) ? item.clients[0] : item.clients;
                      const linkedJob = Array.isArray(item.jobs) ? item.jobs[0] : item.jobs;

                      return (
                        <div key={item.id} style={miniCard}>
                          <div style={{ fontWeight: 1000 }}>
                            {item.transport_number ?? "Transport Job"}
                          </div>
                          <div style={{ marginTop: 4, opacity: 0.72 }}>
                            {client?.company_name ?? "—"} • {item.job_type ?? "—"}
                          </div>
                          <div style={{ marginTop: 4, opacity: 0.72 }}>
                            {fmtDate(item.transport_date)} • {item.status ?? "—"}
                          </div>
                          <div style={{ marginTop: 4, opacity: 0.72 }}>
                            Linked crane job: {linkedJob?.job_number ?? "—"}
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <a href={`/transport-jobs/${item.id}`} style={miniLinkBtn}>
                              Open transport job
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
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

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const pageGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.1fr 0.9fr",
  gap: 16,
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
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

const miniCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.52)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 12,
};

const miniLinkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 9,
  textDecoration: "none",
  background: "rgba(255,255,255,0.72)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
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

const successBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#0b7a4b",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
