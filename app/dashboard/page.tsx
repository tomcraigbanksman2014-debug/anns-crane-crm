"use client";

import { useEffect, useMemo, useState } from "react";
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

function moneyGBP(n: number) {
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

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default function DashboardPage() {
  const supabase = createSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "staff" | "">("");
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
      setRole(isMaster ? "admin" : ((user.user_metadata?.role as any) ?? "staff"));

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

  const tiles = useMemo(
    () => [
      { label: "Global Search", href: "/search", tone: "neutral" as const },
      { label: "Quotes", href: "/quotes", tone: "neutral" as const },
      { label: "Customers", href: "/customers", tone: "good" as const },
      { label: "Jobs", href: "/jobs", tone: "neutral" as const },
      { label: "Transport Jobs", href: "/transport-jobs", tone: "neutral" as const },
      { label: "Equipment", href: "/equipment", tone: "good" as const },
      { label: "Operators", href: "/operators", tone: "neutral" as const },
      { label: "Settings", href: "/settings", tone: "neutral" as const },
    ],
    []
  );

  const adminTiles =
    role === "admin"
      ? [
          { label: "Admin → Staff Users", href: "/admin/users", tone: "bad" as const },
          { label: "Admin → Audit Log", href: "/admin/audit", tone: "bad" as const },
        ]
      : [];

  if (loading) {
    return (
      <ClientShell>
        <div className="dash-shell" style={{ width: "min(1400px, 96vw)", margin: "0 auto" }}>
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

          .dash-header {
            align-items: flex-start !important;
          }

          .dash-signout {
            width: 100%;
          }

          .dash-service-grid,
          .dash-three-col,
          .dash-two-col,
          .dash-search-shortcuts,
          .dash-operator-alert-grid,
          .dash-office-actions {
            grid-template-columns: 1fr !important;
          }

          .dash-row-link,
          .dash-activity-row {
            align-items: flex-start !important;
          }
        }
      `}</style>

      <div
        className="dash-shell"
        style={{
          width: "min(1400px, 96vw)",
          margin: "0 auto",
          background: "rgba(255,255,255,0.18)",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 24,
          padding: 18,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
        }}
      >
        <div
          className="dash-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 34 }}>Dashboard</h1>
            <div style={{ marginTop: 6, opacity: 0.75 }}>
              Welcome back, <strong>{username || "user"}</strong>
              {role ? ` • ${role}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="dash-signout" onClick={signOut} style={searchGhostBtn}>
              Sign out
            </button>
          </div>
        </div>

        {typeof passwordDaysLeft === "number" && passwordDaysLeft <= 30 ? (
          <div style={alertBox(passwordDaysLeft <= 7 ? "bad" : "warn", true)}>
            <div>
              Your password expires in <strong>{passwordDaysLeft}</strong> day{passwordDaysLeft === 1 ? "" : "s"}.
            </div>
            <a href="/change-password" style={warningLinkStyle}>
              Change password
            </a>
          </div>
        ) : null}

        {(stats?.certExpired ?? 0) > 0 ? (
          <div style={alertBox("bad", true)}>
            <div>
              ⚠ {stats?.certExpired} asset item{stats?.certExpired === 1 ? "" : "s"} have expired inspection / certification.
            </div>
            <a href="/equipment" style={warningLinkStyle}>
              Open fleet compliance
            </a>
          </div>
        ) : null}

        {(stats?.certExpiringSoon ?? 0) > 0 ? (
          <div style={alertBox("warn", true)}>
            <div>
              ⚠ {stats?.certExpiringSoon} asset item{stats?.certExpiringSoon === 1 ? "" : "s"} have inspection / certification expiring within 30 days.
            </div>
            <a href="/equipment" style={warningLinkStyle}>
              Review expiries
            </a>
          </div>
        ) : null}

        {(stats?.lolerOverdue ?? 0) > 0 ? (
          <div style={alertBox("bad", true)}>
            <div>
              ⚠ {stats?.lolerOverdue} asset item{stats?.lolerOverdue === 1 ? "" : "s"} have overdue LOLER.
            </div>
            <a href="/equipment" style={warningLinkStyle}>
              Review LOLER
            </a>
          </div>
        ) : null}

        {(stats?.lolerDueSoon ?? 0) > 0 ? (
          <div style={alertBox("warn", true)}>
            <div>
              ⚠ {stats?.lolerDueSoon} asset item{stats?.lolerDueSoon === 1 ? "" : "s"} have LOLER due within 30 days.
            </div>
            <a href="/equipment" style={warningLinkStyle}>
              Review LOLER
            </a>
          </div>
        ) : null}

        {(stats?.maintenanceEquipment ?? 0) > 0 ? (
          <div style={alertBox("warn", false)}>
            <div>
              ℹ {stats?.maintenanceEquipment} asset item{stats?.maintenanceEquipment === 1 ? "" : "s"} currently marked as maintenance.
            </div>
          </div>
        ) : null}

        <div
          className="dash-three-col"
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr 1fr",
            gap: 14,
          }}
        >
          <Panel title="Quick search" subtitle="Search customers, jobs, quotes, equipment and more">
            <DashboardSearch />
            <div
              className="dash-search-shortcuts"
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: 10,
              }}
            >
              <a href="/search?type=customers" style={searchGhostBtn}>Customers</a>
              <a href="/search?type=jobs" style={searchGhostBtn}>Jobs</a>
              <a href="/search?type=transport" style={searchGhostBtn}>Transport</a>
              <a href="/search?type=quotes" style={searchGhostBtn}>Quotes</a>
              <a href="/search?type=equipment" style={searchGhostBtn}>Equipment</a>
              <a href="/search?type=audit" style={searchGhostBtn}>Audit</a>
            </div>
          </Panel>

          <Panel title="Shortcuts" subtitle="Common areas">
            <div style={{ display: "grid", gap: 10 }}>
              {[...tiles, ...adminTiles].map((tile) => (
                <a key={tile.href} href={tile.href} style={cardStyle(tile.tone)}>
                  {tile.label}
                </a>
              ))}
            </div>
          </Panel>

          <Panel title="Operator overview" subtitle="Quick access to operator checks">
            <div
              className="dash-operator-alert-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 12,
              }}
            >
              <OperatorQualificationAlertSummary />
              <OperatorComplianceAlerts />
            </div>
          </Panel>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <StatCard
            title="Jobs today"
            value={stats?.jobsToday ?? "-"}
            subtext="Crane and transport work scheduled today"
            badge={<StatusPill text="Today" />}
          />
          <StatCard
            title="Crane jobs live today"
            value={stats?.activeCraneJobs ?? "-"}
            subtext="Crane work active today"
            badge={<StatusPill text="Live" />}
          />
          <StatCard
            title="Fleet available"
            value={`${stats?.availableCranesNow ?? 0} cranes • ${stats?.availableVehiclesNow ?? 0} trucks`}
            subtext={`${stats?.totalCranes ?? 0} cranes total • ${stats?.totalVehicles ?? 0} trucks total`}
            badge={<StatusPill text="Fleet" />}
          />
          <StatCard
            title="Invoices outstanding"
            value={typeof stats?.outstandingInvoices === "number" ? moneyGBP(stats.outstandingInvoices) : "-"}
            subtext="Crane and transport jobs with unpaid or part-paid invoices"
            badge={<StatusPill text="£" />}
            href="/jobs?view=active&invoice=outstanding"
          />
          <StatCard
            title="Utilisation"
            value={typeof stats?.utilisationPct === "number" ? `${stats.utilisationPct}%` : "-"}
            subtext="Crane fleet utilisation"
            badge={<StatusPill text="Use" />}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <Panel title="Weekly jobs and costs" subtitle="Incoming from crane jobs and purchase order costs by week">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div style={certCard("neutral")}>
                <div style={smallTitle}>Jobs incoming last week</div>
                <div style={bigValue}>{moneyGBP(stats?.weeklyIncomingJobs?.lastWeek ?? 0)}</div>
                <div style={smallHelp}>Crane jobs overlapping last week</div>
              </div>
              <div style={certCard("neutral")}>
                <div style={smallTitle}>Jobs incoming this week</div>
                <div style={bigValue}>{moneyGBP(stats?.weeklyIncomingJobs?.thisWeek ?? 0)}</div>
                <div style={smallHelp}>Crane jobs overlapping this week</div>
              </div>
              <div style={certCard("neutral")}>
                <div style={smallTitle}>Jobs incoming next week</div>
                <div style={bigValue}>{moneyGBP(stats?.weeklyIncomingJobs?.nextWeek ?? 0)}</div>
                <div style={smallHelp}>Crane jobs overlapping next week</div>
              </div>
              <div style={certCard("warn")}>
                <div style={smallTitle}>PO costs last week</div>
                <div style={bigValue}>{moneyGBP(stats?.weeklyPurchaseOrderCosts?.lastWeek ?? 0)}</div>
                <div style={smallHelp}>Purchase orders due / ordered in last week</div>
              </div>
              <div style={certCard("warn")}>
                <div style={smallTitle}>PO costs this week</div>
                <div style={bigValue}>{moneyGBP(stats?.weeklyPurchaseOrderCosts?.thisWeek ?? 0)}</div>
                <div style={smallHelp}>Purchase orders due / ordered this week</div>
              </div>
              <div style={certCard("warn")}>
                <div style={smallTitle}>PO costs next week</div>
                <div style={bigValue}>{moneyGBP(stats?.weeklyPurchaseOrderCosts?.nextWeek ?? 0)}</div>
                <div style={smallHelp}>Purchase orders due / ordered next week</div>
              </div>
            </div>
          </Panel>
        </div>

        <div style={{ marginTop: 14 }}>
          <Panel title="Office action queue" subtitle="Outstanding actions for the office team to clear">
            <div
              className="dash-office-actions"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <a href="/transport-jobs?view=active" style={certCard((stats?.unassignedTransportJobs ?? 0) > 0 ? "warn" : "neutral")}>
                <div style={smallTitle}>Unassigned transport jobs</div>
                <div style={bigValue}>{stats?.unassignedTransportJobs ?? 0}</div>
                <div style={smallHelp}>Transport jobs missing a vehicle or driver</div>
              </a>

              <a href="/jobs?view=active" style={certCard((stats?.completedCraneJobsNotInvoiced ?? 0) > 0 ? "warn" : "neutral")}>
                <div style={smallTitle}>Completed crane jobs not invoiced</div>
                <div style={bigValue}>{stats?.completedCraneJobsNotInvoiced ?? 0}</div>
                <div style={smallHelp}>Completed jobs still marked not invoiced</div>
              </a>

              <a href="/transport-jobs?view=active" style={certCard((stats?.completedTransportJobsNotInvoiced ?? 0) > 0 ? "warn" : "neutral")}>
                <div style={smallTitle}>Completed transport jobs not invoiced</div>
                <div style={bigValue}>{stats?.completedTransportJobsNotInvoiced ?? 0}</div>
                <div style={smallHelp}>Completed transport work awaiting invoicing</div>
              </a>

              <a href="/timesheets" style={certCard((stats?.timesheetsNotSubmitted ?? 0) > 0 ? "bad" : "neutral")}>
                <div style={smallTitle}>Timesheets not submitted</div>
                <div style={bigValue}>{stats?.timesheetsNotSubmitted ?? 0}</div>
                <div style={smallHelp}>Completed operator jobs missing office submission</div>
              </a>
            </div>
          </Panel>
        </div>

        <div style={{ marginTop: 14 }}>
          <Panel title="Certification" subtitle="Monitor expired and expiring inspections / certification">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <a href="/equipment" style={certCard("bad")}>
                <div style={smallTitle}>Expired</div>
                <div style={bigValue}>{stats?.certExpired ?? 0}</div>
                <div style={smallHelp}>Cranes and equipment needing immediate action</div>
              </a>

              <a href="/equipment" style={certCard("warn")}>
                <div style={smallTitle}>Expiring in 30 days</div>
                <div style={bigValue}>{stats?.certExpiringSoon ?? 0}</div>
                <div style={smallHelp}>Review and schedule renewals</div>
              </a>

              <a href="/equipment" style={certCard("neutral")}>
                <div style={smallTitle}>Open asset register</div>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 1000 }}>View all assets</div>
                <div style={smallHelp}>See full compliance status list</div>
              </a>
            </div>
          </Panel>
        </div>

        <div style={{ marginTop: 14 }}>
          <Panel title="LOLER" subtitle="Track overdue and upcoming LOLER dates">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <a href="/equipment" style={certCard("bad")}>
                <div style={smallTitle}>Overdue LOLER</div>
                <div style={bigValue}>{stats?.lolerOverdue ?? 0}</div>
                <div style={smallHelp}>Cranes and equipment needing immediate attention</div>
              </a>

              <a href="/equipment" style={certCard("warn")}>
                <div style={smallTitle}>Due in 30 days</div>
                <div style={bigValue}>{stats?.lolerDueSoon ?? 0}</div>
                <div style={smallHelp}>Schedule inspections ahead of time</div>
              </a>
            </div>
          </Panel>
        </div>

        <div
          className="dash-service-grid"
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <Panel title="Service coverage" subtitle="How much of the equipment register has recent service history">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div style={certCard("neutral")}>
                <div style={smallTitle}>With service history</div>
                <div style={bigValue}>{stats?.equipmentWithServiceHistory ?? 0}</div>
                <div style={smallHelp}>Equipment with service log records</div>
              </div>

              <div style={certCard("neutral")}>
                <div style={smallTitle}>Without service history</div>
                <div style={bigValue}>{stats?.equipmentWithoutServiceHistory ?? 0}</div>
                <div style={smallHelp}>Equipment with no recent service records</div>
              </div>
            </div>
          </Panel>

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
                        {row.notes ? (
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.68 }}>
                            {row.notes}
                          </div>
                        ) : null}
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
        </div>

        <div
          className="dash-two-col"
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr",
            gap: 14,
          }}
        >
          <Panel title="Today’s work" subtitle="Crane and transport work due today">
            {!stats?.todayJobs || stats.todayJobs.length === 0 ? (
              <EmptyState text="No work scheduled for today." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {stats.todayJobs.slice(0, 8).map((b) => (
                  <a key={b.id} href={b.href ?? "#"} style={rowLink}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{b.title ?? "Work item"}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                        {(b.time ?? "—")} • {b.subtitle ?? "No details"}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <StatusPill text={b.status ?? "—"} />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Fleet snapshot" subtitle="Live totals across cranes and vehicles">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <MiniStat label="Cranes on hire now" value={stats?.cranesOnHireNow ?? 0} />
              <MiniStat label="Cranes reserved later" value={stats?.reservedCranesLater ?? 0} />
              <MiniStat label="Cranes available now" value={stats?.availableCranesNow ?? 0} />
              <MiniStat label="Total cranes" value={stats?.totalCranes ?? 0} />
              <MiniStat label="Vehicles available now" value={stats?.availableVehiclesNow ?? 0} />
              <MiniStat label="Total vehicles" value={stats?.totalVehicles ?? 0} />
            </div>

            <div style={{ marginTop: 14 }}>
              {!stats?.overdueInvoices || stats.overdueInvoices.length === 0 ? (
                <EmptyState text="No overdue or unpaid invoices." />
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {stats.overdueInvoices.slice(0, 6).map((b) => (
                    <a key={b.id} href={b.href ?? "#"} className="dash-row-link" style={rowLink}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{b.title ?? "Invoice item"}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                          {b.subtitle ?? "No details"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontWeight: 900 }}>
                          {typeof b.amount === "number" ? moneyGBP(b.amount) : "—"}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <StatusPill text={b.invoice_status ?? "—"} />
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>

        <div
          className="dash-two-col"
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 14,
          }}
        >
          <Panel title="Upcoming work" subtitle="Next jobs coming up">
            {!stats?.upcomingJobs || stats.upcomingJobs.length === 0 ? (
              <EmptyState text="No upcoming work." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {stats.upcomingJobs.slice(0, 6).map((b) => (
                  <a key={b.id} href={b.href ?? "#"} className="dash-row-link" style={rowLink}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{b.title ?? "Work item"}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                        {b.when ?? "—"} • {b.subtitle ?? "No details"}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <StatusPill text={b.status ?? "—"} />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Recent activity" subtitle="Latest recorded audit events">
            {!stats?.recentAudit || stats.recentAudit.length === 0 ? (
              <EmptyState text="No recent activity yet." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {stats.recentAudit.slice(0, 8).map((a) => (
                  <div key={a.id} className="dash-activity-row" style={activityRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>
                        {(a.actor_username ?? "user")} • {a.action ?? "action"} • {a.entity_type ?? "entity"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                        {fmtDateTime(a.created_at)}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <StatusPill text={a.action ?? "—"} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </ClientShell>
  );
}

function StatCard({
  title,
  value,
  subtext,
  badge,
  href,
}: {
  title: string;
  value: any;
  subtext?: string;
  badge?: React.ReactNode;
  href?: string;
}) {
  const sharedStyle: React.CSSProperties = {
    padding: 14,
    borderRadius: 14,
    background: "rgba(255,255,255,0.35)",
    border: "1px solid rgba(0,0,0,0.12)",
    minWidth: 0,
    textDecoration: "none",
    color: "#111",
    display: "block",
  };

  const content = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>{title}</div>
        <div style={{ flexShrink: 0 }}>{badge}</div>
      </div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 1000, lineHeight: 1.1, wordBreak: "break-word" }}>
        {value}
      </div>
      {subtext ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>{subtext}</div> : null}
    </>
  );

  if (href) {
    return (
      <a href={href} style={sharedStyle}>
        {content}
      </a>
    );
  }

  return <div style={sharedStyle}>{content}</div>;
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.28)",
        border: "1px solid rgba(0,0,0,0.10)",
        borderRadius: 14,
        padding: 16,
        minWidth: 0,
      }}
    >
      <div style={{ fontWeight: 1000, fontSize: 18 }}>{title}</div>
      {subtitle ? <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>{subtitle}</div> : null}
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ fontSize: 14, opacity: 0.58 }}>{text}</div>;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: "12px 12px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.42)",
        border: "1px solid rgba(0,0,0,0.08)",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 24, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

const rowLink: React.CSSProperties = {
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

const activityRow: React.CSSProperties = {
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

const warningLinkStyle: React.CSSProperties = {
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

const searchGhostBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.52)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const smallTitle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 900,
};

const bigValue: React.CSSProperties = {
  marginTop: 8,
  fontSize: 30,
  fontWeight: 1000,
};

const smallHelp: React.CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  opacity: 0.8,
};

function cardStyle(tone: "good" | "warn" | "bad" | "neutral"): React.CSSProperties {
  const tones: Record<string, React.CSSProperties> = {
    good: { background: "rgba(0,180,120,0.18)", border: "1px solid rgba(0,180,120,0.28)" },
    warn: { background: "rgba(255,140,0,0.18)", border: "1px solid rgba(255,140,0,0.28)" },
    bad: { background: "rgba(255,0,0,0.14)", border: "1px solid rgba(255,0,0,0.22)" },
    neutral: { background: "rgba(255,255,255,0.35)", border: "1px solid rgba(0,0,0,0.12)" },
  };

  return {
    display: "block",
    padding: 16,
    borderRadius: 12,
    textDecoration: "none",
    color: "#111",
    fontWeight: 900,
    textAlign: "center",
    minWidth: 0,
    ...tones[tone],
  };
}

function certCard(tone: "warn" | "bad" | "neutral"): React.CSSProperties {
  const tones: Record<string, React.CSSProperties> = {
    warn: {
      background: "rgba(255,170,0,0.14)",
      border: "1px solid rgba(255,170,0,0.24)",
    },
    bad: {
      background: "rgba(255,0,0,0.12)",
      border: "1px solid rgba(255,0,0,0.22)",
    },
    neutral: {
      background: "rgba(255,255,255,0.35)",
      border: "1px solid rgba(0,0,0,0.12)",
    },
  };

  return {
    display: "block",
    padding: 16,
    borderRadius: 14,
    textDecoration: "none",
    color: "#111",
    minWidth: 0,
    ...tones[tone],
  };
}

function alertBox(
  tone: "warn" | "bad",
  withLink: boolean
): React.CSSProperties {
  return {
    marginTop: 14,
    padding: "12px 14px",
    borderRadius: 12,
    background:
      tone === "bad" ? "rgba(255,0,0,0.12)" : "rgba(255,170,0,0.14)",
    border:
      tone === "bad"
        ? "1px solid rgba(255,0,0,0.22)"
        : "1px solid rgba(255,170,0,0.24)",
    fontWeight: tone === "bad" ? 900 : 800,
    display: withLink ? "flex" : "block",
    justifyContent: withLink ? "space-between" : undefined,
    gap: withLink ? 12 : undefined,
    alignItems: withLink ? "center" : undefined,
    flexWrap: withLink ? "wrap" : undefined,
  };
}
