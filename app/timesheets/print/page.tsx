import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { timesheetsEnabled } from "../../lib/features";
import PrintTimesheetsButton from "./PrintTimesheetsButton";

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

export default async function TimesheetsPrintPage() {
  if (!timesheetsEnabled()) {
    redirect("/dashboard");
  }

  const supabase = createSupabaseServerClient();
  const admin = getAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/timesheets/print");
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
      started_at,
      ended_at,
      start_site_text,
      end_site_text,
      end_issue_type,
      operators:operator_id (
        id,
        full_name
      )
    `)
    .lte("started_at", weekEndIso)
    .order("started_at", { ascending: true });

  const rows = ((data ?? []) as any[]).filter((row) =>
    overlapsWeek(row.started_at, row.ended_at, weekStart, weekEnd)
  );

  const grouped = rows.reduce((acc: Record<string, any>, row: any) => {
    const operator = first(row.operators);
    const operatorId = operator?.id ?? row.operator_id ?? "unassigned";
    const operatorName = operator?.full_name ?? "Unknown operator";

    if (!acc[operatorId]) {
      acc[operatorId] = {
        operatorName,
        rows: [],
        totalHours: 0,
      };
    }

    const hours = calcShiftHoursWithinWindow(
      row.started_at,
      row.ended_at,
      weekStart,
      weekEnd
    );

    acc[operatorId].rows.push({
      shiftId: row.id,
      shiftDate: row.started_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      startSite: row.start_site_text,
      endSite: row.end_site_text,
      endIssueType: row.end_issue_type,
      state: shiftState(row.started_at, row.ended_at),
      hours,
    });

    acc[operatorId].totalHours += hours;

    return acc;
  }, {});

  const operatorIds = Object.keys(grouped).sort((a, b) =>
    String(grouped[a].operatorName).localeCompare(String(grouped[b].operatorName))
  );

  return (
    <div
      style={{
        margin: 0,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
        background: "#fff",
        color: "#111",
        minHeight: "100vh",
      }}
    >
      <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto", padding: 24 }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>AnnS Crane Hire Timesheets</h1>
            <p style={{ marginTop: 8, opacity: 0.8 }}>
              Week: {fmtDate(weekStartIso)} – {fmtDate(weekEndIso)}
            </p>
          </div>

          <div className="print-hide">
            <PrintTimesheetsButton />
          </div>
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
            No shift activity recorded for this week yet.
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
                        <th align="left" style={thStyle}>Shift Date</th>
                        <th align="left" style={thStyle}>Record</th>
                        <th align="left" style={thStyle}>Started</th>
                        <th align="left" style={thStyle}>Ended</th>
                        <th align="left" style={thStyle}>Hours</th>
                        <th align="left" style={thStyle}>Start Site</th>
                        <th align="left" style={thStyle}>End Site</th>
                        <th align="left" style={thStyle}>Issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row: any) => (
                        <tr key={row.shiftId}>
                          <td style={tdStyle}>{fmtDate(row.shiftDate)}</td>
                          <td style={tdStyle}>{row.state}</td>
                          <td style={tdStyle}>{fmtDateTime(row.startedAt)}</td>
                          <td style={tdStyle}>{fmtDateTime(row.endedAt)}</td>
                          <td style={tdStyle}>{row.hours.toFixed(2)}</td>
                          <td style={tdStyleWrap}>{row.startSite ?? "—"}</td>
                          <td style={tdStyleWrap}>{row.endSite ?? "—"}</td>
                          <td style={tdStyle}>
                            {row.endIssueType
                              ? String(row.endIssueType)
                                  .replaceAll("_", " ")
                                  .replace(/\b\w/g, (c: string) => c.toUpperCase())
                              : "—"}
                          </td>
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
          .print-hide {
            display: none !important;
          }

          body {
            background: #fff !important;
          }
        }
      `}</style>
    </div>
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
  verticalAlign: "top",
};

const tdStyleWrap: React.CSSProperties = {
  ...tdStyle,
  minWidth: 180,
};
