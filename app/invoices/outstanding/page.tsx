import type { CSSProperties } from "react";
import Link from "next/link";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function money(value: unknown) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

function fmtDate(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  if (!text) return "—";
  const d = new Date(`${text}T00:00:00`);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleDateString("en-GB");
}

function invoiceStatus(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "Not Invoiced";
}

function outstandingAmount(row: any) {
  const total =
    Number(row?.invoice_total ?? 0) ||
    Number(row?.total_invoice ?? 0) ||
    Number(row?.invoice_amount ?? 0) ||
    Number(row?.invoice_subtotal ?? 0) ||
    Number(row?.agreed_sell_rate ?? 0) ||
    Number(row?.price ?? 0) ||
    0;

  const paid = Number(row?.amount_paid ?? 0) || 0;
  return Math.max(total - paid, 0);
}

function activeOutstanding(row: any) {
  const status = String(row?.status ?? "").trim().toLowerCase();
  const invoice = invoiceStatus(row?.invoice_status).toLowerCase();

  if (status === "cancelled") return false;
  return invoice !== "paid";
}

export default async function OutstandingInvoicesPage() {
  const supabase = createSupabaseServerClient();

  const [craneRes, transportRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, site_name, start_date, end_date, status, invoice_status, invoice_total, total_invoice, invoice_amount, invoice_subtotal, clients:client_id(company_name)")
      .or("archived.is.null,archived.eq.false")
      .neq("status", "cancelled")
      .order("start_date", { ascending: false })
      .limit(250),
    supabase
      .from("transport_jobs")
      .select("id, transport_number, collection_address, delivery_address, transport_date, delivery_date, status, invoice_status, invoice_total, total_invoice, invoice_subtotal, agreed_sell_rate, price, amount_paid, clients:client_id(company_name)")
      .or("archived.is.null,archived.eq.false")
      .neq("status", "cancelled")
      .order("transport_date", { ascending: false })
      .limit(250),
  ]);

  const craneRows = (craneRes.data ?? [])
    .filter(activeOutstanding)
    .map((row: any) => ({
      type: "Crane",
      id: row.id,
      ref: row.job_number ? `#${row.job_number}` : row.id,
      customer: row.clients?.company_name ?? "—",
      detail: row.site_name ?? "—",
      date: row.start_date ?? row.end_date,
      status: row.status,
      invoice_status: invoiceStatus(row.invoice_status),
      amount: outstandingAmount(row),
      href: `/jobs/${row.id}`,
    }));

  const transportRows = (transportRes.data ?? [])
    .filter(activeOutstanding)
    .map((row: any) => ({
      type: "Transport",
      id: row.id,
      ref: row.transport_number || row.id,
      customer: row.clients?.company_name ?? "—",
      detail: [row.collection_address, row.delivery_address].filter(Boolean).join(" → ") || "—",
      date: row.transport_date ?? row.delivery_date,
      status: row.status,
      invoice_status: invoiceStatus(row.invoice_status),
      amount: outstandingAmount(row),
      href: `/transport-jobs/${row.id}`,
    }));

  const rows = [...craneRows, ...transportRows].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  const totalOutstanding = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return (
    <ClientShell>
      <main style={pageWrap}>
        <div style={headerRow}>
          <div>
            <h1 style={title}>Outstanding invoices</h1>
            <p style={subtitle}>
              Combined crane and transport invoice list. Late-cancelled transport jobs stay here until marked Paid.
            </p>
          </div>
          <Link href="/dashboard" style={secondaryBtn}>Back to dashboard</Link>
        </div>

        <section style={summaryGrid}>
          <div style={summaryCard}>
            <div style={summaryLabel}>Outstanding records</div>
            <div style={summaryValue}>{rows.length}</div>
          </div>
          <div style={summaryCard}>
            <div style={summaryLabel}>Estimated outstanding value</div>
            <div style={summaryValue}>{money(totalOutstanding)}</div>
          </div>
          <div style={summaryCard}>
            <div style={summaryLabel}>Transport included</div>
            <div style={summaryValue}>{transportRows.length}</div>
          </div>
        </section>

        {craneRes.error ? <div style={errorBox}>Crane invoice lookup: {craneRes.error.message}</div> : null}
        {transportRes.error ? <div style={errorBox}>Transport invoice lookup: {transportRes.error.message}</div> : null}

        <section style={card}>
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
                  <th style={th}>Amount</th>
                  <th style={th}>Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={emptyCell}>No outstanding crane or transport invoices found.</td>
                  </tr>
                ) : rows.map((row) => (
                  <tr key={`${row.type}-${row.id}`}>
                    <td style={td}>{row.type}</td>
                    <td style={td}>{row.ref}</td>
                    <td style={td}>{row.customer}</td>
                    <td style={td}>{row.detail}</td>
                    <td style={td}>{fmtDate(row.date)}</td>
                    <td style={td}>{row.status || "—"}</td>
                    <td style={td}><span style={pill}>{row.invoice_status}</span></td>
                    <td style={td}>{money(row.amount)}</td>
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

const pageWrap: CSSProperties = {
  display: "grid",
  gap: 18,
  padding: 20,
};

const headerRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  flexWrap: "wrap",
};

const title: CSSProperties = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.15,
};

const subtitle: CSSProperties = {
  margin: "8px 0 0",
  color: "#5f6368",
  maxWidth: 760,
};

const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const summaryCard: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  background: "#fff",
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
};

const summaryLabel: CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#6b7280",
  fontWeight: 800,
};

const summaryValue: CSSProperties = {
  marginTop: 6,
  fontSize: 24,
  fontWeight: 900,
};

const card: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  background: "#fff",
  overflow: "hidden",
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
};

const tableWrap: CSSProperties = {
  overflowX: "auto",
};

const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 980,
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 12,
  color: "#6b7280",
  borderBottom: "1px solid #e5e7eb",
  background: "#f9fafb",
};

const td: CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
  fontSize: 14,
};

const emptyCell: CSSProperties = {
  padding: 18,
  textAlign: "center",
  color: "#6b7280",
};

const pill: CSSProperties = {
  display: "inline-flex",
  borderRadius: 999,
  padding: "4px 9px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  fontWeight: 800,
  fontSize: 12,
};

const linkStyle: CSSProperties = {
  fontWeight: 900,
  color: "#0f172a",
  textDecoration: "underline",
};

const secondaryBtn: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: "10px 14px",
  textDecoration: "none",
  color: "#111827",
  fontWeight: 800,
  background: "#fff",
};

const errorBox: CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 14,
  padding: 14,
  fontWeight: 700,
};
