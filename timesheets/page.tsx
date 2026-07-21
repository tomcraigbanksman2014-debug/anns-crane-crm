import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

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

function calcWorkedHours(startedAt: string | null | undefined, completedAt: string | null | undefined) {
  if (!startedAt || !completedAt) return 0;
  const start = new Date(startedAt);
  const end = new Date(completedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  return diffMs / (1000 * 60 * 60);
}

function num(value: any) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default async function TimesheetsPage() {
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
      travel_hours,
      break_hours,
      overtime_hours,
      submitted_to_office_at,
      operators:operator_id (
        id,
        full_name
      ),
      clients:client_id (
        company_name
      )
    `)
    .not("operator_id", "is", null)
    .gte("job_date", weekStartStr.slice(0, 10))
    .lte("job_date", weekEndStr.slice(0, 10))
    .order("job_date", { ascending: true });

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
        totalWorked: 0,
        totalTravel: 0,
        totalBreak: 0,
        totalOvertime: 0,
        totalPayable: 0,
      };
    }

    const workedHours = calcWorkedHours(job.started_at, job.completed_at);
    const travelHours = num(job.travel_hours);
    const breakHours = num(job.break_hours);
    const overtimeHours = num(job.overtime_hours);
    const payableHours = workedHours + travelHours + overtimeHours - breakHours;

    acc[operatorId].rows.push({
      jobNumber: job.job_number,
      jobDate: job.job_date,
      clientName: client?.company_name ?? "—",
      startedAt: job.started_at,
      completedAt: job.completed_at,
      travelHours,
      breakHours,
      overtimeHours,
      workedHours,
      payableHours,
      submittedToOfficeAt: job.submitted_to_office_at,
    });

    acc[operatorId].totalWorked += workedHours;
    acc[operatorId].totalTravel += travelHours;
    acc[operatorId].totalBreak += breakHours;
    acc[operatorId].totalOvertime += overtimeHours;
    acc[operatorId].totalPayable += payableHours;

    return acc;
  }, {});

  const operatorIds = Object.keys(grouped);

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Timesheets</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Weekly operator timesheets generated from job activity and job sheets.
            </p>
          </div>

          <div style={rangeBox}>
            Week: {fmtDate(weekStart.toISOString())} – {fmtDate(weekEnd.toISOString())}
          </div>
        </div>

        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : operatorIds.length === 0 ? (
          <div style={{ ...cardStyle, marginTop: 16 }}>
            No operator activity recorded for this week yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
            {operatorIds.map((operatorId) => {
              const group = grouped[operatorId];

              return (
                <section key={operatorId} style={cardStyle}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <h2 style={{ margin: 0, fontSize: 24 }}>{group.operatorName}</h2>
                    <div style={hoursPill}>
                      Payable: {group.totalPayable.toFixed(2)} hrs
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    <MiniSummary label="Worked" value={group.totalWorked.toFixed(2)} />
                    <MiniSummary label="Travel" value={group.totalTravel.toFixed(2)} />
                    <MiniSummary label="Break" value={group.totalBreak.toFixed(2)} />
                    <MiniSummary label="Overtime" value={group.totalOvertime.toFixed(2)} />
                    <MiniSummary label="Payable" value={group.totalPayable.toFixed(2)} />
                  </div>

                  <div style={{ overflowX: "auto", marginTop: 14 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th align="left" style={thStyle}>Job #</th>
                          <th align="left" style={thStyle}>Date</th>
                          <th align="left" style={thStyle}>Customer</th>
                          <th align="left" style={thStyle}>Started</th>
                          <th align="left" style={thStyle}>Completed</th>
                          <th align="left" style={thStyle}>Worked</th>
                          <th align="left" style={thStyle}>Travel</th>
                          <th align="left" style={thStyle}>Break</th>
                          <th align="left" style={thStyle}>OT</th>
                          <th align="left" style={thStyle}>Payable</th>
                          <th align="left" style={thStyle}>Submitted</th>
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
                            <td style={tdStyle}>{row.workedHours.toFixed(2)}</td>
                            <td style={tdStyle}>{row.travelHours.toFixed(2)}</td>
                            <td style={tdStyle}>{row.breakHours.toFixed(2)}</td>
                            <td style={tdStyle}>{row.overtimeHours.toFixed(2)}</td>
                            <td style={{ ...tdStyle, fontWeight: 900 }}>{row.payableHours.toFixed(2)}</td>
                            <td style={tdStyle}>{row.submittedToOfficeAt ? fmtDateTime(row.submittedToOfficeAt) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </ClientShell>
  );
}

function MiniSummary({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.42)",
        border: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 1000 }}>{value}</div>
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

const rangeBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
};

const hoursPill: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.20)",
  color: "#0b7a4b",
  fontWeight: 900,
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
  whiteSpace: "nowrap",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
