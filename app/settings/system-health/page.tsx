import type { CSSProperties } from "react";
import Link from "next/link";
import ClientShell from "../../ClientShell";
import { getMasterAdminEmail } from "../../lib/admin";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { requireMasterAdmin } from "../../lib/routeGuards";
import {
  getMicrosoftSenderEmail,
  microsoftDelegatedOAuthConfigured,
  microsoftGraphConfigured,
  readMicrosoftDelegatedConnection,
} from "../../lib/email/microsoftGraph";

export const dynamic = "force-dynamic";

type HealthCheck = {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
};

type PageProps = {
  searchParams?: {
    microsoft?: string;
    message?: string;
  };
};

function envPresent(name: string) {
  return Boolean(String(process.env[name] ?? "").trim());
}

function statusLabel(status: HealthCheck["status"]) {
  if (status === "ok") return "OK";
  if (status === "warn") return "CHECK";
  return "FAIL";
}

function safeDecode(value: unknown) {
  const raw = String(value ?? "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function tableCheck(
  admin: ReturnType<typeof createSupabaseAdminClient> | null,
  label: string,
  table: string,
  columns = "id"
): Promise<HealthCheck> {
  if (!admin) {
    return {
      label,
      status: "warn",
      detail: "Supabase service role is not configured, so this table could not be checked.",
    };
  }

  const { error } = await admin.from(table).select(columns).limit(1);

  if (error) {
    return { label, status: "fail", detail: error.message };
  }

  return { label, status: "ok", detail: `${table} is available.` };
}

async function countRows(admin: ReturnType<typeof createSupabaseAdminClient> | null, table: string) {
  if (!admin) return null;

  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true });

  if (error) return null;
  return count ?? 0;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

