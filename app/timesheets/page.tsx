import { createClient } from "@supabase/supabase-js";
import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { timesheetsEnabled } from "../lib/features";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

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

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function shiftState(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined
) {
  if (startedAt && endedAt) return "Complete";
  if (startedAt && !endedAt) return "Open shift";
  if (!startedAt && endedAt) return "Invalid";
  return "No clock times";
}

function shiftPill(state: string): React.CSSProperties {
  if (state === "Complete") {
    return {
      display: "inline-block",
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (state === "Open shift") {
    return {
      display: "inline-block",
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  return {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    background: "rgba(255,0,0,0.10)",
    color: "#b00020",
    border: "1px solid rgba(255,0,0,0.18)",
  };
}

function overlapsWeek(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  weekStart: Date,
  weekEnd: Date
) {
  if (!startedAt) return false;

  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  return start <= weekEnd && end >= weekStart;
}

function calcShiftHoursWithinWindow(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  windowStart: Date,
  windowEnd: Date
) {
  if (!startedAt) return 0;

  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const clippedStart = start > windowStart ? start : windowStart;
  const clippedEnd = end < windowEnd ? end : windowEnd;

  const diffMs = clippedEnd.getTime() - clippedStart.getTime();
  if (diffMs <= 0) return 0;

  return diffMs / (1000 * 60 * 60);
}

export default async function TimesheetsPage() {
  if (!timesheetsEnabled()) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
          <div style={card}>
            <h1 style={{ marginTop: 0, fontSize: 30 }}>Timesheets are not enabled yet</h1>
            <p style={{ margin: 0, opacity: 0.78, lineHeight: 1.5 }}>
              The timesheet code is still in the CRM, but access is locked behind <strong>TIMESHEETS_ENABLED=true</strong>.
            </p>
            <div style={{ marginTop: 14 }}>
              <a href="/dashboard" style={btnStyle}>← Back to dashboard</a>
            </div>
          </div>
        </div>
      </ClientShell>
    );
  }

  const supabase = createSupabaseServerClient();
  const admin = getAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return (
      <ClientShell>
        <div style={{ width: "min(1380px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>Not signed in.</div>
        </div>
      </ClientShell>
    );
  }

  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);

  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();

  const { data, error } = await admin
    .from("operator_shift_sessions")
    .select(`
      id,
      operator_id,
      status,
      started_at,
      ended_at,
      start_site_text,
      end_site_text,
      end_issue_type,
      end_issue_notes,
      operators:operator_id (
        id,
        full_name
      )
    `)
    .lte("started_at", weekEndIso)
    .order("started_at", { ascending: true });

  const shiftRows = ((data ?? []) as any[]).filter((row) =>
    overlapsWeek(row.started_at, row.ended_at, weekStart, weekEnd)
  );

  const grouped = shiftRows.reduce((acc: Record<string, any>, row: any) => {
    const operator = first(row.operators);
    const operatorId = operator?.id ?? row.operator_id ?? "unassigned";
    const operatorName = operator?.full_name ?? "Unknown operator";

    if (!acc[operatorId]) {
      acc[operatorId] = {
        operatorName,
        rows: [],
        totalHours: 0,
        totalShifts: 0,
        openShifts: 0,
        incompleteShifts: 0,
      };
    }

    const workedHours = calcShiftHoursWithinWindow(
      row.started_at,
      row.ended_at,
      weekStart,
      weekEnd
    );

    const state = shiftState(row.started_at, row.ended_at);

    acc[operatorId].rows.push({
      shiftId: row.id,
      shiftDate: row.started_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      startSiteText: row.start_site_text,
      endSiteText: row.end_site_text,
      endIssueType: row.end_issue_type,
      endIssueNotes: row.end_issue_notes,
      workedHours,
      state,
    });

    acc[operatorId].totalHours += workedHours;
    acc[operatorId].totalShifts += 1;

    if (state === "Open shift") {
      acc[operatorId].openShifts += 1;
      acc[operatorId].incompleteShifts += 1;
    } else if (state !== "Complete") {
      acc[operatorId].incompleteShifts += 1;
    }

    return acc;
  }, {});

  const operatorIds = Object.keys(grouped).sort((a, b) =>
    String(grouped[a].operatorName).localeCompare(String(grouped[b].operatorName))
  );

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 95vw)", margin: "0 auto" }}>
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
              Weekly operator timesheets calculated from shift start and shift end.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <a href="/api/export/timesheets" style={exportBtn}>
              Export CSV
            </a>
            <a href="/timesheets/print" style={exportBtn}>
              Print View
            </a>
            <div style={rangeBox}>
              Week: {fmtDate(weekStartIso)} – {fmtDate(weekEndIso)}
            </div>
          </div>
        </div>

        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : operatorIds.length === 0 ? (
          <div style={{ ...cardStyle, marginTop: 16 }}>
            No shift activity recorded for this week yet.
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
                      Total: {group.totalHours.toFixed(2)} hrs
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    <MiniSummary label="Shifts" value={String(group.totalShifts)} />
                    <MiniSummary label="Worked" value={group.totalHours.toFixed(2)} />
                    <MiniSummary label="Open shifts" value={String(group.openShifts)} />
                    <MiniSummary
                      label="Incomplete shifts"
                      value={String(group.incompleteShifts)}
                    />
                  </div>

                  <div style={{ overflowX: "auto", marginTop: 14 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
                      <thead>
                        <tr>
                          <th align="left" style={thStyle}>Shift Date</th>
                          <th align="left" style={thStyle}>Record</th>
                          <th align="left" style={thStyle}>Started</th>
                          <th align="left" style={thStyle}>Ended</th>
                          <th align="left" style={thStyle}>Worked</th>
                          <th align="left" style={thStyle}>Start Site</th>
                          <th align="left" style={thStyle}>End Site</th>
                          <th align="left" style={thStyle}>Issue</th>
                          <th align="left" style={thStyle}>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row: any) => (
                          <tr key={row.shiftId}>
                            <td style={tdStyle}>{fmtDate(row.shiftDate)}</td>
                            <td style={tdStyle}>
                              <span style={shiftPill(row.state)}>{row.state}</span>
                            </td>
                            <td style={tdStyle}>{fmtDateTime(row.startedAt)}</td>
                            <td style={tdStyle}>{fmtDateTime(row.endedAt)}</td>
                            <td style={tdStylePayable}>{row.workedHours.toFixed(2)}</td>
                            <td style={tdStyleWrap}>{row.startSiteText ?? "—"}</td>
                            <td style={tdStyleWrap}>{row.endSiteText ?? "—"}</td>
                            <td style={tdStyle}>
                              {row.endIssueType
                                ? String(row.endIssueType)
                                    .replaceAll("_", " ")
                                    .replace(/\b\w/g, (c: string) => c.toUpperCase())
                                : "—"}
                            </td>
                            <td style={tdStyleWrap}>{row.endIssueNotes ?? "—"}</td>
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

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.88)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
};

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#111827",
  color: "white",
  textDecoration: "none",
  fontWeight: 800,
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
  verticalAlign: "top",
};

const tdStyleWrap: React.CSSProperties = {
  ...tdStyle,
  whiteSpace: "normal",
  minWidth: 180,
};

const tdStylePayable: React.CSSProperties = {
  ...tdStyle,
  fontWeight: 900,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const exportBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};
