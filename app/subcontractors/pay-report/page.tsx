import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function startOfWeek(dateStr?: string | null) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function endOfWeek(dateStr?: string | null) {
  const d = startOfWeek(dateStr);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}
function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function parseDateOnly(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function dateRangeInclusive(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return [] as string[];
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}
function overlapsWeek(startDate: string | null | undefined, endDate: string | null | undefined, weekStart: string, weekEnd: string) {
  const start = String(startDate ?? "").trim();
  const end = String(endDate ?? startDate ?? "").trim();
  if (!start || !end) return false;
  return dateRangeInclusive(start, end).some((date) => date >= weekStart && date <= weekEnd);
}
function workingDaysInWeek(startDate: string | null | undefined, endDate: string | null | undefined, weekStart: string, weekEnd: string) {
  const start = String(startDate ?? "").trim();
  const end = String(endDate ?? startDate ?? "").trim();
  if (!start || !end) return [] as string[];
  return dateRangeInclusive(start, end).filter((date) => date >= weekStart && date <= weekEnd);
}
function payFor(operator: any, days: number, overrideAmount?: number | null) {
  const override = Number(overrideAmount ?? 0);
  if (Number.isFinite(override) && override > 0) return override;
  const dayRate = Number(operator?.standard_day_rate ?? 0);
  if (Number.isFinite(dayRate) && dayRate > 0) return dayRate * days;
  const hourlyRate = Number(operator?.standard_hourly_rate ?? 0);
  if (Number.isFinite(hourlyRate) && hourlyRate > 0) return hourlyRate * 8 * days;
  return 0;
}
function fmtMoney(value: number) { return `£${value.toFixed(2)}`; }

type SearchParams = { week?: string };

export default async function SubcontractorPayReportPage({ searchParams }: { searchParams?: SearchParams }) {
  const supabase = createSupabaseServerClient();
  const baseDate = searchParams?.week ?? null;
  const weekStartDate = startOfWeek(baseDate);
  const weekEndDate = endOfWeek(baseDate);
  const weekStart = isoDate(weekStartDate);
  const weekEnd = isoDate(weekEndDate);
  const prevWeek = isoDate(new Date(weekStartDate.getTime() - 7 * 86400000));
  const nextWeek = isoDate(new Date(weekStartDate.getTime() + 7 * 86400000));

  const { data: subs, error } = await supabase
    .from("operators")
    .select("id, full_name, company_name, standard_day_rate, standard_hourly_rate, pay_basis, phone, email, archived")
    .eq("employment_type", "subcontractor")
    .eq("archived", false)
    .order("full_name", { ascending: true });

  const subcontractors = subs ?? [];
  const subcontractorIds = subcontractors.map((item: any) => item.id);

  const [{ data: jobEquipment }, { data: transportJobs }] = subcontractorIds.length > 0 ? await Promise.all([
    supabase
      .from("job_equipment")
      .select(`
        id,
        operator_id,
        start_date,
        end_date,
        agreed_cost,
        jobs:job_id (
          id,
          job_number,
          site_name,
          status,
          clients:client_id (company_name)
        )
      `)
      .in("operator_id", subcontractorIds),
    supabase
      .from("transport_jobs")
      .select(`
        id,
        operator_id,
        transport_number,
        transport_date,
        delivery_date,
        status,
        collection_address,
        delivery_address
      `)
      .in("operator_id", subcontractorIds)
      .eq("archived", false),
  ]) : [{ data: [] as any[] }, { data: [] as any[] }];

  const jobRows = jobEquipment ?? [];
  const transportRows = transportJobs ?? [];

  const operatorMap = new Map(subcontractors.map((item: any) => [String(item.id), item]));

  const grouped = subcontractors.map((operator: any) => {
    const entries: Array<{ label: string; dates: string[]; amount: number; kind: string }> = [];

    jobRows
      .filter((row: any) => String(row.operator_id) === String(operator.id))
      .forEach((row: any) => {
        const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
        if (String(job?.status ?? "").toLowerCase() === "cancelled") return;
        const dates = workingDaysInWeek(row.start_date ?? null, row.end_date ?? row.start_date ?? null, weekStart, weekEnd);
        if (dates.length === 0) return;
        entries.push({
          label: `Job #${job?.job_number ?? "—"} • ${job?.site_name ?? "No site"}`,
          dates,
          amount: payFor(operator, dates.length, Number(row.agreed_cost ?? 0)),
          kind: "Crane / job",
        });
      });

    transportRows
      .filter((row: any) => String(row.operator_id) === String(operator.id))
      .forEach((row: any) => {
        if (String(row?.status ?? "").toLowerCase() === "cancelled") return;
        const dates = workingDaysInWeek(row.transport_date ?? null, row.delivery_date ?? row.transport_date ?? null, weekStart, weekEnd);
        if (dates.length === 0) return;
        entries.push({
          label: `Transport ${row.transport_number ?? row.id} • ${row.collection_address ?? ""} → ${row.delivery_address ?? ""}`,
          dates,
          amount: payFor(operator, dates.length, null),
          kind: "Transport",
        });
      });

    const totalAmount = entries.reduce((sum, item) => sum + item.amount, 0);
    return { operator, entries, totalAmount };
  }).filter((row) => row.entries.length > 0);

  const grandTotal = grouped.reduce((sum, item) => sum + item.totalAmount, 0);

  return (
    <ClientShell>
      <div style={{ width: "min(1300px, 96vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Subcontractor pay report</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>Week {weekStart} to {weekEnd}. Uses subcontractor rates and recorded assignments.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={`/subcontractors/pay-report?week=${prevWeek}`} style={secondaryBtn}>← Previous week</a>
            <a href={`/subcontractors/pay-report?week=${isoDate(new Date())}`} style={secondaryBtn}>This week</a>
            <a href={`/subcontractors/pay-report?week=${nextWeek}`} style={secondaryBtn}>Next week →</a>
          </div>
        </div>

        {error ? <div style={errorBox}>{error.message}</div> : null}

        <div style={summaryCard}><strong>Grand total:</strong> {fmtMoney(grandTotal)}</div>

        {grouped.length === 0 ? (
          <div style={summaryCard}>No subcontractor work found for this week.</div>
        ) : (
          grouped.map(({ operator, entries, totalAmount }) => (
            <section key={operator.id} style={sectionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 1000 }}>{operator.full_name || "Unnamed"}</div>
                  <div style={{ marginTop: 4, opacity: 0.78 }}>{operator.company_name || "No company name"}</div>
                </div>
                <div style={{ fontWeight: 1000, fontSize: 22 }}>{fmtMoney(totalAmount)}</div>
              </div>

              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                  <thead>
                    <tr>
                      <th align="left" style={thStyle}>Type</th>
                      <th align="left" style={thStyle}>Work</th>
                      <th align="left" style={thStyle}>Dates</th>
                      <th align="left" style={thStyle}>Rate basis</th>
                      <th align="right" style={thStyle}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, index) => (
                      <tr key={`${operator.id}-${index}`}>
                        <td style={tdStyle}>{entry.kind}</td>
                        <td style={tdStyle}>{entry.label}</td>
                        <td style={tdStyle}>{entry.dates.join(", ")}</td>
                        <td style={tdStyle}>{operator.pay_basis || "day_rate"}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{fmtMoney(entry.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </div>
    </ClientShell>
  );
}

const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };
const summaryCard: React.CSSProperties = { padding: 16, borderRadius: 14, background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.40)", boxShadow: "0 8px 30px rgba(0,0,0,0.08)" };
const sectionCard: React.CSSProperties = { padding: 16, borderRadius: 14, background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.40)", boxShadow: "0 8px 30px rgba(0,0,0,0.08)" };
const primaryBtn: React.CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, background: "#111", color: "#fff", textDecoration: "none", fontWeight: 900, border: "none" };
const secondaryBtn: React.CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.82)", color: "#111", textDecoration: "none", fontWeight: 800, border: "1px solid rgba(0,0,0,0.10)" };
const errorBox: React.CSSProperties = { padding: "12px 14px", borderRadius: 12, background: "rgba(180,0,0,0.12)", border: "1px solid rgba(180,0,0,0.18)", color: "#8b0000", fontWeight: 700 };
const thStyle: React.CSSProperties = { padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,0.10)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.74 };
const tdStyle: React.CSSProperties = { padding: "12px 8px", borderBottom: "1px solid rgba(0,0,0,0.06)", verticalAlign: "top" };
