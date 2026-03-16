import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function archiveCraneJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("job_id"));
  const archived = clean(formData.get("archived")) === "true";

  if (!id) {
    redirect("/admin/archive-tools?error=Missing crane job id");
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      archived,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/archive-tools?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/admin/archive-tools?success=${encodeURIComponent(
      archived ? "Crane job archived." : "Crane job restored."
    )}`
  );
}

async function archiveTransportJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("transport_job_id"));
  const archived = clean(formData.get("archived")) === "true";

  if (!id) {
    redirect("/admin/archive-tools?error=Missing transport job id");
  }

  const { error } = await supabase
    .from("transport_jobs")
    .update({
      archived,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/archive-tools?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/admin/archive-tools?success=${encodeURIComponent(
      archived ? "Transport job archived." : "Transport job restored."
    )}`
  );
}

async function setOperatorStatus(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("operator_id"));
  const status = clean(formData.get("status")) || "inactive";

  if (!id) {
    redirect("/admin/archive-tools?error=Missing operator id");
  }

  const { error } = await supabase
    .from("operators")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/archive-tools?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/admin/archive-tools?success=${encodeURIComponent(
      `Operator set to ${status}.`
    )}`
  );
}

async function setVehicleStatus(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("vehicle_id"));
  const status = clean(formData.get("status")) || "inactive";

  if (!id) {
    redirect("/admin/archive-tools?error=Missing vehicle id");
  }

  const { error } = await supabase
    .from("vehicles")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/archive-tools?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/admin/archive-tools?success=${encodeURIComponent(
      `Vehicle set to ${status}.`
    )}`
  );
}

async function setEquipmentStatus(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("equipment_id"));
  const status = clean(formData.get("status")) || "inactive";

  if (!id) {
    redirect("/admin/archive-tools?error=Missing equipment id");
  }

  const { error } = await supabase
    .from("equipment")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/archive-tools?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/admin/archive-tools?success=${encodeURIComponent(
      `Equipment set to ${status}.`
    )}`
  );
}

export default async function ArchiveToolsPage({
  searchParams,
}: {
  searchParams?: { success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const successMessage = searchParams?.success
    ? decodeURIComponent(searchParams.success)
    : "";
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : "";

  const [
    { data: jobs },
    { data: transportJobs },
    { data: operators },
    { data: vehicles },
    { data: equipment },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, site_name, archived")
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("transport_jobs")
      .select("id, transport_number, delivery_address, archived")
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("operators")
      .select("id, full_name, status")
      .order("full_name", { ascending: true })
      .limit(100),

    supabase
      .from("vehicles")
      .select("id, name, reg_number, status")
      .order("name", { ascending: true })
      .limit(100),

    supabase
      .from("equipment")
      .select("id, name, asset_number, status")
      .order("name", { ascending: true })
      .limit(150),
  ]);

  return (
    <ClientShell>
      <div style={{ width: "min(1300px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Admin: Archive Tools</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Soft archive jobs and transport jobs, and activate or deactivate resources.
              </p>
            </div>

            <a href="/dashboard" style={secondaryBtn}>
              ← Back to dashboard
            </a>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <div style={sectionGrid}>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Crane jobs</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {(jobs ?? []).map((job: any) => (
                  <div key={job.id} style={rowCard}>
                    <div>
                      <div style={{ fontWeight: 900 }}>
                        Job #{job.job_number ?? "—"}
                      </div>
                      <div style={{ marginTop: 4, opacity: 0.75 }}>
                        {job.site_name ?? "—"}
                      </div>
                    </div>

                    <form action={archiveCraneJob} style={{ display: "flex", gap: 8 }}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <input
                        type="hidden"
                        name="archived"
                        value={job.archived ? "false" : "true"}
                      />
                      <button type="submit" style={primaryBtn}>
                        {job.archived ? "Restore" : "Archive"}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Transport jobs</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {(transportJobs ?? []).map((job: any) => (
                  <div key={job.id} style={rowCard}>
                    <div>
                      <div style={{ fontWeight: 900 }}>
                        {job.transport_number ?? "—"}
                      </div>
                      <div style={{ marginTop: 4, opacity: 0.75 }}>
                        {job.delivery_address ?? "—"}
                      </div>
                    </div>

                    <form action={archiveTransportJob} style={{ display: "flex", gap: 8 }}>
                      <input type="hidden" name="transport_job_id" value={job.id} />
                      <input
                        type="hidden"
                        name="archived"
                        value={job.archived ? "false" : "true"}
                      />
                      <button type="submit" style={primaryBtn}>
                        {job.archived ? "Restore" : "Archive"}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Operators</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {(operators ?? []).map((item: any) => (
                  <div key={item.id} style={rowCard}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{item.full_name ?? "—"}</div>
                      <div style={{ marginTop: 4, opacity: 0.75 }}>
                        Status: {item.status ?? "—"}
                      </div>
                    </div>

                    <form action={setOperatorStatus} style={{ display: "flex", gap: 8 }}>
                      <input type="hidden" name="operator_id" value={item.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={item.status === "active" ? "inactive" : "active"}
                      />
                      <button type="submit" style={primaryBtn}>
                        {item.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Vehicles</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {(vehicles ?? []).map((item: any) => (
                  <div key={item.id} style={rowCard}>
                    <div>
                      <div style={{ fontWeight: 900 }}>
                        {item.name ?? "—"}{item.reg_number ? ` (${item.reg_number})` : ""}
                      </div>
                      <div style={{ marginTop: 4, opacity: 0.75 }}>
                        Status: {item.status ?? "—"}
                      </div>
                    </div>

                    <form action={setVehicleStatus} style={{ display: "flex", gap: 8 }}>
                      <input type="hidden" name="vehicle_id" value={item.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={item.status === "active" ? "inactive" : "active"}
                      />
                      <button type="submit" style={primaryBtn}>
                        {item.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Equipment</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {(equipment ?? []).map((item: any) => (
                  <div key={item.id} style={rowCard}>
                    <div>
                      <div style={{ fontWeight: 900 }}>
                        {item.name ?? "—"}{item.asset_number ? ` (${item.asset_number})` : ""}
                      </div>
                      <div style={{ marginTop: 4, opacity: 0.75 }}>
                        Status: {item.status ?? "—"}
                      </div>
                    </div>

                    <form action={setEquipmentStatus} style={{ display: "flex", gap: 8 }}>
                      <input type="hidden" name="equipment_id" value={item.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={item.status === "active" ? "inactive" : "active"}
                      />
                      <button type="submit" style={primaryBtn}>
                        {item.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
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

const sectionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 18,
  marginTop: 18,
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.30)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  fontSize: 22,
};

const rowCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.52)",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const successBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.10)",
  border: "1px solid rgba(0,180,120,0.25)",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
