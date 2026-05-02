import type { CSSProperties } from "react";
import Link from "next/link";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function lower(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function fmtDate(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  if (!text) return "—";
  const d = new Date(`${text}T00:00:00`);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleDateString("en-GB");
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

type ActionItem = {
  id: string;
  type: string;
  reference: string;
  customer: string;
  detail: string;
  date: string | null;
  status: string;
  invoiceStatus?: string;
  href: string;
};

type Props = {
  searchParams?: {
    focus?: string;
  };
};

export default async function DashboardActionsPage({ searchParams }: Props) {
  const supabase = createSupabaseServerClient();
  const focus = String(searchParams?.focus ?? "").trim();

  const [jobsRes, transportRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, site_name, site_address, start_date, end_date, job_date, status, invoice_status, archived, clients:client_id(company_name)")
      .or("archived.is.null,archived.eq.false")
      .limit(500),
    supabase
      .from("transport_jobs")
      .select("id, transport_number, collection_address, delivery_address, transport_date, delivery_date, status, invoice_status, vehicle_id, operator_id, archived, clients:client_id(company_name)")
      .or("archived.is.null,archived.eq.false")
      .limit(500),
  ]);

  const jobs = jobsRes.data ?? [];
  const transportJobs = transportRes.data ?? [];

  const unassignedTransport: ActionItem[] = transportJobs
    .filter((row: any) => lower(row.status) !== "cancelled")
    .filter((row: any) => !row.vehicle_id || !row.operator_id)
    .map((row: any) => {
      const client = first(row.clients);
      return {
        id: row.id,
        type: "Transport",
        reference: row.transport_number ?? row.id,
        customer: client?.company_name ?? "—",
        detail: [row.collection_address, row.delivery_address].filter(Boolean).join(" → ") || "—",
        date: row.transport_date ?? row.delivery_date ?? null,
        status: row.status ?? "—",
        invoiceStatus: row.invoice_status ?? "Not Invoiced",
        href: `/transport-jobs/${row.id}`,
      };
    })
    .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));

  const completedCraneNotInvoiced: ActionItem[] = jobs
    .filter((row: any) => lower(row.status) === "completed")
    .filter((row: any) => lower(row.invoice_status || "Not Invoiced") === "not invoiced")
    .map((row: any) => {
      const client = first(row.clients);
      return {
        id: row.id,
        type: "Crane",
        reference: row.job_number ? `#${row.job_number}` : row.id,
        customer: client?.company_name ?? "—",
        detail: row.site_name ?? row.site_address ?? "—",
        date: row.start_date ?? row.job_date ?? row.end_date ?? null,
        status: row.status ?? "—",
        invoiceStatus: row.invoice_status ?? "Not Invoiced",
        href: `/jobs/${row.id}`,
      };
    })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  const completedTransportNotInvoiced: ActionItem[] = transportJobs
    .filter((row: any) => lower(row.status) === "completed")
    .filter((row: any) => lower(row.invoice_status || "Not Invoiced") === "not invoiced")
    .map((row: any) => {
      const client = first(row.clients);
      return {
        id: row.id,
        type: "Transport",
        reference: row.transport_number ?? row.id,
        customer: client?.company_name ?? "—",
        detail: [row.collection_address, row.delivery_address].filter(Boolean).join(" → ") || "—",
        date: row.transport_date ?? row.delivery_date ?? null,
        status: row.status ?? "—",
        invoiceStatus: row.invoice_status ?? "Not Invoiced",
        href: `/transport-jobs/${row.id}`,
      };
    })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  const urgentCount = unassignedTransport.length + completedCraneNotInvoiced.length + completedTransportNotInvoiced.length;

  return (
    <ClientShell>
      <main style={pageWrap}>
        <div style={headerRow}>
          <div>
            <h1 style={title}>Urgent actions</h1>
            <p style={subtitle}>Exact records behind the dashboard action queue.</p>
          </div>
          <Link href="/dashboard" style={secondaryBtn}>Back to dashboard</Link>
        </div>

        {jobsRes.error ? <div style={errorBox}>Crane job lookup: {jobsRes.error.message}</div> : null}
        {transportRes.error ? <div style={errorBox}>Transport job lookup: {transportRes.error.message}</div> : null}

        <section style={summaryGrid}>
          <SummaryCard label="Total urgent actions" value={urgentCount} />
          <SummaryCard label="Unassigned transport" value={unassignedTransport.length} />
          <SummaryCard label="Completed crane not invoiced" value={completedCraneNotInvoiced.length} />
          <SummaryCard label="Completed transport not invoiced" value={completedTransportNotInvoiced.length} />
        </section>

        <ActionSection
          id="unassigned-transport"
          title="Unassigned transport jobs"
          subtitle="Transport jobs missing a vehicle or driver allocation."
          rows={unassignedTransport}
          highlighted={focus === "unassigned-transport"}
        />

        <ActionSection
          id="completed-crane-not-invoiced"
          title="Completed crane jobs not invoiced"
          subtitle="Completed crane jobs still marked Not Invoiced."
          rows={completedCraneNotInvoiced}
          highlighted={focus === "completed-crane-not-invoiced"}
        />

        <ActionSection
          id="completed-transport-not-invoiced"
          title="Completed transport jobs not invoiced"
          subtitle="Completed transport jobs still marked Not Invoiced."
          rows={completedTransportNotInvoiced}
          highlighted={focus === "completed-transport-not-invoiced"}
        />
      </main>
    </ClientShell>
  );
}

