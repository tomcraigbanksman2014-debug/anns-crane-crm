import type { CSSProperties } from "react";
import Link from "next/link";
import ClientShell from "../../ClientShell";
import { requireAdmin } from "../../lib/routeGuards";

export const dynamic = "force-dynamic";

type ExportCard = {
  title: string;
  description: string;
  slug: string;
  filters: Array<"date" | "status" | "invoice" | "customer" | "jobType" | "view" | "q">;
};

const exportCards: ExportCard[] = [
  { title: "Customers CSV", description: "Customer contact list for accounts, reporting and quick recovery from mistakes.", slug: "customers", filters: ["view", "q"] },
  { title: "Crane jobs CSV", description: "Crane job list with customer, site, status, invoice and outstanding amount columns.", slug: "crane-jobs", filters: ["date", "status", "invoice", "customer", "view"] },
  { title: "Transport jobs CSV", description: "Transport job list with driver, vehicle, customer, charge, supplier cost and invoice columns.", slug: "transport-jobs", filters: ["date", "status", "invoice", "customer", "jobType", "view"] },
  { title: "Quotes CSV", description: "Quote list with subject, customer, quote date, validity, status and amount.", slug: "quotes", filters: ["date", "status", "customer", "view"] },
  { title: "Purchase orders CSV", description: "Supplier purchase order list linked to crane or transport jobs where available.", slug: "purchase-orders", filters: ["date", "status"] },
  { title: "Outstanding invoices CSV", description: "Combined crane and transport job outstanding invoice list.", slug: "outstanding-invoices", filters: ["date", "customer", "view"] },
  { title: "Suppliers/subcontractors CSV", description: "Supplier, subcontractor and cross-hire contact list.", slug: "suppliers", filters: ["view", "q"] },
  { title: "Operators/staff CSV", description: "Operator and staff contact list including status and employment type where held.", slug: "operators", filters: ["status", "view", "q"] },
  { title: "Operator qualifications CSV", description: "Qualification expiry export for compliance checks.", slug: "operator-qualifications", filters: ["date"] },
  { title: "Campaign recipients CSV", description: "Sales lead export including do-not-contact state. Microsoft sending remains separate.", slug: "campaign-recipients", filters: ["q"] },
  { title: "Suppression/unsubscribe list CSV", description: "Marketing unsubscribe and suppression records for compliance checks.", slug: "suppression", filters: [] },
  { title: "Status/invoice audit CSV", description: "Audit trail of status, invoice status and amount-paid changes.", slug: "status-invoice-audit", filters: ["date"] },
];

export default async function SettingsExportsPage() {
  await requireAdmin();

  return (
    <ClientShell>
      <main style={pageStyle}>
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>ADMIN EXPORTS</div>
            <h1 style={titleStyle}>Exports & office backups</h1>
            <p style={subtleStyle}>
              CSV exports for accounts, reporting and quick data recovery. These are office/admin exports, not a replacement for Supabase database-level backups.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/settings/data-cleanup" style={secondaryButtonStyle}>Data cleanup</Link>
            <Link href="/settings/system-health" style={secondaryButtonStyle}>System health</Link>
            <Link href="/settings" style={secondaryButtonStyle}>Settings</Link>
            <Link href="/dashboard" style={secondaryButtonStyle}>Dashboard</Link>
          </div>
        </div>

        <section style={warningStyle}>
          <strong>Use these when you need a working CSV quickly.</strong> For full disaster recovery, keep using Supabase/database backups as the real source-of-truth backup.
        </section>

        <section style={gridStyle}>
          {exportCards.map((card) => (
            <ExportPanel key={card.slug} card={card} />
          ))}
        </section>
      </main>
    </ClientShell>
  );
}

function ExportPanel({ card }: { card: ExportCard }) {
  return (
    <form action={`/api/settings/exports/${card.slug}`} method="get" style={cardStyle}>
      <div>
        <h2 style={sectionTitleStyle}>{card.title}</h2>
        <p style={subtleStyle}>{card.description}</p>
      </div>

      {card.filters.length > 0 ? (
        <div style={filterGridStyle}>
          {card.filters.includes("date") ? (
            <>
              <Field label="Date from"><input type="date" name="date_from" style={inputStyle} /></Field>
              <Field label="Date to"><input type="date" name="date_to" style={inputStyle} /></Field>
            </>
          ) : null}

          {card.filters.includes("status") ? (
            <Field label="Status"><input name="status" placeholder="e.g. confirmed" style={inputStyle} /></Field>
          ) : null}

          {card.filters.includes("invoice") ? (
            <Field label="Invoice status">
              <select name="invoice_status" defaultValue="all" style={inputStyle}>
                <option value="all">All</option>
                <option value="Not Invoiced">Not Invoiced</option>
                <option value="Invoiced">Invoiced</option>
                <option value="Part Paid">Part Paid</option>
                <option value="Paid">Paid</option>
              </select>
            </Field>
          ) : null}

          {card.filters.includes("customer") ? (
            <Field label="Customer contains"><input name="customer" placeholder="Company name" style={inputStyle} /></Field>
          ) : null}

          {card.filters.includes("jobType") ? (
            <Field label="Job type"><input name="job_type" placeholder="e.g. HIAB" style={inputStyle} /></Field>
          ) : null}

          {card.filters.includes("view") ? (
            <Field label="Records">
              <select name="view" defaultValue="active" style={inputStyle}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </Field>
          ) : null}

          {card.filters.includes("q") ? (
            <Field label="Search contains"><input name="q" placeholder="Optional search" style={inputStyle} /></Field>
          ) : null}
        </div>
      ) : (
        <div style={mutedBoxStyle}>No extra filters for this export.</div>
      )}

      <button type="submit" style={primaryButtonStyle}>Download CSV</button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

const pageStyle: CSSProperties = { width: "min(1250px, 96vw)", margin: "0 auto", display: "grid", gap: 18 };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" };
const eyebrowStyle: CSSProperties = { fontSize: 12, fontWeight: 1000, letterSpacing: 1.4, color: "#64748b" };
const titleStyle: CSSProperties = { margin: "4px 0 0", fontSize: 34, lineHeight: 1.05 };
const subtleStyle: CSSProperties = { margin: 0, opacity: 0.72, lineHeight: 1.45 };
const warningStyle: CSSProperties = { background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 16, padding: 14, color: "#7c2d12", lineHeight: 1.45 };
const gridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 14 };
const cardStyle: CSSProperties = { display: "grid", gap: 14, alignContent: "space-between", background: "rgba(255,255,255,0.82)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 18, padding: 16, boxShadow: "0 10px 24px rgba(15,23,42,0.05)" };
const sectionTitleStyle: CSSProperties = { margin: "0 0 6px", fontSize: 20 };
const filterGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 };
const fieldStyle: CSSProperties = { display: "grid", gap: 5 };
const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 1000, textTransform: "uppercase", letterSpacing: 0.7, color: "#475569" };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid rgba(0,0,0,0.14)", borderRadius: 10, padding: "9px 10px", fontSize: 14, background: "white" };
const primaryButtonStyle: CSSProperties = { width: "100%", border: 0, borderRadius: 12, padding: "11px 14px", background: "#111827", color: "white", fontWeight: 1000, cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.14)", background: "white", color: "black", textDecoration: "none", fontWeight: 1000 };
const mutedBoxStyle: CSSProperties = { padding: 10, borderRadius: 12, background: "rgba(15,23,42,0.05)", color: "#475569", fontSize: 13 };
