import type { CSSProperties } from "react";
import Link from "next/link";
import ClientShell from "../../ClientShell";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { requireAdmin } from "../../lib/routeGuards";

export const dynamic = "force-dynamic";

type CleanupRow = {
  reference: string;
  date: string;
  customer: string;
  status: string;
  issue: string;
  href: string;
};

type CleanupSection = {
  title: string;
  description: string;
  rows: CleanupRow[];
  error?: string | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  return !value ? null : Array.isArray(value) ? value[0] ?? null : value;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function moneyNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rowDate(row: any) {
  return clean(row.job_date ?? row.start_date ?? row.transport_date ?? row.delivery_date ?? row.created_at);
}

function customerName(row: any) {
  const client = first(row.clients);
  return clean(client?.company_name) || "—";
}

function craneHref(row: any) {
  return row?.id ? `/jobs/${row.id}` : "/jobs";
}

function transportHref(row: any) {
  return row?.id ? `/transport-jobs/${row.id}` : "/transport-jobs";
}

function invoiceNeedsAttention(status: unknown) {
  return !clean(status) || ["not invoiced", "invoiced", "part paid"].includes(clean(status).toLowerCase());
}

async function section(title: string, description: string, load: () => Promise<CleanupRow[]>): Promise<CleanupSection> {
  try {
    return { title, description, rows: await load() };
  } catch (error: any) {
    return { title, description, rows: [], error: error?.message || "Could not load this cleanup check." };
  }
}

export default async function DataCleanupPage() {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const sections = await Promise.all([
    section("Unassigned transport jobs", "Transport jobs missing a vehicle or driver.", async () => {
      const { data, error } = await admin
        .from("transport_jobs")
        .select("id, transport_number, transport_date, status, vehicle_id, operator_id, clients:client_id(company_name)")
        .eq("archived", false)
        .or("vehicle_id.is.null,operator_id.is.null")
        .order("transport_date", { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        reference: row.transport_number ?? "Transport job",
        date: rowDate(row),
        customer: customerName(row),
        status: row.status ?? "—",
        issue: [!row.vehicle_id ? "missing vehicle" : null, !row.operator_id ? "missing driver" : null].filter(Boolean).join(", "),
        href: transportHref(row),
      }));
    }),

    section("Unassigned crane jobs", "Crane jobs missing a crane or operator.", async () => {
      const { data, error } = await admin
        .from("jobs")
        .select("id, job_number, job_date, start_date, status, equipment_id, operator_id, clients:client_id(company_name)")
        .eq("archived", false)
        .or("equipment_id.is.null,operator_id.is.null")
        .order("job_date", { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        reference: row.job_number ?? "Crane job",
        date: rowDate(row),
        customer: customerName(row),
        status: row.status ?? "—",
        issue: [!row.equipment_id ? "missing crane" : null, !row.operator_id ? "missing operator" : null].filter(Boolean).join(", "),
        href: craneHref(row),
      }));
    }),

    section("Completed not invoiced", "Completed crane and transport jobs that still need invoice attention.", async () => {
      const [{ data: crane, error: craneError }, { data: transport, error: transportError }] = await Promise.all([
        admin
          .from("jobs")
          .select("id, job_number, job_date, status, invoice_status, clients:client_id(company_name)")
          .eq("archived", false)
          .eq("status", "completed")
          .order("job_date", { ascending: false })
          .limit(50),
        admin
          .from("transport_jobs")
          .select("id, transport_number, transport_date, status, invoice_status, clients:client_id(company_name)")
          .eq("archived", false)
          .eq("status", "completed")
          .order("transport_date", { ascending: false })
          .limit(50),
      ]);

      if (craneError) throw craneError;
      if (transportError) throw transportError;

      return [
        ...(crane ?? [])
          .filter((row: any) => invoiceNeedsAttention(row.invoice_status))
          .map((row: any) => ({
            reference: row.job_number ?? "Crane job",
            date: rowDate(row),
            customer: customerName(row),
            status: row.invoice_status ?? "Not Invoiced",
            issue: "completed crane job not fully paid/invoiced",
            href: craneHref(row),
          })),
        ...(transport ?? [])
          .filter((row: any) => invoiceNeedsAttention(row.invoice_status))
          .map((row: any) => ({
            reference: row.transport_number ?? "Transport job",
            date: rowDate(row),
            customer: customerName(row),
            status: row.invoice_status ?? "Not Invoiced",
            issue: "completed transport job not fully paid/invoiced",
            href: transportHref(row),
          })),
      ].slice(0, 75);
    }),

    section("Jobs with £0 invoice totals", "Crane and transport jobs that may need pricing/invoice totals checked.", async () => {
      const [{ data: crane, error: craneError }, { data: transport, error: transportError }] = await Promise.all([
        admin
          .from("jobs")
          .select("id, job_number, job_date, status, total_invoice, invoice_total, invoice_amount, clients:client_id(company_name)")
          .eq("archived", false)
          .order("job_date", { ascending: false })
          .limit(250),
        admin
          .from("transport_jobs")
          .select("id, transport_number, transport_date, status, total_invoice, agreed_sell_rate, price, clients:client_id(company_name)")
          .eq("archived", false)
          .order("transport_date", { ascending: false })
          .limit(250),
      ]);

      if (craneError) throw craneError;
      if (transportError) throw transportError;

      return [
        ...(crane ?? [])
          .filter((row: any) => moneyNumber(row.total_invoice ?? row.invoice_total ?? row.invoice_amount) <= 0)
          .map((row: any) => ({
            reference: row.job_number ?? "Crane job",
            date: rowDate(row),
            customer: customerName(row),
            status: row.status ?? "—",
            issue: "£0 crane invoice total",
            href: craneHref(row),
          })),
        ...(transport ?? [])
          .filter((row: any) => moneyNumber(row.total_invoice ?? row.agreed_sell_rate ?? row.price) <= 0)
          .map((row: any) => ({
            reference: row.transport_number ?? "Transport job",
            date: rowDate(row),
            customer: customerName(row),
            status: row.status ?? "—",
            issue: "£0 transport sell total",
            href: transportHref(row),
          })),
      ].slice(0, 75);
    }),

    section("Missing customer or site/address details", "Jobs that are harder to invoice or plan because key customer/site information is missing.", async () => {
      const [{ data: crane, error: craneError }, { data: transport, error: transportError }] = await Promise.all([
        admin
          .from("jobs")
          .select("id, job_number, job_date, status, client_id, site_name, site_address, clients:client_id(company_name)")
          .eq("archived", false)
          .order("job_date", { ascending: false })
          .limit(250),
        admin
          .from("transport_jobs")
          .select("id, transport_number, transport_date, status, client_id, collection_address, delivery_address, clients:client_id(company_name)")
          .eq("archived", false)
          .order("transport_date", { ascending: false })
          .limit(250),
      ]);

      if (craneError) throw craneError;
      if (transportError) throw transportError;

      return [
        ...(crane ?? [])
          .filter((row: any) => !row.client_id || (!clean(row.site_address) && !clean(row.site_name)))
          .map((row: any) => ({
            reference: row.job_number ?? "Crane job",
            date: rowDate(row),
            customer: customerName(row),
            status: row.status ?? "—",
            issue: [
              !row.client_id ? "missing customer" : null,
              !clean(row.site_address) && !clean(row.site_name) ? "missing site address/name" : null,
            ].filter(Boolean).join(", "),
            href: craneHref(row),
          })),
        ...(transport ?? [])
          .filter((row: any) => !row.client_id || !clean(row.collection_address) || !clean(row.delivery_address))
          .map((row: any) => ({
            reference: row.transport_number ?? "Transport job",
            date: rowDate(row),
            customer: customerName(row),
            status: row.status ?? "—",
            issue: [
              !row.client_id ? "missing customer" : null,
              !clean(row.collection_address) ? "missing collection address" : null,
              !clean(row.delivery_address) ? "missing delivery address" : null,
            ].filter(Boolean).join(", "),
            href: transportHref(row),
          })),
      ].slice(0, 75);
    }),
  ]);

  const totalIssues = sections.reduce((sum, item) => sum + item.rows.length, 0);

  return (
    <ClientShell>
      <main style={pageStyle}>
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>ADMIN CLEANUP</div>
            <h1 style={titleStyle}>Data cleanup</h1>
            <p style={subtleStyle}>
              Records that likely need office review before they cause invoice, planner or reporting problems.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/settings/exports" style={secondaryButtonStyle}>Exports</Link>
            <Link href="/settings/system-health" style={secondaryButtonStyle}>System health</Link>
            <Link href="/dashboard" style={secondaryButtonStyle}>Dashboard</Link>
          </div>
        </div>

        <section style={summaryGridStyle}>
          <Summary label="Cleanup sections" value={sections.length} />
          <Summary label="Rows shown" value={totalIssues} />
          <Summary label="Export first" value="CSV" />
        </section>

        <section style={noteStyle}>
          This page does not change records. Open the job, fix the missing detail, then refresh this page. Each section is capped so the page stays quick.
        </section>

        <div style={{ display: "grid", gap: 14 }}>
          {sections.map((item) => (
            <CleanupPanel key={item.title} section={item} />
          ))}
        </div>
      </main>
    </ClientShell>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={summaryCardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={bigValueStyle}>{value}</div>
    </div>
  );
}

