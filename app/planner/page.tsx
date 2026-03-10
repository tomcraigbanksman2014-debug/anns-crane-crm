import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

export default async function PlannerPage() {
  const supabase = createSupabaseServerClient();

  const [{ data: jobs, error: jobsError }, { data: equipment, error: equipmentError }] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(`
          id,
          job_number,
          job_date,
          start_time,
          end_time,
          status,
          site_name,
          site_address,
          equipment_id,
          clients:client_id (
            company_name
          ),
          equipment:equipment_id (
            id,
            name
          )
        `)
        .in("status", ["draft", "confirmed", "in_progress"])
        .order("job_date", { ascending: true })
        .order("start_time", { ascending: true }),

      supabase
        .from("equipment")
        .select("id, name, status")
        .order("name", { ascending: true }),
    ]);

  const jobsList = jobs ?? [];
  const equipmentList = equipment ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Planner</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Crane dispatch overview for open jobs.
            </p>
          </div>

          <a href="/jobs" style={btnStyle}>
            Open jobs
          </a>
        </div>

        {(jobsError || equipmentError) && (
          <div style={errorBox}>
            {jobsError?.message || equipmentError?.message}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 18,
            alignItems: "start",
          }}
        >
          <section style={cardStyle}>
            <h2 style={sectionTitle}>Open jobs</h2>

            {jobsList.length === 0 ? (
              <p style={{ margin: 0 }}>No open jobs.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {jobsList.map((job: any) => {
                  const client = Array.isArray(job.clients) ? job.clients[0] : job.clients;
                  const assignedEquipment = Array.isArray(job.equipment)
                    ? job.equipment[0]
                    : job.equipment;

                  return (
                    <div key={job.id} style={rowCard}>
                      <div style={{ fontWeight: 900 }}>
                        Job #{job.job_number ?? "—"} • {client?.company_name ?? "No customer"}
                      </div>
                      <div style={mutedText}>
                        {job.job_date ?? "—"} {job.start_time ? `• ${job.start_time}` : ""}
                      </div>
                      <div style={mutedText}>
                        {job.site_name ?? job.site_address ?? "No site"}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <strong>Assigned crane:</strong>{" "}
                        {assignedEquipment?.name ?? "Not assigned"}
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <a href={`/jobs/${job.id}`} style={smallBtn}>
                          Open job
                        </a>
                        <a href={`/jobs/${job.id}/edit`} style={smallBtn}>
                          Edit job
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>Available cranes</h2>

            {equipmentList.length === 0 ? (
              <p style={{ margin: 0 }}>No equipment found.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {equipmentList.map((eq: any) => (
                  <div key={eq.id} style={rowCard}>
                    <div style={{ fontWeight: 900 }}>{eq.name ?? "Unnamed crane"}</div>
                    <div style={mutedText}>Status: {eq.status ?? "—"}</div>
                    <div style={{ marginTop: 10 }}>
                      <a href={`/equipment/${eq.id}`} style={smallBtn}>
                        Open equipment
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </ClientShell>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const rowCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const mutedText: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.78,
  marginTop: 4,
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

const smallBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 9,
  textDecoration: "none",
  background: "rgba(255,255,255,0.52)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
