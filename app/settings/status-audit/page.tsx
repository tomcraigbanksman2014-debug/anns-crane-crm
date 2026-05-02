import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import ClientShell from "../../ClientShell";
import { isMasterAdminEmail } from "../../lib/admin";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

function fmtDate(value: unknown) {
  const text = String(value ?? "");
  if (!text) return "—";
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? text : d.toLocaleString("en-GB");
}

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "—";
}

export default async function StatusAuditPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isMasterAdminEmail(user.email ?? null)) redirect("/");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("job_status_audit_log")
    .select("id, record_type, record_id, record_reference, field_changed, old_value, new_value, actor_username, source, created_at")
    .order("created_at", { ascending: false })
    .limit(250);

  const rows = Array.isArray(data) ? data : [];

  return (
    <ClientShell>
      <main style={pageStyle}>
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>MASTERADMIN ONLY</div>
            <h1 style={titleStyle}>Status & invoice audit</h1>
            <p style={subtleStyle}>Latest status, invoice-status and amount-paid changes from dashboard and job pages.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/settings/system-health" style={secondaryButtonStyle}>System health</Link>
            <Link href="/" style={secondaryButtonStyle}>Back to dashboard</Link>
          </div>
        </div>

        {error ? <div style={errorBoxStyle}>{error.message}</div> : null}

        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <h2 style={sectionTitleStyle}>Latest audit rows</h2>
            <div style={badgeStyle}>{rows.length} shown</div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>When</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Reference</th>
                  <th style={thStyle}>Field</th>
                  <th style={thStyle}>Old</th>
                  <th style={thStyle}>New</th>
                  <th style={thStyle}>Changed by</th>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => {
                  const href = row.record_type === "transport" ? `/transport-jobs/${row.record_id}` : `/jobs/${row.record_id}`;
                  return (
                    <tr key={row.id}>
                      <td style={tdStyle}>{fmtDate(row.created_at)}</td>
                      <td style={tdStyle}>{clean(row.record_type)}</td>
                      <td style={tdStyle}>{clean(row.record_reference)}</td>
                      <td style={tdStyle}>{clean(row.field_changed)}</td>
                      <td style={tdStyle}>{clean(row.old_value)}</td>
                      <td style={tdStyle}><strong>{clean(row.new_value)}</strong></td>
                      <td style={tdStyle}>{clean(row.actor_username)}</td>
                      <td style={tdStyle}>{clean(row.source)}</td>
                      <td style={tdStyle}><Link href={href} style={linkStyle}>Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </ClientShell>
  );
}

const pageStyle: CSSProperties = { display: "grid", gap: 18 };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" };
const eyebrowStyle: CSSProperties = { fontSize: 12, fontWeight: 1000, letterSpacing: 1.4, color: "#64748b" };
const titleStyle: CSSProperties = { margin: "4px 0 0", fontSize: 34, lineHeight: 1.05 };
const subtleStyle: CSSProperties = { margin: 0, opacity: 0.72, lineHeight: 1.45 };
const cardStyle: CSSProperties = { background: "rgba(255,255,255,0.78)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 18, padding: 18 };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: 22 };
const secondaryButtonStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.14)", background: "white", color: "black", textDecoration: "none", fontWeight: 1000 };
const errorBoxStyle: CSSProperties = { border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", borderRadius: 14, padding: 14, fontWeight: 900 };
const badgeStyle: CSSProperties = { display: "inline-flex", border: "1px solid rgba(0,0,0,0.12)", background: "white", borderRadius: 999, padding: "7px 10px", fontWeight: 1000 };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 980 };
const thStyle: CSSProperties = { textAlign: "left", padding: "9px 8px", borderBottom: "1px solid rgba(0,0,0,0.12)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.7, color: "#475569" };
const tdStyle: CSSProperties = { padding: "10px 8px", borderBottom: "1px solid rgba(0,0,0,0.07)", verticalAlign: "top" };
const linkStyle: CSSProperties = { fontWeight: 1000, color: "#0f172a" };