function CleanupPanel({ section }: { section: CleanupSection }) {
  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h2 style={sectionTitleStyle}>{section.title}</h2>
          <p style={subtleStyle}>{section.description}</p>
        </div>
        <span style={badgeStyle}>{section.rows.length}</span>
      </div>

      {section.error ? <div style={errorBoxStyle}>{section.error}</div> : null}

      {!section.error && section.rows.length === 0 ? (
        <div style={emptyStyle}>Nothing showing for this check.</div>
      ) : null}

      {section.rows.length > 0 ? (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Reference</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Issue</th>
                <th style={thStyle}>Open</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, index) => (
                <tr key={`${row.href}-${index}`}>
                  <td style={tdStyle}>{row.reference}</td>
                  <td style={tdStyle}>{row.date || "—"}</td>
                  <td style={tdStyle}>{row.customer}</td>
                  <td style={tdStyle}>{row.status || "—"}</td>
                  <td style={tdStyle}>{row.issue}</td>
                  <td style={tdStyle}>
                    <Link href={row.href} style={openButtonStyle}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

const pageStyle: CSSProperties = { width: "min(1250px, 96vw)", margin: "0 auto", display: "grid", gap: 18 };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" };
const eyebrowStyle: CSSProperties = { fontSize: 12, fontWeight: 1000, letterSpacing: 1.4, color: "#64748b" };
const titleStyle: CSSProperties = { margin: "4px 0 0", fontSize: 34, lineHeight: 1.05 };
const subtleStyle: CSSProperties = { margin: 0, opacity: 0.72, lineHeight: 1.45 };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 };
const summaryCardStyle: CSSProperties = { border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.88)", boxShadow: "0 10px 24px rgba(15,23,42,0.05)" };
const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 1000, letterSpacing: 0.9, textTransform: "uppercase", color: "#475569" };
const bigValueStyle: CSSProperties = { marginTop: 6, fontSize: 26, fontWeight: 1000 };
const noteStyle: CSSProperties = { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 16, padding: 14, color: "#1e3a8a", lineHeight: 1.45 };
const cardStyle: CSSProperties = { background: "rgba(255,255,255,0.82)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 18, padding: 16, boxShadow: "0 10px 24px rgba(15,23,42,0.05)" };
const sectionTitleStyle: CSSProperties = { margin: "0 0 6px", fontSize: 22 };
const badgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 42, padding: "6px 10px", borderRadius: 999, background: "#111827", color: "white", fontWeight: 1000 };
const emptyStyle: CSSProperties = { marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(15,23,42,0.05)", color: "#475569" };
const errorBoxStyle: CSSProperties = { marginTop: 12, padding: 12, borderRadius: 12, background: "#fee2e2", border: "1px solid #fecaca", color: "#991b1b" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 850 };
const thStyle: CSSProperties = { textAlign: "left", padding: "10px 8px", fontSize: 12, letterSpacing: 0.7, textTransform: "uppercase", color: "#64748b", borderBottom: "1px solid rgba(0,0,0,0.1)" };
const tdStyle: CSSProperties = { padding: "11px 8px", borderBottom: "1px solid rgba(0,0,0,0.06)", verticalAlign: "top" };
const secondaryButtonStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.14)", background: "white", color: "black", textDecoration: "none", fontWeight: 1000 };
const openButtonStyle: CSSProperties = { display: "inline-flex", padding: "7px 10px", borderRadius: 999, background: "#111827", color: "white", textDecoration: "none", fontWeight: 1000, fontSize: 12 };
