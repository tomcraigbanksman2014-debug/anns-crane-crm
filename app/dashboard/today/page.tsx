import type { CSSProperties } from "react";
import Link from "next/link";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function overlapsDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  targetDate: string
) {
  const start = String(startDate ?? "").trim();
  const end = String(endDate ?? startDate ?? "").trim();
  if (!start || !end) return false;
  return start <= targetDate && end >= targetDate;
}

function fmtDate(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  if (!text) return "—";
  const d = new Date(`${text}T00:00:00`);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleDateString("en-GB");
}

function timeRange(start: unknown, end: unknown) {
  const from = String(start ?? "").slice(0, 5);
  const to = String(end ?? "").slice(0, 5);
  if (from && to) return `${from} - ${to}`;
  return from || to || "—";
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function DashboardTodayPage() {
  const supabase = createSupabaseServerClient();
  const today = todayIso();

  const [jobsRes, transportRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, site_name, site_address, start_date, end_date, job_date, start_time, end_time, status, archived, clients:client_id(company_name)")
      .or("archived.is.null,archived.eq.false")
      .order("start_time", { ascending: true })
      .limit(500),
    supabase
      .from("transport_jobs")
      .select("id, transport_number, collection_address, delivery_address, transport_date, delivery_date, collection_time, delivery_time, status, archived, clients:client_id(company_name)")
      .or("archived.is.null,archived.eq.false")
      .order("collection_time", { ascending: true })
      .limit(500),
  ]);

  const craneRows = (jobsRes.data ?? [])
    .filter((row: any) => String(row.status ?? "").toLowerCase() !== "cancelled")
    .filter((row: any) => overlapsDateRange(row.start_date ?? row.job_date, row.end_date ?? row.job_date, today))
    .map((row: any) => {
      const client = first(row.clients);
      return {
        type: "Crane",
        id: row.id,
        reference: row.job_number ? `#${row.job_number}` : row.id,
        customer: client?.company_name ?? "—",
        detail: row.site_name ?? row.site_address ?? "—",
        date: row.start_date ?? row.job_date,
        time: timeRange(row.start_time, row.end_time),
        status: row.status ?? "—",
        href: `/jobs/${row.id}`,
      };
    });

  const transportRows = (transportRes.data ?? [])
    .filter((row: any) => String(row.status ?? "").toLowerCase() !== "cancelled")
    .filter((row: any) => overlapsDateRange(row.transport_date, row.delivery_date ?? row.transport_date, today))
    .map((row: any) => {
      const client = first(row.clients);
      return {
        type: "Transport",
        id: row.id,
        reference: row.transport_number ?? row.id,
        customer: client?.company_name ?? "—",
        detail: [row.collection_address, row.delivery_address].filter(Boolean).join(" → ") || "—",
        date: row.transport_date,
        time: timeRange(row.collection_time, row.delivery_time),
        status: row.status ?? "—",
        href: `/transport-jobs/${row.id}`,
      };
    });

  const rows = [...craneRows, ...transportRows].sort((a, b) => String(a.time).localeCompare(String(b.time)));

  return (
    <ClientShell>
      <main style={pageWrap}>
        <div style={headerRow}>
          <div>
            <h1 style={title}>Today’s work</h1>
            <p style={subtitle}>Crane and transport work scheduled for {fmtDate(today)}.</p>
          </div>
          <Link href="/dashboard" style={secondaryBtn}>Back to dashboard</Link>
        </div>

        {jobsRes.error ? <div style={errorBox}>Crane job lookup: {jobsRes.error.message}</div> : null}
        {transportRes.error ? <div style={errorBox}>Transport job lookup: {transportRes.error.message}</div> : null}

        <section style={summaryGrid}>
          <SummaryCard label="Total work today" value={rows.length} />
          <SummaryCard label="Crane jobs" value={craneRows.length} />
          <SummaryCard label="Transport jobs" value={transportRows.length} />
        </section>

        <section style={card}>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Type</th>
                  <th style={th}>Reference</th>
                  <th style={th}>Customer</th>
                  <th style={th}>Job / movement</th>
                  <th style={th}>Time</th>
                  <th style={th}>Status</th>
                  <th style={th}>Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} style={emptyCell}>No work scheduled for today.</td></tr>
                ) : rows.map((row) => (
                  <tr key={`${row.type}-${row.id}`}>
                    <td style={td}>{row.type}</td>
                    <td style={td}>{row.reference}</td>
                    <td style={td}>{row.customer}</td>
                    <td style={td}>{row.detail}</td>
                    <td style={td}>{row.time}</td>
                    <td style={td}><span style={pill}>{row.status}</span></td>
                    <td style={td}><Link href={row.href} style={linkStyle}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </ClientShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={summaryCard}>
      <div style={summaryLabel}>{label}</div>
      <div style={summaryValue}>{value}</div>
    </div>
  );
}

const pageWrap: CSSProperties = { display: "grid", gap: 18, padding: 20 };
const headerRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" };
const title: CSSProperties = { margin: 0, fontSize: 28, lineHeight: 1.15 };
const subtitle: CSSProperties = { margin: "8px 0 0", color: "#5f6368", maxWidth: 760 };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 };
const summaryCard: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fff", boxShadow: "0 8px 24px rgba(15,23,42,0.06)" };
const summaryLabel: CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", fontWeight: 800 };
const summaryValue: CSSProperties = { marginTop: 6, fontSize: 24, fontWeight: 900 };
const card: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 18, background: "#fff", overflow: "hidden", boxShadow: "0 8px 24px rgba(15,23,42,0.06)" };
const tableWrap: CSSProperties = { overflowX: "auto" };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 980 };
const th: CSSProperties = { textAlign: "left", padding: "12px 14px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" };
const td: CSSProperties = { padding: "12px 14px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top", fontSize: 14 };
const emptyCell: CSSProperties = { padding: 18, textAlign: "center", color: "#6b7280" };
const pill: CSSProperties = { display: "inline-flex", borderRadius: 999, padding: "4px 9px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#0f172a", fontWeight: 800, fontSize: 12 };
const linkStyle: CSSProperties = { fontWeight: 900, color: "#0f172a", textDecoration: "underline" };
const secondaryBtn: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 12, padding: "10px 14px", textDecoration: "none", color: "#111827", fontWeight: 800, background: "#fff" };
const errorBox: CSSProperties = { border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 14, padding: 14, fontWeight: 700 };