export default async function SystemHealthPage({ searchParams }: PageProps) {
  await requireMasterAdmin();

  const checks: HealthCheck[] = [];
  const expectedMicrosoftSender = getMicrosoftSenderEmail();
  const delegatedOauthConfigured = microsoftDelegatedOAuthConfigured();
  const appOnlyConfigured = microsoftGraphConfigured();

  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;

  try {
    admin = createSupabaseAdminClient();
  } catch {
    admin = null;
  }

  let microsoftConnection: any = null;
  let microsoftConnectionError = "";

  if (admin) {
    try {
      microsoftConnection = await readMicrosoftDelegatedConnection(admin);
    } catch (error: any) {
      microsoftConnectionError = error?.message || "Could not read Microsoft mailbox connection.";
    }
  }

  const microsoftConnected = Boolean(microsoftConnection?.refresh_token);

  checks.push({
    label: "Masteradmin access",
    status: getMasterAdminEmail() ? "ok" : "fail",
    detail: getMasterAdminEmail()
      ? "MASTER_ADMIN_EMAIL is configured."
      : "MASTER_ADMIN_EMAIL is missing.",
  });

  checks.push({
    label: "Supabase public env vars",
    status:
      envPresent("NEXT_PUBLIC_SUPABASE_URL") && envPresent("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        ? "ok"
        : "fail",
    detail: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for the app.",
  });

  checks.push({
    label: "Supabase service role",
    status: envPresent("SUPABASE_SERVICE_ROLE_KEY") ? "ok" : "warn",
    detail: envPresent("SUPABASE_SERVICE_ROLE_KEY")
      ? "Service role key is available for admin-only checks."
      : "Service role key missing. Admin-only checks and send flows may fail.",
  });

  checks.push({
    label: "Microsoft delegated OAuth env vars",
    status: delegatedOauthConfigured ? "ok" : "warn",
    detail: delegatedOauthConfigured
      ? "MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are configured."
      : "Add MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in Vercel before connecting the mailbox.",
  });

  checks.push({
    label: "Microsoft mailbox connection",
    status: microsoftConnected ? "ok" : "warn",
    detail: microsoftConnected
      ? `Delegated mailbox connected as ${microsoftConnection.email_address}.`
      : microsoftConnectionError || `No delegated Microsoft mailbox connected yet. Expected sender: ${expectedMicrosoftSender}.`,
  });

  checks.push({
    label: "Microsoft app-only fallback",
    status: appOnlyConfigured ? "warn" : "warn",
    detail: appOnlyConfigured
      ? "App-only env vars exist, but app-only Mail.Send is still blocked unless admin consent is granted. Delegated mailbox connection is preferred."
      : "App-only Microsoft Graph is not configured. This is OK if using delegated mailbox connection.",
  });

  const tableChecks = await Promise.all([
    tableCheck(admin, "CRM migration tracking", "crm_migrations", "id, description, applied_at"),
    tableCheck(admin, "Microsoft delegated mailbox table", "microsoft_mailbox_connections", "id, email_address, refresh_token, expires_at"),
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

  let migrations: any[] = [];

  if (admin) {
    const { data } = await admin
      .from("crm_migrations")
      .select("id, description, applied_at, applied_by")
      .order("applied_at", { ascending: false })
      .limit(10);

    migrations = Array.isArray(data) ? data : [];
  }

  const statusAuditRows = await countRows(admin, "job_status_audit_log");
  const auditRows = await countRows(admin, "audit_log");

  const okCount = checks.filter((check) => check.status === "ok").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const failCount = checks.filter((check) => check.status === "fail").length;

  const microsoftMessage = safeDecode(searchParams?.message);
  const microsoftMessageType = String(searchParams?.microsoft ?? "");

  return (
    <ClientShell>
      <main style={pageStyle}>
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>MASTERADMIN ONLY</div>
            <h1 style={titleStyle}>System health</h1>
            <p style={subtleStyle}>
              Deployment, CRM configuration and Microsoft mailbox checks for AnnS Crane CRM.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/settings/exports" style={secondaryButtonStyle}>
              Exports
            </Link>
            <Link href="/settings/data-cleanup" style={secondaryButtonStyle}>
              Data cleanup
            </Link>
            <Link href="/settings/status-audit" style={secondaryButtonStyle}>
              Status audit
            </Link>
            <Link href="/" style={secondaryButtonStyle}>
              Back to dashboard
            </Link>
          </div>
        </div>

        {microsoftMessage ? (
          <section
            style={{
              ...noticeStyle,
              ...(microsoftMessageType === "connected" ? noticeOkStyle : microsoftMessageType === "error" ? noticeErrorStyle : {}),
            }}
          >
            {microsoftMessage}
          </section>
        ) : null}

        <section style={summaryGridStyle}>
          <Summary label="OK" value={okCount} tone="ok" />
          <Summary label="Needs checking" value={warnCount} tone="warn" />
          <Summary label="Failed" value={failCount} tone="fail" />
          <Summary label="Status audit rows" value={statusAuditRows ?? "—"} tone="plain" />
          <Summary label="Migrations tracked" value={migrations.length} tone="plain" />
        </section>

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>Microsoft campaign mailbox</h2>
              <p style={subtleStyle}>
                Delegated mailbox login avoids the blocked tenant-wide Mail.Send application consent route.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/api/email/microsoft/connect" style={primaryButtonStyle}>
                {microsoftConnected ? "Reconnect Microsoft mailbox" : "Connect Microsoft mailbox"}
              </a>
            </div>
          </div>

          <div style={miniGridStyle}>
            <div style={miniCardStyle}>
              <div style={labelStyle}>Expected sender</div>
              <div style={bigValueSmallStyle}>{expectedMicrosoftSender}</div>
              <div style={subtleStyle}>The signed-in Microsoft mailbox must match this address.</div>
            </div>

            <div style={miniCardStyle}>
              <div style={labelStyle}>Connection status</div>
              <div style={bigValueStyle}>{microsoftConnected ? "Connected" : "Not connected"}</div>
              <div style={subtleStyle}>
                {microsoftConnected
                  ? `Connected as ${microsoftConnection.email_address}.`
                  : "Click Connect Microsoft mailbox and sign in as the sales mailbox."}
              </div>
            </div>

            <div style={miniCardStyle}>
              <div style={labelStyle}>Connected by</div>
              <div style={bigValueSmallStyle}>{microsoftConnection?.connected_by_username ?? "—"}</div>
              <div style={subtleStyle}>
                Last updated: {formatDateTime(microsoftConnection?.updated_at)}
              </div>
            </div>

            <div style={miniCardStyle}>
              <div style={labelStyle}>OAuth env vars</div>
              <div style={bigValueStyle}>{delegatedOauthConfigured ? "Ready" : "Missing"}</div>
              <div style={subtleStyle}>
                Uses MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.
              </div>
            </div>
          </div>

          {microsoftConnected ? (
            <form action="/api/email/microsoft/disconnect" method="post" style={{ marginTop: 14 }}>
              <button type="submit" style={dangerButtonStyle}>
                Disconnect Microsoft mailbox
              </button>
            </form>
          ) : null}
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Campaign safety</h2>
          <div style={miniGridStyle}>
            <div style={miniCardStyle}>
              <div style={labelStyle}>Campaign test mode</div>
              <div style={bigValueStyle}>{campaignSettings?.test_mode_enabled === false ? "OFF" : "ON"}</div>
              <div style={subtleStyle}>
                Default is ON so live customers are protected until you turn it off deliberately.
              </div>
            </div>

            <div style={miniCardStyle}>
              <div style={labelStyle}>Test recipient</div>
              <div style={bigValueSmallStyle}>{campaignSettings?.test_recipient_email ?? "sales@annscranehire.co.uk"}</div>
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
          <h2 style={sectionTitleStyle}>Migration tracking</h2>
          {migrations.length === 0 ? (
            <p style={subtleStyle}>
              No crm_migrations rows found yet. Run the SQL files in supabase/migrations to register deploys.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {migrations.map((migration: any) => (
                <div key={migration.id} style={checkRowStyle}>
                  <span style={{ ...badgeStyle, ...badgeTone("ok") }}>SQL</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 1000 }}>{migration.id}</div>
                    <div style={subtleStyle}>{migration.description ?? "Migration recorded."}</div>
                    <div style={subtleStyle}>
                      Applied: {migration.applied_at ? new Date(migration.applied_at).toLocaleString("en-GB") : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Checks</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {checks.map((check) => (
              <div key={check.label} style={checkRowStyle}>
                <span style={{ ...badgeStyle, ...badgeTone(check.status) }}>
                  {statusLabel(check.status)}
                </span>
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

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "ok" | "warn" | "fail" | "plain";
}) {
  const bg =
    tone === "ok"
      ? "#dcfce7"
      : tone === "warn"
        ? "#fef3c7"
        : tone === "fail"
          ? "#fee2e2"
          : "rgba(255,255,255,0.9)";
  const border =
    tone === "ok"
      ? "#86efac"
      : tone === "warn"
        ? "#fcd34d"
        : tone === "fail"
          ? "#fca5a5"
          : "rgba(0,0,0,0.08)";

  return (
    <div style={{ ...summaryCardStyle, background: bg, borderColor: border }}>
      <div style={labelStyle}>{label}</div>
      <div style={bigValueStyle}>{value}</div>
    </div>
  );
}

function badgeTone(status: HealthCheck["status"]): CSSProperties {
  if (status === "ok") {
    return { background: "#dcfce7", borderColor: "#86efac", color: "#166534" };
  }

  if (status === "warn") {
    return { background: "#fef3c7", borderColor: "#fcd34d", color: "#92400e" };
  }

  return { background: "#fee2e2", borderColor: "#fca5a5", color: "#991b1b" };
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: 18,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 1000,
  letterSpacing: 1.4,
  color: "#64748b",
};

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 34,
  lineHeight: 1.05,
};

const subtleStyle: CSSProperties = {
  margin: 0,
  opacity: 0.72,
  lineHeight: 1.45,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 1000,
  letterSpacing: 0.9,
  textTransform: "uppercase",
  color: "#475569",
};

const bigValueStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 26,
  fontWeight: 1000,
};

const bigValueSmallStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 1000,
  wordBreak: "break-word",
};

const cardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 18,
  padding: 18,
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "flex-start",
  marginBottom: 12,
};

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 22,
};

const miniGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const miniCardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 14,
};

const checkRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "86px minmax(0, 1fr)",
  gap: 12,
  alignItems: "start",
  padding: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.82)",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  border: "1px solid",
  borderRadius: 999,
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 1000,
};

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "white",
  color: "black",
  textDecoration: "none",
  fontWeight: 1000,
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "11px 15px",
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  textDecoration: "none",
  fontWeight: 1000,
};

const dangerButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fee2e2",
  color: "#991b1b",
  fontWeight: 1000,
  cursor: "pointer",
};

const noticeStyle: CSSProperties = {
  borderRadius: 14,
  padding: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  fontWeight: 900,
};

const noticeOkStyle: CSSProperties = {
  background: "#dcfce7",
  borderColor: "#86efac",
  color: "#166534",
};

const noticeErrorStyle: CSSProperties = {
  background: "#fee2e2",
  borderColor: "#fca5a5",
  color: "#991b1b",
};
