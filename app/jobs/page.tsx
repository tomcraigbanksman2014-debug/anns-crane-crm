import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

export default async function JobsPage() {
  const supabase = createSupabaseServerClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(`
      id,
      job_number,
      site_name,
      site_address,
      job_date,
      start_time,
      end_time,
      status,
      clients:client_id (
        company_name
      ),
      equipment:equipment_id (
        name
      )
    `)
    .order("job_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Jobs</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Manage crane hire jobs and site details.
            </p>
          </div>

          <a href="/jobs/new" style={primaryBtn}>
            + New job
          </a>
        </div>

        <div style={panelStyle}>
          {error && <div style={errorBox}>{error.message}</div>}

          {!error && (!jobs || jobs.length === 0) ? (
            <p style={{ margin: 0 }}>No jobs yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Job #</th>
                    <th align="left" style={thStyle}>Customer</th>
                    <th align="left" style={thStyle}>Site</th>
                    <th align="left" style={thStyle}>Date</th>
                    <th align="left" style={thStyle}>Time</th>
                    <th align="left" style={thStyle}>Crane</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(jobs ?? []).map((job: any) => {
                    const client = Array.isArray(job.clients) ? job.clients[0] : job.clients;
                    const equipment = Array.isArray(job.equipment) ? job.equipment[0] : job.equipment;

                    return (
                      <tr key={job.id}>
                        <td style={tdStyle}>{job.job_number ?? "—"}</td>
                        <td style={tdStyle}>{client?.company_name ?? "—"}</td>
                        <td style={tdStyle}>{job.site_name ?? job.site_address ?? "—"}</td>
                        <td style={tdStyle}>{fmtDate(job.job_date)}</td>
                        <td style={tdStyle}>
                          {job.start_time || job.end_time
                            ? `${job.start_time ?? "—"} - ${job.end_time ?? "—"}`
                            : "—"}
                        </td>
                        <td style={tdStyle}>{equipment?.name ?? "—"}</td>
                        <td style={tdStyle}>{job.status ?? "—"}</td>
                        <td style={tdStyle}>
                          <a href={`/jobs/${job.id}`} style={actionBtn}>
                            Open
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const thStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.8,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
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
};

const actionBtn: React.CSSProperties = {
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
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
