import { createSupabaseServerClient } from "../../lib/supabase/server";

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

function calcHours(startedAt: string | null | undefined, completedAt: string | null | undefined) {
  if (!startedAt || !completedAt) return 0;
  const start = new Date(startedAt);
  const end = new Date(completedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  return diffMs / (1000 * 60 * 60);
}

export default async function TimesheetsPrintPage() {
  const supabase = createSupabaseServerClient();

  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);

  const weekStartStr = weekStart.toISOString();
  const weekEndStr = weekEnd.toISOString();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(`
      id,
      job_number,
      job_date,
      started_at,
      completed_at,
      operators:operator_id (
        id,
        full_name
      ),
      clients:client_id (
        company_name
      )
    `)
    .not("operator_id", "is", null)
    .gte("started_at", weekStartStr)
    .lte("started_at", weekEndStr)
    .order("started_at", { ascending: true });

  const jobsList = jobs ?? [];

  const grouped = jobsList.reduce((acc: Record<string, any>, job: any) => {
    const operator = Array.isArray(job.operators) ? job.operators[0] : job.operators;
    const client = Array.isArray(job.clients) ? job.clients[0] : job.clients;
    const operatorId = operator?.id ?? "unassigned";
    const operatorName = operator?.full_name ?? "Unknown operator";

    if (!acc[operatorId]) {
      acc[operatorId] = {
        operatorName,
        rows: [],
        totalHours: 0,
      };
    }

    const hours = calcHours(job.started_at, job.completed_at);

    acc[operatorId].rows.push({
      jobNumber: job.job_number,
      jobDate: job.job_date,
      clientName: client?.company_name ?? "—",
      startedAt: job.started_at,
      completedAt: job.completed_at,
      hours,
    });

    acc[operatorId].totalHours += hours;

    return acc;
  }, {});

  const operatorIds = Object.keys(grouped);

  return (
    <html>
      <head>
        <title>AnnS Crane Hire - Timesheets</title>
      </head>
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
          background: "#fff",
          color: "#111",
        }}
      >
        <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto", padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>AnnS Crane Hire Timesheets</h1>
              <p style={{ marginTop: 8, opacity: 0.8 }}>
                Week: {fmtDate(weekStart.toISOString())} – {fmtDate(weekEnd.toISOString())}
              </p>
            </div>

            <button
              onClick={() => window.print()}
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "#111",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Print / Save as PDF
            </button>
          </div>

          {error ? (
            <div
              style={{
                marginTop: 16,
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,0,0,0.22)",
                background: "rgba(255,0,0,0.08)",
              }}
            >
              {error.message}
            </div>
          ) : operatorIds.length === 0 ? (
            <div
              style={{
                marginTop: 16,
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.10)",
                background: "#fafafa",
              }}
            >
              No operator activity recorded for this week yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 20, marginTop: 20 }}>
              {operatorIds.map((operatorId) => {
                const group = grouped[operatorId];

                return (
                  <section
                    key={operatorId}
                    style={{
                      border: "1px solid rgba(0,0,0,0.12)",
                      borderRadius: 12,
                      padding: 16,
                      breakInside: "avoid",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginBottom: 12,
                      }}
                    >
                      <h2 style={{ margin: 0, fontSize: 24 }}>{group.operatorName}</h2>
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 999,
                          background: "rgba(0,180,120,0.10)",
                          border: "1px solid rgba(0,180,120,0.18)",
                          fontWeight: 800,
                        }}
                      >
                        Total: {group.totalHours.toFixed(2)} hrs
                      </div>
                    </div>

                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th align="left" style={thStyle}>Job #</th>
                          <th align="left" style={thStyle}>Date</th>
                          <th align="left" style={thStyle}>Customer</th>
                          <th align="left" style={thStyle}>Started</th>
                          <th align="left" style={thStyle}>Completed</th>
                          <th align="left" style={thStyle}>Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row: any, idx: number) => (
                          <tr key={idx}>
                            <td style={tdStyle}>{row.jobNumber ?? "—"}</td>
                            <td style={tdStyle}>{fmtDate(row.jobDate)}</td>
                            <td style={tdStyle}>{row.clientName}</td>
                            <td style={tdStyle}>{fmtDateTime(row.startedAt)}</td>
                            <td style={tdStyle}>{fmtDateTime(row.completedAt)}</td>
                            <td style={tdStyle}>{row.hours.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <style>{`
          @media print {
            button {
              display: none !important;
            }

            body {
              background: #fff !important;
            }
          }
        `}</style>
      </body>
    </html>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid rgba(0,0,0,0.12)",
  fontSize: 12,
  opacity: 0.8,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
};
