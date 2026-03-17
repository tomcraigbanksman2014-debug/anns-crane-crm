import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import StatusBadge from "../components/StatusBadge";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

type JobsPageProps = {
  searchParams?: {
    view?: string;
  };
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const supabase = createSupabaseServerClient();
  const view = String(searchParams?.view ?? "active").toLowerCase();

  let query = supabase
    .from("jobs")
    .select(`
      id,
      job_number,
      job_date,
      start_time,
      end_time,
      site_name,
      site_address,
      status,
      archived,
      clients:client_id (
        id,
        company_name
      ),
      operators:operator_id (
        id,
        full_name
      ),
      equipment:equipment_id (
        id,
        name,
        asset_number
      )
    `)
    .order("job_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (view === "archived") {
    query = query.eq("archived", true);
  } else if (view === "all") {
    // no archived filter
  } else {
    query = query.eq("archived", false);
  }

  const { data, error } = await query;
  const rows = data ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(1450px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Jobs</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Manage crane jobs, operators and site details.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/bookings" style={secondaryBtn}>
                Open bookings
              </a>
              <a href="/jobs/new" style={primaryBtn}>
                + New job
              </a>
            </div>
          </div>

          <div style={tabsRow}>
            <a
              href="/jobs?view=active"
              style={view === "active" ? activeTabBtn : tabBtn}
            >
              Active
            </a>
            <a
              href="/jobs?view=archived"
              style={view === "archived" ? activeTabBtn : tabBtn}
            >
              Archived
            </a>
            <a
              href="/jobs?view=all"
              style={view === "all" ? activeTabBtn : tabBtn}
            >
              All
            </a>
          </div>

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : rows.length === 0 ? (
            <div style={emptyBox}>No jobs found for this view.</div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Job #</th>
                    <th align="left" style={thStyle}>Date</th>
                    <th align="left" style={thStyle}>Time</th>
                    <th align="left" style={thStyle}>Customer</th>
                    <th align="left" style={thStyle}>Operator</th>
                    <th align="left" style={thStyle}>Equipment</th>
                    <th align="left" style={thStyle}>Site</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((job: any) => {
                    const client = first(job.clients);
                    const operator = first(job.operators);
                    const equipment = first(job.equipment);

                    return (
                      <tr key={job.id}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 900 }}>
                            #{job.job_number ?? "—"}
                          </div>
                        </td>

                        <td style={tdStyle}>{fmtDate(job.job_date)}</td>

                        <td style={tdStyle}>
                          {job.start_time || job.end_time
                            ? `${job.start_time ?? "—"} - ${job.end_time ?? "—"}`
                            : "—"}
                        </td>

                        <td style={tdStyle}>{client?.company_name ?? "—"}</td>

                        <td style={tdStyle}>{operator?.full_name ?? "—"}</td>

                        <td style={tdStyle}>
                          {equipment?.name ?? "—"}
                          {equipment?.asset_number ? ` (${equipment.asset_number})` : ""}
                        </td>

                        <td style={tdStyle}>
                          <div>{job.site_name ?? "—"}</div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            {job.site_address ?? "—"}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <StatusBadge value={job.status} archived={!!job.archived} />
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <a href={`/jobs/${job.id}`} style={actionBtn}>
                              Open
                            </a>
                          </div>
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

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
};

const thStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.78,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  verticalAlign: "top",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const tabBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 14px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const activeTabBtn: React.CSSProperties = {
  ...tabBtn,
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
};

const actionBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const emptyBox: React.CSSProperties = {
  marginTop: 16,
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};
