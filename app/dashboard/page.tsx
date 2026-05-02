"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import ClientShell from "../ClientShell";
import DashboardSearch from "../components/DashboardSearch";
import StatusPill from "../components/StatusPill";
import OperatorQualificationAlertSummary from "../components/OperatorQualificationAlertSummary";
import OperatorComplianceAlerts from "../components/OperatorComplianceAlerts";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

const INVOICE_STATUSES = ["Not Invoiced", "Invoiced", "Part Paid", "Paid"];

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
  unassignedCraneJobs?: number;
  unassignedTransportJobs?: number;
  completedCraneJobsNotInvoiced?: number;
  completedTransportJobsNotInvoiced?: number;
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
    recordType?: "crane" | "transport";
    recordId?: string;
    invoice_status?: string;
    status?: string;
    amount?: number;
    amountPaid?: number;
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
      const rawRole = String((user.user_metadata?.role as any) ?? "staff").toLowerCase();
      setRole(isMaster ? "admin" : rawRole === "admin" ? "admin" : "staff");

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

  const financeRiskCount =
    (stats?.completedCraneJobsNotInvoiced ?? 0) +
    (stats?.completedTransportJobsNotInvoiced ?? 0);

  const urgentCount = (stats?.unassignedCraneJobs ?? 0) + (stats?.unassignedTransportJobs ?? 0) + financeRiskCount;

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
          .dash-office-actions,
          .dash-planner-buttons {
            grid-template-columns: 1fr !important;
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
          <Panel title="Global search" subtitle="Search customers, jobs, transport, bookings, quotes, equipment and more">
            <DashboardSearch />
          </Panel>
        </section>

        <section style={{ marginTop: 14 }}>
          <Panel title="Today / urgent operations" subtitle="The main things the office should clear first">
            <div className="dash-grid" style={topActionGrid}>
              <ActionCard
                title="Today’s work"
                value={stats?.jobsToday ?? 0}
                help={`${stats?.activeCraneJobs ?? 0} crane jobs • ${stats?.activeTransportToday ?? 0} transport jobs`}
                href="/dashboard/today"
                tone="neutral"
              />
              <ActionCard
                title="Urgent actions"
                value={urgentCount}
                help="Unassigned jobs and completed work not invoiced"
                href="/dashboard/actions"
                tone={urgentCount > 0 ? "warn" : "good"}
              />
              <ActionCard
                title="Outstanding invoices"
                value={moneyGBP(stats?.outstandingInvoices)}
                help="Combined crane and transport outstanding list"
                href="/invoices/outstanding"
                tone={(stats?.outstandingInvoices ?? 0) > 0 ? "warn" : "good"}
              />
              <PlannerAvailabilityCard
                cranes={stats?.availableCranesNow ?? 0}
                trucks={stats?.availableVehiclesNow ?? 0}
                cranesOnHire={stats?.cranesOnHireNow ?? 0}
                cranesReservedLater={stats?.reservedCranesLater ?? 0}
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
                <a href="/dashboard/today" style={searchGhostBtn}>Open full today list</a>
              </div>
            )}
          </Panel>

          <Panel title="Office action queue" subtitle="Unassigned flags only include work from today onwards; completed not invoiced stays historic">
            <div className="dash-office-actions" style={stackGrid}>
              <ActionRow
                title="Unassigned crane jobs"
                value={stats?.unassignedCraneJobs ?? 0}
                href="/dashboard/actions?focus=unassigned-crane"
                tone={(stats?.unassignedCraneJobs ?? 0) > 0 ? "warn" : "neutral"}
              />
              <ActionRow
                title="Unassigned transport jobs"
                value={stats?.unassignedTransportJobs ?? 0}
                href="/dashboard/actions?focus=unassigned-transport"
                tone={(stats?.unassignedTransportJobs ?? 0) > 0 ? "warn" : "neutral"}
              />
              <ActionRow
                title="Completed crane jobs not invoiced"
                value={stats?.completedCraneJobsNotInvoiced ?? 0}
                href="/dashboard/actions?focus=completed-crane-not-invoiced"
                tone={(stats?.completedCraneJobsNotInvoiced ?? 0) > 0 ? "warn" : "neutral"}
              />
              <ActionRow
                title="Completed transport jobs not invoiced"
                value={stats?.completedTransportJobsNotInvoiced ?? 0}
                href="/dashboard/actions?focus=completed-transport-not-invoiced"
                tone={(stats?.completedTransportJobsNotInvoiced ?? 0) > 0 ? "warn" : "neutral"}
              />
            </div>
          </Panel>
        </div>

        <section style={{ marginTop: 14 }}>
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
        </section>

        <div className="dash-two-col" style={twoColWideLeft}>
          <Panel title="Outstanding invoice preview" subtitle="Top unpaid / part-paid records">
            {!stats?.overdueInvoices || stats.overdueInvoices.length === 0 ? (
              <EmptyState text="No overdue or unpaid invoices." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {stats.overdueInvoices.slice(0, 6).map((invoice) => (
                  <div key={invoice.id} className="dash-row-link" style={invoicePreviewRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{invoice.title ?? "Invoice item"}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                        {invoice.subtitle ?? "No details"}
                      </div>
                      {invoice.href ? (
                        <a href={invoice.href} style={smallInlineLink}>Open job</a>
                      ) : null}
                    </div>
                    <div style={{ minWidth: 220 }}>
                      <div style={{ fontWeight: 900, textAlign: "right" }}>{moneyGBP(invoice.amount)}</div>
                      <DashboardInvoiceQuickAction invoice={invoice} />
                    </div>
                  </div>
                ))}
                <a href="/invoices/outstanding" style={searchGhostBtn}>Open full outstanding list</a>
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

            <Panel title="Asset register summary" subtitle="Fleet and equipment coverage">
              <div style={stackGrid}>
                <MiniStat label="Total cranes" value={stats?.totalCranes ?? 0} />
                <MiniStat label="Total vehicles" value={stats?.totalVehicles ?? 0} />
                <MiniStat label="Total equipment" value={stats?.totalEquipment ?? 0} />
              </div>
            </Panel>
          </div>
        </details>
      </div>
    </ClientShell>
  );
}


function DashboardInvoiceQuickAction({ invoice }: { invoice: any }) {
  const [invoiceStatusValue, setInvoiceStatusValue] = useState(invoice.invoice_status ?? "Not Invoiced");
  const [amountPaidValue, setAmountPaidValue] = useState(String(invoice.amountPaid ?? 0));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!invoice.recordType || !invoice.recordId) {
      setMessage("Open the job to update this one.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/dashboard/action-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_invoice",
          record_type: invoice.recordType,
          record_id: invoice.recordId,
          invoice_status: invoiceStatusValue,
          amount_paid: amountPaidValue,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.error) {
        throw new Error(json?.error || "Could not update invoice status.");
      }

      setMessage("Saved");
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error: any) {
      setMessage(error?.message || "Could not update invoice status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={quickInvoiceForm}>
      <label style={compactLabel}>
        Invoice
        <select
          value={invoiceStatusValue}
          onChange={(event) => setInvoiceStatusValue(event.target.value)}
          style={compactSelect}
        >
          {INVOICE_STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </label>
      {invoiceStatusValue === "Part Paid" ? (
        <label style={compactLabel}>
          Paid
          <input
            type="number"
            min="0"
            step="0.01"
            value={amountPaidValue}
            onChange={(event) => setAmountPaidValue(event.target.value)}
            style={compactInput}
          />
        </label>
      ) : null}
      <button type="submit" disabled={saving} style={quickSaveBtn}>
        {saving ? "Saving..." : "Save"}
      </button>
      {message ? <div style={quickMessage}>{message}</div> : null}
    </form>
  );
}

function PlannerAvailabilityCard({
  cranes,
  trucks,
  cranesOnHire,
  cranesReservedLater,
}: {
  cranes: number;
  trucks: number;
  cranesOnHire: number;
  cranesReservedLater: number;
}) {
  return (
    <div style={actionCardStyle("neutral")}>
      <div style={smallTitle}>Planner / availability</div>
      <div style={{ ...bigValue, fontSize: 24 }}>{cranes} cranes • {trucks} trucks</div>
      <div style={smallHelp}>{cranesOnHire} cranes on hire now • {cranesReservedLater} reserved later</div>
      <div className="dash-planner-buttons" style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <a href="/planner" style={miniButtonStyle}>Crane availability</a>
        <a href="/transport-planner" style={miniButtonStyle}>Truck availability</a>
      </div>
    </div>
  );
}

function ActionCard({
  title,
  value,
  help,
  href,
  tone,
}: {
  title: string;
  value: ReactNode;
  help?: string;
  href: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  return (
    <a href={href} style={actionCardStyle(tone)}>
      <div style={smallTitle}>{title}</div>
      <div style={bigValue}>{value}</div>
      {help ? <div style={smallHelp}>{help}</div> : null}
    </a>
  );
}

function ActionRow({
  title,
  value,
  href,
  tone,
}: {
  title: string;
  value: number;
  href: string;
  tone: "warn" | "bad" | "neutral";
}) {
  return (
    <a href={href} style={actionRowStyle(tone)}>
      <span>{title}</span>
      <strong style={{ fontSize: 28 }}>{value}</strong>
    </a>
  );
}

function Alert({
  tone,
  href,
  linkText,
  children,
}: {
  tone: "warn" | "bad";
  href: string;
  linkText: string;
  children: ReactNode;
}) {
  return (
    <div style={alertBox(tone)}>
      <div>{children}</div>
      <a href={href} style={warningLinkStyle}>{linkText}</a>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
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

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={miniStatStyle}>
      <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 24, fontWeight: 1000 }}>{value}</div>
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
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: 12,
  fontWeight: 1000,
  opacity: 0.65,
  marginBottom: 6,
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
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
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
  gridTemplateColumns: "1.2fr 1fr",
  gap: 14,
};

const shortcutGrid: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
};

const stackGrid: CSSProperties = {
  display: "grid",
  gap: 10,
};

const financeGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
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


const invoicePreviewRow: CSSProperties = {
  ...rowLink,
  alignItems: "flex-start",
};

const quickInvoiceForm: CSSProperties = {
  marginTop: 6,
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 7,
  alignItems: "end",
};

const compactLabel: CSSProperties = {
  display: "grid",
  gap: 3,
  fontSize: 11,
  fontWeight: 900,
  color: "#374151",
};

const compactSelect: CSSProperties = {
  minHeight: 32,
  borderRadius: 9,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  padding: "5px 7px",
  fontWeight: 800,
};

const compactInput: CSSProperties = {
  minHeight: 30,
  borderRadius: 9,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  padding: "5px 7px",
  fontWeight: 800,
};

const quickSaveBtn: CSSProperties = {
  border: 0,
  borderRadius: 9,
  padding: "8px 10px",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const quickMessage: CSSProperties = {
  gridColumn: "1 / -1",
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
};

const smallInlineLink: CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  fontSize: 12,
  fontWeight: 900,
  color: "#0f172a",
  textDecoration: "underline",
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

const miniButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "9px 10px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.64)",
  color: "#111",
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.10)",
  textAlign: "center",
};

