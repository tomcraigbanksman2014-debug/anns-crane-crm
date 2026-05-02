"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import ClientShell from "../ClientShell";
import DashboardSearch from "../components/DashboardSearch";
import StatusPill from "../components/StatusPill";
import OperatorQualificationAlertSummary from "../components/OperatorQualificationAlertSummary";
import OperatorComplianceAlerts from "../components/OperatorComplianceAlerts";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function moneyGBP(value: number | null | undefined) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return n.toLocaleString(undefined, { style: "currency", currency: "GBP" });
}

function daysUntilPasswordExpiry(passwordChangedAt?: string | null) {
  if (!passwordChangedAt) return null;
  const changed = new Date(passwordChangedAt);
  if (Number.isNaN(changed.getTime())) return null;

  const expiry = new Date(changed);
  expiry.setDate(expiry.getDate() + 183);

  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type DashboardStats = {
  jobsToday?: number;
  activeCraneJobs?: number;
  activeTransportToday?: number;
  totalEquipment?: number;
  totalCranes?: number;
  totalVehicles?: number;
  availableCranesNow?: number;
  reservedCranesLater?: number;
  availableVehiclesNow?: number;
  outstandingInvoices?: number;
  utilisationPct?: number | null;
  cranesOnHireNow?: number;
  certExpiringSoon?: number;
  certExpired?: number;
  maintenanceEquipment?: number;
  equipmentWithServiceHistory?: number;
  equipmentWithoutServiceHistory?: number;
  lolerDueSoon?: number;
  lolerOverdue?: number;
  unassignedTransportJobs?: number;
  completedCraneJobsNotInvoiced?: number;
  completedTransportJobsNotInvoiced?: number;
  timesheetsNotSubmitted?: number;
  weeklyIncomingJobs?: {
    lastWeek: number;
    thisWeek: number;
    nextWeek: number;
  };
  weeklyPurchaseOrderCosts?: {
    lastWeek: number;
    thisWeek: number;
    nextWeek: number;
  };
  overdueInvoices?: Array<{
    id: string;
    title?: string;
    subtitle?: string;
    invoice_status?: string;
    amount?: number;
    href?: string;
  }>;
  recentAudit?: Array<{
    id: string;
    actor_username?: string | null;
    action?: string | null;
    entity_type?: string | null;
    created_at?: string | null;
  }>;
  todayJobs?: Array<{
    id: string;
    title?: string;
    subtitle?: string;
    time?: string;
    status?: string;
    href?: string;
  }>;
  upcomingJobs?: Array<{
    id: string;
    title?: string;
    subtitle?: string;
    when?: string;
    status?: string;
    href?: string;
  }>;
  recentServiceLog?: Array<{
    id: string;
    entry_type?: string | null;
    service_date?: string | null;
    engineer?: string | null;
    notes?: string | null;
    created_at?: string | null;
    equipment?: { name?: string | null } | { name?: string | null }[] | null;
  }>;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function DashboardPage() {
  const supabase = createSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [passwordDaysLeft, setPasswordDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        window.location.href = "/login";
        return;
      }

      const user = data.user;
      const email = String(user.email ?? "").trim().toLowerCase();
      const usernameFromEmail = fromAuthEmail(user.email ?? null).toLowerCase();

      const masterAdminEmail = String(process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL ?? "")
        .trim()
        .toLowerCase();
      const isMaster = !!email && !!masterAdminEmail && email === masterAdminEmail;

      const metadataRole = String((user.user_metadata?.role as any) ?? "").toLowerCase();

      if (!isMaster) {
        const { data: operators } = await supabase
          .from("operators")
          .select("id, full_name, email, status")
          .eq("status", "active");

        const matchedOperator =
          (operators ?? []).find((op: any) => {
            const operatorEmail = String(op.email ?? "").trim().toLowerCase();
            const operatorName = String(op.full_name ?? "").trim().toLowerCase();

            return (
              (!!operatorEmail && operatorEmail === email) ||
              (!!operatorName && operatorName === usernameFromEmail)
            );
          }) ?? null;

        if (metadataRole === "operator" || matchedOperator) {
          window.location.href = "/operator/jobs";
          return;
        }
      }

      setUsername(fromAuthEmail(user.email ?? null));
      setRole(isMaster ? "admin" : String((user.user_metadata?.role as any) ?? "staff"));

      const daysLeft = isMaster
        ? null
        : daysUntilPasswordExpiry((user.user_metadata as any)?.password_changed_at ?? null);

      setPasswordDaysLeft(daysLeft);

      const res = await fetch("/api/dashboard/stats");
      const json = await res.json().catch(() => null);

      if (res.ok && json && !json.error) {
        setStats(json);
      } else {
        setStats(null);
      }

      setLoading(false);
    }

    load();
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const financeRiskCount =
    (stats?.completedCraneJobsNotInvoiced ?? 0) +
    (stats?.completedTransportJobsNotInvoiced ?? 0);

  const urgentCount =
    (stats?.unassignedTransportJobs ?? 0) +
    (stats?.timesheetsNotSubmitted ?? 0) +
    financeRiskCount;

  if (loading) {
    return (
      <ClientShell>
        <div className="dash-shell" style={shellStyle}>
          <Panel title="Loading dashboard">
            <EmptyState text="Loading..." />
          </Panel>
        </div>
      </ClientShell>
    );
  }

  return (
    <ClientShell>
      <style>{`
        @media (max-width: 900px) {
          .dash-shell {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            padding: 14px !important;
            border-radius: 18px !important;
          }
          .dash-header,
          .dash-row-link,
          .dash-activity-row {
            align-items: flex-start !important;
          }
          .dash-grid,
          .dash-two-col,
          .dash-three-col,
          .dash-search-shortcuts,
          .dash-office-actions {
            grid-template-columns: 1fr !important;
          }
          .dash-signout {
            width: 100%;
          }
        }
      `}</style>

      <div className="dash-shell" style={shellStyle}>
        <div className="dash-header" style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>AnnS Crane CRM</div>
            <h1 style={{ margin: 0, fontSize: 34 }}>Dashboard</h1>
            <div style={{ marginTop: 6, opacity: 0.75 }}>
              Welcome back, <strong>{username || "user"}</strong>
              {role ? ` • ${role}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/planner" style={searchGhostBtn}>Open planner</a>
            <a href="/sales-hub" style={searchGhostBtn}>Sales Hub</a>
            <button className="dash-signout" onClick={signOut} style={searchGhostBtn}>
              Sign out
            </button>
          </div>
        </div>

        {typeof passwordDaysLeft === "number" && passwordDaysLeft <= 30 ? (
          <Alert tone={passwordDaysLeft <= 7 ? "bad" : "warn"} href="/change-password" linkText="Change password">
            Your password expires in <strong>{passwordDaysLeft}</strong> day{passwordDaysLeft === 1 ? "" : "s"}.
          </Alert>
        ) : null}

        {(stats?.certExpired ?? 0) > 0 ? (
          <Alert tone="bad" href="/equipment" linkText="Open fleet compliance">
            ⚠ {stats?.certExpired} asset item{stats?.certExpired === 1 ? "" : "s"} have expired inspection / certification.
          </Alert>
        ) : null}

        {(stats?.lolerOverdue ?? 0) > 0 ? (
          <Alert tone="bad" href="/equipment" linkText="Review LOLER">
            ⚠ {stats?.lolerOverdue} asset item{stats?.lolerOverdue === 1 ? "" : "s"} have overdue LOLER.
          </Alert>
        ) : null}

        <section style={{ marginTop: 14 }}>
          <Panel title="Today / urgent operations" subtitle="The main things the office should clear first">
            <div className="dash-grid" style={topActionGrid}>
              <ActionCard
                title="Today’s work"
                value={stats?.jobsToday ?? 0}
                help={`${stats?.activeCraneJobs ?? 0} crane jobs • ${stats?.activeTransportToday ?? 0} transport jobs`}
                href="/weekly-planner"
                tone="neutral"
              />
              <ActionCard
                title="Urgent actions"
                value={urgentCount}
                help="Unassigned transport, missing timesheets and completed work not invoiced"
                href="/invoices/outstanding"
                tone={urgentCount > 0 ? "warn" : "good"}
              />
              <ActionCard
                title="Outstanding invoices"
                value={moneyGBP(stats?.outstandingInvoices)}
                help="Combined crane and transport outstanding list"
                href="/invoices/outstanding"
                tone={(stats?.outstandingInvoices ?? 0) > 0 ? "warn" : "good"}
              />
              <ActionCard
                title="Planner / availability"
                value={`${stats?.availableCranesNow ?? 0} cranes • ${stats?.availableVehiclesNow ?? 0} trucks`}
                help={`${stats?.cranesOnHireNow ?? 0} cranes on hire now • ${stats?.reservedCranesLater ?? 0} reserved later`}
                href="/planner"
                tone="neutral"
              />
            </div>
          </Panel>
        </section>

        <div className="dash-two-col" style={twoColWideLeft}>
          <Panel title="Today’s work" subtitle="Crane and transport work due today">
            {!stats?.todayJobs || stats.todayJobs.length === 0 ? (
              <EmptyState text="No work scheduled for today." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {stats.todayJobs.slice(0, 8).map((job) => (
                  <a key={job.id} href={job.href ?? "#"} className="dash-row-link" style={rowLink}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{job.title ?? "Work item"}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                        {(job.time ?? "—")} • {job.subtitle ?? "No details"}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <StatusPill text={job.status ?? "—"} />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Office action queue" subtitle="Jobs and admin work that need attention">
            <div className="dash-office-actions" style={stackGrid}>
              <ActionRow
                title="Unassigned transport jobs"
                value={stats?.unassignedTransportJobs ?? 0}
                href="/transport-jobs?view=active"
                tone={(stats?.unassignedTransportJobs ?? 0) > 0 ? "warn" : "neutral"}
              />
              <ActionRow
                title="Completed crane jobs not invoiced"
                value={stats?.completedCraneJobsNotInvoiced ?? 0}
                href="/jobs?view=active"
                tone={(stats?.completedCraneJobsNotInvoiced ?? 0) > 0 ? "warn" : "neutral"}
              />
              <ActionRow
                title="Completed transport jobs not invoiced"
                value={stats?.completedTransportJobsNotInvoiced ?? 0}
                href="/transport-jobs?view=active"
                tone={(stats?.completedTransportJobsNotInvoiced ?? 0) > 0 ? "warn" : "neutral"}
              />
              <ActionRow
                title="Timesheets not submitted"
                value={stats?.timesheetsNotSubmitted ?? 0}
                href="/timesheets"
                tone={(stats?.timesheetsNotSubmitted ?? 0) > 0 ? "bad" : "neutral"}
              />
            </div>
          </Panel>
        </div>

        <div className="dash-three-col" style={threeColStyle}>
          <Panel title="Quick search" subtitle="Find customers, jobs, quotes, equipment and more">
            <DashboardSearch />
            <div className="dash-search-shortcuts" style={shortcutGrid}>
              <a href="/search?type=customers" style={searchGhostBtn}>Customers</a>
              <a href="/search?type=jobs" style={searchGhostBtn}>Jobs</a>
              <a href="/search?type=transport" style={searchGhostBtn}>Transport</a>
              <a href="/search?type=quotes" style={searchGhostBtn}>Quotes</a>
              <a href="/search?type=equipment" style={searchGhostBtn}>Equipment</a>
              <a href="/search?type=audit" style={searchGhostBtn}>Audit</a>
            </div>
          </Panel>

          <Panel title="Sales / actions" subtitle="Follow-up and work-winning tools">
            <div style={stackGrid}>
              <a href="/sales-hub" style={cardStyle("good")}>Sales Hub</a>
              <a href="/sales-hub/campaigns" style={cardStyle("neutral")}>Campaigns</a>
              <a href="/sales-hub/leads" style={cardStyle("neutral")}>Leads</a>
              <a href="/quotes" style={cardStyle("neutral")}>Quotes to follow up</a>
            </div>
          </Panel>

          <Panel title="Planner / availability" subtitle="Quick access to planning boards">
            <div style={stackGrid}>
              <a href="/planner" style={cardStyle("neutral")}>Crane planner</a>
              <a href="/transport-planner" style={cardStyle("neutral")}>Transport planner</a>
              <a href="/weekly-planner" style={cardStyle("neutral")}>Weekly planner</a>
              <a href="/staff-planner" style={cardStyle("neutral")}>Staff planner</a>
            </div>
          </Panel>
        </div>

        <div className="dash-two-col" style={twoColStyle}>
          <Panel title="Finance snapshot" subtitle="Incoming job value, PO costs and unpaid invoice items">
            <div className="dash-grid" style={financeGrid}>
              <MiniStat label="Jobs incoming last week" value={moneyGBP(stats?.weeklyIncomingJobs?.lastWeek)} />
              <MiniStat label="Jobs incoming this week" value={moneyGBP(stats?.weeklyIncomingJobs?.thisWeek)} />
              <MiniStat label="Jobs incoming next week" value={moneyGBP(stats?.weeklyIncomingJobs?.nextWeek)} />
              <MiniStat label="PO costs last week" value={moneyGBP(stats?.weeklyPurchaseOrderCosts?.lastWeek)} />
              <MiniStat label="PO costs this week" value={moneyGBP(stats?.weeklyPurchaseOrderCosts?.thisWeek)} />
              <MiniStat label="PO costs next week" value={moneyGBP(stats?.weeklyPurchaseOrderCosts?.nextWeek)} />
            </div>
          </Panel>

          <Panel title="Outstanding invoice preview" subtitle="Top unpaid / part-paid records">
            {!stats?.overdueInvoices || stats.overdueInvoices.length === 0 ? (
              <EmptyState text="No overdue or unpaid invoices." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {stats.overdueInvoices.slice(0, 6).map((invoice) => (
                  <a key={invoice.id} href={invoice.href ?? "/invoices/outstanding"} className="dash-row-link" style={rowLink}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{invoice.title ?? "Invoice item"}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                        {invoice.subtitle ?? "No details"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontWeight: 900 }}>{moneyGBP(invoice.amount)}</div>
                      <div style={{ marginTop: 4 }}>
                        <StatusPill text={invoice.invoice_status ?? "—"} />
                      </div>
                    </div>
                  </a>
                ))}
                <a href="/invoices/outstanding" style={searchGhostBtn}>Open full outstanding list</a>
              </div>
            )}
          </Panel>
        </div>

        <div className="dash-two-col" style={twoColWideLeft}>
          <Panel title="Upcoming work" subtitle="Next jobs coming up">
            {!stats?.upcomingJobs || stats.upcomingJobs.length === 0 ? (
              <EmptyState text="No upcoming work." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {stats.upcomingJobs.slice(0, 6).map((job) => (
                  <a key={job.id} href={job.href ?? "#"} className="dash-row-link" style={rowLink}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{job.title ?? "Work item"}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                        {job.when ?? "—"} • {job.subtitle ?? "No details"}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <StatusPill text={job.status ?? "—"} />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Fleet snapshot" subtitle="Live totals across cranes and vehicles">
            <div style={stackGrid}>
              <MiniStat label="Cranes on hire now" value={stats?.cranesOnHireNow ?? 0} />
              <MiniStat label="Cranes reserved later" value={stats?.reservedCranesLater ?? 0} />
              <MiniStat label="Cranes available now" value={stats?.availableCranesNow ?? 0} />
              <MiniStat label="Vehicles available now" value={stats?.availableVehiclesNow ?? 0} />
              <MiniStat label="Utilisation" value={typeof stats?.utilisationPct === "number" ? `${stats.utilisationPct}%` : "—"} />
            </div>
          </Panel>
        </div>

        <details style={detailsStyle}>
          <summary style={summaryStyle}>Lower priority checks: compliance, service log and audit</summary>
          <div className="dash-two-col" style={twoColStyle}>
            <Panel title="Certification / LOLER" subtitle="Inspection and compliance snapshot">
              <div className="dash-grid" style={financeGrid}>
                <ActionCard title="Expired certification" value={stats?.certExpired ?? 0} help="Needs immediate action" href="/equipment" tone={(stats?.certExpired ?? 0) > 0 ? "bad" : "neutral"} />
                <ActionCard title="Expiring in 30 days" value={stats?.certExpiringSoon ?? 0} help="Review and schedule renewals" href="/equipment" tone={(stats?.certExpiringSoon ?? 0) > 0 ? "warn" : "neutral"} />
                <ActionCard title="Overdue LOLER" value={stats?.lolerOverdue ?? 0} help="Needs immediate action" href="/equipment" tone={(stats?.lolerOverdue ?? 0) > 0 ? "bad" : "neutral"} />
                <ActionCard title="LOLER due soon" value={stats?.lolerDueSoon ?? 0} help="Due within 30 days" href="/equipment" tone={(stats?.lolerDueSoon ?? 0) > 0 ? "warn" : "neutral"} />
                <ActionCard title="Marked maintenance" value={stats?.maintenanceEquipment ?? 0} help="Assets currently in maintenance" href="/equipment" tone={(stats?.maintenanceEquipment ?? 0) > 0 ? "warn" : "neutral"} />
                <ActionCard title="Service history coverage" value={`${stats?.equipmentWithServiceHistory ?? 0}/${stats?.totalEquipment ?? 0}`} help={`${stats?.equipmentWithoutServiceHistory ?? 0} assets without service history`} href="/equipment" tone="neutral" />
              </div>
            </Panel>

            <Panel title="Operator checks" subtitle="Qualification and compliance alerts">
              <div style={stackGrid}>
                <OperatorQualificationAlertSummary />
                <OperatorComplianceAlerts />
              </div>
            </Panel>
          </div>

          <div className="dash-two-col" style={twoColStyle}>
            <Panel title="Recent service log" subtitle="Latest service and inspection records">
              {!stats?.recentServiceLog || stats.recentServiceLog.length === 0 ? (
                <EmptyState text="No recent service log entries." />
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {stats.recentServiceLog.slice(0, 8).map((row) => {
                    const equipment = first(row.equipment);
                    return (
                      <div key={row.id} style={rowLink}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900 }}>
                            {equipment?.name ?? "Equipment"} • {row.entry_type ?? "Entry"}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                            {fmtDateTime(row.service_date)} • {row.engineer ?? "No engineer"}
                          </div>
                          {row.notes ? <div style={{ marginTop: 4, fontSize: 12, opacity: 0.68 }}>{row.notes}</div> : null}
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          <StatusPill text={row.entry_type ?? "—"} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Recent activity" subtitle="Latest recorded audit events">
              {!stats?.recentAudit || stats.recentAudit.length === 0 ? (
                <EmptyState text="No recent activity yet." />
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {stats.recentAudit.slice(0, 8).map((activity) => (
                    <div key={activity.id} className="dash-activity-row" style={activityRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>
                          {(activity.actor_username ?? "user")} • {activity.action ?? "action"} • {activity.entity_type ?? "entity"}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                          {fmtDateTime(activity.created_at)}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <StatusPill text={activity.action ?? "—"} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </details>
      </div>
    </ClientShell>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 1000, fontSize: 18 }}>{title}</div>
      {subtitle ? <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>{subtitle}</div> : null}
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ fontSize: 14, opacity: 0.58 }}>{text}</div>;
}

function Alert({ tone, href, linkText, children }: { tone: "warn" | "bad"; href: string; linkText: string; children: ReactNode }) {
  return (
    <div style={alertBox(tone)}>
      <div>{children}</div>
      <a href={href} style={warningLinkStyle}>{linkText}</a>
    </div>
  );
}

function ActionCard({ title, value, help, href, tone }: { title: string; value: ReactNode; help: string; href: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <a href={href} style={actionCardStyle(tone)}>
      <div style={smallTitle}>{title}</div>
      <div style={bigValue}>{value}</div>
      <div style={smallHelp}>{help}</div>
    </a>
  );
}

function ActionRow({ title, value, href, tone }: { title: string; value: ReactNode; href: string; tone: "warn" | "bad" | "neutral" }) {
  return (
    <a href={href} style={actionCardStyle(tone)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <div style={{ fontWeight: 1000, fontSize: 24 }}>{value}</div>
      </div>
    </a>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={miniStatStyle}>
      <div style={smallTitle}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 1000, lineHeight: 1.1, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

const shellStyle: CSSProperties = {
  width: "min(1400px, 96vw)",
  margin: "0 auto",
  background: "rgba(255,255,255,0.18)",
  border: "1px solid rgba(255,255,255,0.4)",
  borderRadius: 24,
  padding: 18,
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 1000,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  opacity: 0.62,
  marginBottom: 4,
};

const panelStyle: CSSProperties = {
  background: "rgba(255,255,255,0.28)",
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 14,
  padding: 16,
  minWidth: 0,
};

const topActionGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const twoColStyle: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const twoColWideLeft: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "1.25fr 0.85fr",
  gap: 14,
};

const threeColStyle: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "1.3fr 0.85fr 0.85fr",
  gap: 14,
};

const financeGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const stackGrid: CSSProperties = {
  display: "grid",
  gap: 10,
};

const shortcutGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
  gap: 10,
};

const rowLink: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  textDecoration: "none",
  color: "#111",
  padding: "12px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  minWidth: 0,
};

const activityRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  padding: "12px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  minWidth: 0,
};

const warningLinkStyle: CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  color: "#111",
  fontWeight: 900,
  padding: "10px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "nowrap",
};

const searchGhostBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.52)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const smallTitle: CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 900,
};

const bigValue: CSSProperties = {
  marginTop: 8,
  fontSize: 28,
  fontWeight: 1000,
  lineHeight: 1.1,
  wordBreak: "break-word",
};

const smallHelp: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  opacity: 0.8,
};

const miniStatStyle: CSSProperties = {
  padding: "12px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  minWidth: 0,
};

const detailsStyle: CSSProperties = {
  marginTop: 14,
  background: "rgba(255,255,255,0.14)",
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 14,
  padding: 14,
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontWeight: 1000,
  fontSize: 16,
};

function cardStyle(tone: "good" | "warn" | "bad" | "neutral"): CSSProperties {
  return {
    display: "block",
    padding: 14,
    borderRadius: 12,
    textDecoration: "none",
    color: "#111",
    fontWeight: 900,
    textAlign: "center",
    minWidth: 0,
    ...toneStyle(tone),
  };
}

function actionCardStyle(tone: "good" | "warn" | "bad" | "neutral"): CSSProperties {
  return {
    display: "block",
    padding: 16,
    borderRadius: 14,
    textDecoration: "none",
    color: "#111",
    minWidth: 0,
    ...toneStyle(tone),
  };
}

function toneStyle(tone: "good" | "warn" | "bad" | "neutral"): CSSProperties {
  if (tone === "good") {
    return { background: "rgba(0,180,120,0.18)", border: "1px solid rgba(0,180,120,0.28)" };
  }
  if (tone === "warn") {
    return { background: "rgba(255,170,0,0.14)", border: "1px solid rgba(255,170,0,0.24)" };
  }
  if (tone === "bad") {
    return { background: "rgba(255,0,0,0.12)", border: "1px solid rgba(255,0,0,0.22)" };
  }
  return { background: "rgba(255,255,255,0.35)", border: "1px solid rgba(0,0,0,0.12)" };
}

function alertBox(tone: "warn" | "bad"): CSSProperties {
  return {
    marginTop: 14,
    padding: "12px 14px",
    borderRadius: 12,
    background: tone === "bad" ? "rgba(255,0,0,0.12)" : "rgba(255,170,0,0.14)",
    border: tone === "bad" ? "1px solid rgba(255,0,0,0.22)" : "1px solid rgba(255,170,0,0.24)",
    fontWeight: tone === "bad" ? 900 : 800,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  };
}
