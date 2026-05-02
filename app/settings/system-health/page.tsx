import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import ClientShell from "../../ClientShell";
import { isMasterAdminEmail, getMasterAdminEmail } from "../../lib/admin";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getMicrosoftSenderEmail, microsoftGraphConfigured } from "../../lib/email/microsoftGraph";

export const dynamic = "force-dynamic";

type HealthCheck = {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
};

function envPresent(name: string) {
  return Boolean(String(process.env[name] ?? "").trim());
}

function statusLabel(status: HealthCheck["status"]) {
  if (status === "ok") return "OK";
  if (status === "warn") return "CHECK";
  return "FAIL";
}

async function tableCheck(admin: ReturnType<typeof createSupabaseAdminClient> | null, label: string, table: string, columns = "id"): Promise<HealthCheck> {
  if (!admin) {
    return { label, status: "warn", detail: "Supabase service role is not configured, so this table could not be checked." };
  }

  const { error } = await admin.from(table).select(columns).limit(1);

  if (error) {
    return { label, status: "fail", detail: error.message };
  }

  return { label, status: "ok", detail: `${table} is available.` };
}

async function countRows(admin: ReturnType<typeof createSupabaseAdminClient> | null, table: string) {
  if (!admin) return null;
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

export default async function SystemHealthPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isMasterAdminEmail(user.email ?? null)) redirect("/");

  const checks: HealthCheck[] = [];

  checks.push({
    label: "Masteradmin access",
    status: getMasterAdminEmail() ? "ok" : "fail",
    detail: getMasterAdminEmail() ? `MASTER_ADMIN_EMAIL is configured.` : "MASTER_ADMIN_EMAIL is missing.",
  });

  checks.push({
    label: "Supabase public env vars",
    status: envPresent("NEXT_PUBLIC_SUPABASE_URL") && envPresent("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "ok" : "fail",
    detail: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for the app.",
  });

  checks.push({
    label: "Supabase service role",
    status: envPresent("SUPABASE_SERVICE_ROLE_KEY") ? "ok" : "warn",
    detail: envPresent("SUPABASE_SERVICE_ROLE_KEY") ? "Service role key is available for admin-only checks." : "Service role key missing. Admin-only checks and send flows may fail.",
  });

  checks.push({
    label: "Microsoft Graph env vars",
    status: microsoftGraphConfigured() ? "ok" : "warn",
    detail: microsoftGraphConfigured()
      ? `Microsoft Graph sender configured as ${getMicrosoftSenderEmail()}.`
      : "Campaign sending remains safely unavailable until MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET and MICROSOFT_SENDER_EMAIL are added.",
  });

  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    admin = null;
  }

  const tableChecks = await Promise.all([
    tableCheck(admin, "Campaign test mode table", "campaign_email_settings", "id, test_mode_enabled, test_recipient_email"),
    tableCheck(admin, "Status/invoice audit table", "job_status_audit_log", "id, record_type, record_id, field_changed, created_at"),
    tableCheck(admin, "Marketing unsubscribe tokens", "marketing_unsubscribe_tokens", "id, token, email_normalized"),
    tableCheck(admin, "Marketing unsubscribes", "marketing_unsubscribes", "id, email_normalized"),
    tableCheck(admin, "Marketing suppression entries", "marketing_suppression_entries", "id, match_type, match_value, active"),
    tableCheck(admin, "Planner preferences", "user_preferences", "id, user_id, planner_view_mode"),
    tableCheck(admin, "Smart side menu usage", "user_menu_usage", "id, user_id, href, click_count"),
    tableCheck(admin, "Crane job invoice/status columns", "jobs", "id, status, invoice_status, amount_paid"),
    tableCheck(admin, "Transport job invoice/status columns", "transport_jobs", "id, status, invoice_status, amount_paid"),
    tableCheck(admin, "Staff holiday working-day count", "operator_availability", "id, status, working_day_count"),
  ]);

  checks.push(...tableChecks);

  let campaignSettings: any = null;
  if (admin) {
    const { data } = await admin
      .from("campaign_email_settings")
      .select("test_mode_enabled, test_recipient_email, updated_at, updated_by_username")
      .eq("id", true)
      .maybeSingle();
    campaignSettings = data ?? null;
  }

  const statusAuditRows = await countRows(admin, "job_status_audit_log");
  const auditRows = await countRows(admin, "audit_log");

  const okCount = checks.filter((check) => check.status === "ok").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const failCount = checks.filter((check) => check.status === "fail").length;

  return (
    <ClientShell>
      <main style={pageStyle}>
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>MASTERADMIN ONLY</div>
            <h1 style={titleStyle}>System health</h1>
            <p style={subtleStyle}>Deployment and CRM configuration checks for AnnS Crane CRM.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/settings/status-audit" style={secondaryButtonStyle}>Status audit</Link>
            <Link href="/" style={secondaryButtonStyle}>Back to dashboard</Link>
          </div>
        </div>

        <section style={summaryGridStyle}>
          <Summary label="OK" value={okCount} tone="ok" />
          <Summary label="Needs checking" value={warnCount} tone="warn" />
          <Summary label="Failed" value={failCount} tone="fail" />
          <Summary label="Status audit rows" value={statusAuditRows ?? "—"} tone="plain" />
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Campaign safety</h2>
          <div style={miniGridStyle}>
            <div style={miniCardStyle}>
              <div style={labelStyle}>Campaign test mode</div>
              <div style={bigValueStyle}>{campaignSettings?.test_mode_enabled === false ? "OFF" : "ON"}</div>
              <div style={subtleStyle}>Default is ON so live customers are protected until you turn it off deliberately.</div>
            </div>
            <div style={miniCardStyle}>
              <div style={labelStyle}>Test recipient</div>
              <div style={bigValueStyle}>{campaignSettings?.test_recipient_email ?? "sales@annscranehire.co.uk"}</div>
              <div style={subtleStyle}>Campaign tests are sent here only while test mode is ON.</div>
            </div>
            <div style={miniCardStyle}>
              <div style={labelStyle}>General audit rows</div>
              <div style={bigValueStyle}>{auditRows ?? "—"}</div>
              <div style={subtleStyle}>Existing CRM audit log count.</div>
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Checks</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {checks.map((check) => (
              <div key={check.label} style={checkRowStyle}>
                <span style={{ ...badgeStyle, ...badgeTone(check.status) }}>{statusLabel(check.status)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 1000 }}>{check.label}</div>
                  <div style={subtleStyle}>{check.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </ClientShell>
  );
}

function Summary({ label, value, tone }: { label: string; value: string | number; tone: "ok" | "warn" | "fail" | "plain" }) {
  const bg = tone === "ok" ? "#dcfce7" : tone === "warn" ? "#fef3c7" : tone === "fail" ? "#fee2e2" : "rgba(255,255,255,0.9)";
  const border = tone === "ok" ? "#86efac" : tone === "warn" ? "#fcd34d" : tone === "fail" ? "#fca5a5" : "rgba(0,0,0,0.08)";
  return (
    <div style={{ ...summaryCardStyle, background: bg, borderColor: border }}>
      <div style={labelStyle}>{label}</div>
      <div style={bigValueStyle}>{value}</div>
    </div>
  );
}

function badgeTone(status: HealthCheck["status"]): CSSProperties {
  if (status === "ok") return { background: "#dcfce7", borderColor: "#86efac", color: "#166534" };
  if (status === "warn") return { background: "#fef3c7", borderColor: "#fcd34d", color: "#92400e" };
  return { background: "#fee2e2", borderColor: "#fca5a5", color: "#991b1b" };
}

const pageStyle: CSSProperties = { display: "grid", gap: 18 };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" };
const eyebrowStyle: CSSProperties = { fontSize: 12, fontWeight: 1000, letterSpacing: 1.4, color: "#64748b" };
const titleStyle: CSSProperties = { margin: "4px 0 0", fontSize: 34, lineHeight: 1.05 };
const subtleStyle: CSSProperties = { margin: 0, opacity: 0.72, lineHeight: 1.45 };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 };
const summaryCardStyle: CSSProperties = { border: "1px solid", borderRadius: 16, padding: 16, boxShadow: "0 10px 24px rgba(15,23,42,0.05)" };
const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 1000, letterSpacing: 0.9, textTransform: "uppercase", color: "#475569" };
const bigValueStyle: CSSProperties = { marginTop: 6, fontSize: 26, fontWeight: 1000 };
const cardStyle: CSSProperties = { background: "rgba(255,255,255,0.78)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 18, padding: 18 };
const sectionTitleStyle: CSSProperties = { margin: "0 0 12px", fontSize: 22 };
const miniGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 };
const miniCardStyle: CSSProperties = { background: "rgba(255,255,255,0.82)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 14 };
const checkRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "86px minmax(0, 1fr)", gap: 12, alignItems: "start", padding: 12, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, background: "rgba(255,255,255,0.82)" };
const badgeStyle: CSSProperties = { display: "inline-flex", justifyContent: "center", alignItems: "center", border: "1px solid", borderRadius: 999, padding: "6px 9px", fontSize: 12, fontWeight: 1000 };
const secondaryButtonStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.14)", background: "white", color: "black", textDecoration: "none", fontWeight: 1000 };