const smallTitle: CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 900,
};

const bigValue: CSSProperties = {
  marginTop: 8,
  fontSize: 30,
  fontWeight: 1000,
  lineHeight: 1.05,
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
  background: "rgba(255,255,255,0.24)",
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 14,
  padding: 14,
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontWeight: 1000,
  fontSize: 16,
};

function actionCardStyle(tone: "good" | "warn" | "bad" | "neutral"): CSSProperties {
  const tones: Record<string, CSSProperties> = {
    good: { background: "rgba(0,180,120,0.18)", border: "1px solid rgba(0,180,120,0.28)" },
    warn: { background: "rgba(255,170,0,0.16)", border: "1px solid rgba(255,170,0,0.28)" },
    bad: { background: "rgba(255,0,0,0.14)", border: "1px solid rgba(255,0,0,0.22)" },
    neutral: { background: "rgba(255,255,255,0.35)", border: "1px solid rgba(0,0,0,0.12)" },
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

function actionRowStyle(tone: "warn" | "bad" | "neutral"): CSSProperties {
  const tones: Record<string, CSSProperties> = {
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
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    textDecoration: "none",
    color: "#111",
    fontWeight: 900,
    minWidth: 0,
    ...tones[tone],
  };
}

function cardStyle(tone: "good" | "warn" | "bad" | "neutral"): CSSProperties {
  const tones: Record<string, CSSProperties> = {
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