function ActionSection({
  id,
  title,
  subtitle,
  rows,
  highlighted,
}: {
  id: string;
  title: string;
  subtitle: string;
  rows: ActionItem[];
  highlighted: boolean;
}) {
  return (
    <section id={id} style={highlighted ? highlightedCard : card}>
      <div style={sectionHeader}>
        <div>
          <h2 style={sectionTitle}>{title}</h2>
          <p style={sectionSubtitle}>{subtitle}</p>
        </div>
        <div style={countBubble}>{rows.length}</div>
      </div>
      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Type</th>
              <th style={th}>Reference</th>
              <th style={th}>Customer</th>
              <th style={th}>Job / movement</th>
              <th style={th}>Date</th>
              <th style={th}>Job status</th>
              <th style={th}>Invoice status</th>
              <th style={th}>Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={emptyCell}>No records found.</td></tr>
            ) : rows.map((row) => (
              <tr key={`${row.type}-${row.id}`}>
                <td style={td}>{row.type}</td>
                <td style={td}>{row.reference}</td>
                <td style={td}>{row.customer}</td>
                <td style={td}>{row.detail}</td>
                <td style={td}>{fmtDate(row.date)}</td>
                <td style={td}><span style={pill}>{row.status}</span></td>
                <td style={td}><span style={invoicePill}>{row.invoiceStatus ?? "—"}</span></td>
                <td style={td}><Link href={row.href} style={linkStyle}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
const highlightedCard: CSSProperties = { ...card, border: "2px solid #f59e0b" };
const sectionHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: 16, borderBottom: "1px solid #e5e7eb", background: "#f9fafb" };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 20 };
const sectionSubtitle: CSSProperties = { margin: "6px 0 0", color: "#6b7280" };
const countBubble: CSSProperties = { borderRadius: 999, padding: "8px 12px", background: "#111827", color: "#fff", fontWeight: 900 };
const tableWrap: CSSProperties = { overflowX: "auto" };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 980 };
const th: CSSProperties = { textAlign: "left", padding: "12px 14px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" };
const td: CSSProperties = { padding: "12px 14px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top", fontSize: 14 };
const emptyCell: CSSProperties = { padding: 18, textAlign: "center", color: "#6b7280" };
const pill: CSSProperties = { display: "inline-flex", borderRadius: 999, padding: "4px 9px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#0f172a", fontWeight: 800, fontSize: 12 };
const invoicePill: CSSProperties = { display: "inline-flex", borderRadius: 999, padding: "4px 9px", background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontWeight: 800, fontSize: 12 };
const linkStyle: CSSProperties = { fontWeight: 900, color: "#0f172a", textDecoration: "underline" };
const secondaryBtn: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 12, padding: "10px 14px", textDecoration: "none", color: "#111827", fontWeight: 800, background: "#fff" };
const errorBox: CSSProperties = { border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 14, padding: 14, fontWeight: 700 };
