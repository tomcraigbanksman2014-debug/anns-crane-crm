"use client";

import { useEffect, useMemo, useState } from "react";
import ClientShell from "../ClientShell";
import DashboardSearch from "../components/DashboardSearch";
import StatusPill from "../components/StatusPill";
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

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

type DashboardStats = {
  bookingsToday?: number;
  activeHires?: number;
  availableEquipment?: number;
  totalEquipment?: number;
  outstandingInvoices?: number;
  utilisationPct?: number | null;
  onHireEquipment?: number;
  reservedEquipment?: number;
  certExpiringSoon?: number;
  certExpired?: number;
  maintenanceEquipment?: number;
  upcomingBookings?: Array<{
    id: string;
    start_at?: string | null;
    start_date?: string | null;
    location?: string | null;
    status?: string | null;
    clients?: { company_name?: string | null } | { company_name?: string | null }[] | null;
    equipment?: { name?: string | null } | { name?: string | null }[] | null;
  }>;
  overdueInvoices?: Array<{
    id: string;
    total_invoice?: number | null;
    invoice_status?: string | null;
    start_at?: string | null;
    start_date?: string | null;
    clients?: { company_name?: string | null } | { company_name?: string | null }[] | null;
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
    start_at?: string | null;
    start_date?: string | null;
    location?: string | null;
    status?: string | null;
    clients?: { company_name?: string | null } | { company_name?: string | null }[] | null;
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
      const email = String(user.email ?? "").toLowerCase();
      const masterAdminEmail = String(process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL ?? "")
        .trim()
        .toLowerCase();
      const isMaster = !!email && !!masterAdminEmail && email === masterAdminEmail;

      setUsername(fromAuthEmail(user.email ?? null));
      setRole(isMaster ? "admin" : ((user.user_metadata?.role as any) ?? ""));

      const daysLeft = isMaster
        ? null
        : daysUntilPasswordExpiry((user.user_metadata as any)?.password_changed_at ?? null);

      setPasswordDaysLeft(daysLeft);

      const res = await fetch("/api/dashboard/stats");
      const json = await res.json().catch(() => null);
      setStats(json);

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
      { label: "Bookings", href: "/bookings", tone: "warn" as const },
      { label: "Quotes", href: "/quotes", tone: "neutral" as const },
      { label: "Customers", href: "/customers", tone: "good" as const },
      { label: "Equipment", href: "/equipment", tone: "good" as const },
      { label: "Calendar", href: "/calendar", tone: "neutral" as const },
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

  return (
    <ClientShell>
      <div
        style={{
          width: "min(1250px, 96vw)",
          background: "rgba(255,255,255,0.18)",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          border: "1px solid rgba(255,255,255,0.4)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Dashboard</h1>
            <p style={{ marginTop: 8, opacity: 0.85 }}>
              {loading ? (
                "Loading session..."
              ) : (
                <>
                  Signed in as <b>{username}</b> {role ? `(${role})` : ""}
                </>
              )}
            </p>
          </div>

          <button
            onClick={signOut}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "rgba(255,255,255,0.45)",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            Sign out
          </button>
        </div>

        {passwordDaysLeft !== null && passwordDaysLeft <= 14 && passwordDaysLeft > 0 && (
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(255,170,0,0.14)",
              border: "1px solid rgba(255,170,0,0.24)",
              fontWeight: 800,
            }}
          >
            Password expires in {passwordDaysLeft} day{passwordDaysLeft === 1 ? "" : "s"}. Please update it soon.
          </div>
        )}

        {(stats?.certExpired ?? 0) > 0 && (
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(255,0,0,0.12)",
              border: "1px solid rgba(255,0,0,0.22)",
              fontWeight: 900,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span>
              ⚠ {stats?.certExpired} equipment item{stats?.certExpired === 1 ? "" : "s"} have expired certification.
            </span>
            <a href="/equipment?cert=expired" style={warningLinkStyle}>
              View expired equipment →
            </a>
          </div>
        )}

        {(stats?.certExpiringSoon ?? 0) > 0 && (
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(255,170,0,0.14)",
              border: "1px solid rgba(255,170,0,0.24)",
              fontWeight: 800,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span>
              ⚠ {stats?.certExpiringSoon} equipment item{stats?.certExpiringSoon === 1 ? "" : "s"} have certification expiring within 30 days.
            </span>
            <a href="/equipment?cert=expiring" style={warningLinkStyle}>
              View expiring equipment →
            </a>
          </div>
        )}

        {(stats?.maintenanceEquipment ?? 0) > 0 && (
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(0,120,255,0.10)",
              border: "1px solid rgba(0,120,255,0.18)",
              fontWeight: 800,
            }}
          >
            ℹ {stats?.maintenanceEquipment} equipment item{stats?.maintenanceEquipment === 1 ? "" : "s"} currently marked as maintenance.
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <DashboardSearch />
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <StatCard title="Bookings today" value={stats?.bookingsToday ?? "-"} subtext="Jobs starting today" badge={<StatusPill text="Today" />} />
          <StatCard title="Active hires" value={stats?.activeHires ?? "-"} subtext="Currently live bookings" badge={<StatusPill text="Live" />} />
          <StatCard title="Equipment available" value={`${stats?.availableEquipment ?? "-"} / ${stats?.totalEquipment ?? "-"}`} subtext="Available vs total fleet" badge={<StatusPill text="Avail" />} />
          <StatCard title="Invoices outstanding" value={typeof stats?.outstandingInvoices === "number" ? moneyGBP(stats.outstandingInvoices) : "-"} subtext="Unpaid or part-paid" badge={<StatusPill text="£" />} />
          <StatCard title="Utilisation" value={typeof stats?.utilisationPct === "number" ? `${stats.utilisationPct}%` : "-"} subtext="Fleet utilisation" badge={<StatusPill text="Use" />} />
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {tiles.map((t) => (
            <a key={t.href} href={t.href} style={cardStyle(t.tone)}>
              {t.label}
            </a>
          ))}
          {adminTiles.map((t) => (
            <a key={t.href} href={t.href} style={cardStyle(t.tone)}>
              {t.label}
            </a>
          ))}
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr 1fr",
            gap: 14,
          }}
        >
          <Panel title="Today's jobs" subtitle="Work scheduled for today">
            {!stats?.todayJobs || stats.todayJobs.length === 0 ? (
              <EmptyState text="No jobs scheduled for today." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {stats.todayJobs.slice(0, 6).map((b) => {
                  const client = first(b.clients);
                  const equipment = first(b.equipment);

                  return (
                    <a key={b.id} href={`/bookings/${b.id}`} style={rowLink}>
                      <div>
                        <div style={{ fontWeight: 900 }}>
                          {client?.company_name ?? "Customer"} • {equipment?.name ?? "Equipment"}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                          {b.start_at ? fmtDateTime(b.start_at) : fmtDate(b.start_date)} • {b.location ?? "No location"}
                        </div>
                      </div>
                      <StatusPill text={b.status ?? "—"} />
                    </a>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Fleet status" subtitle="Derived from live and future bookings">
            <div style={{ display: "grid", gap: 10 }}>
              <MiniStat label="On hire now" value={stats?.onHireEquipment ?? 0} />
              <MiniStat label="Reserved later" value={stats?.reservedEquipment ?? 0} />
              <MiniStat label="Available now" value={stats?.availableEquipment ?? 0} />
            </div>
          </Panel>

          <Panel title="Overdue / unpaid invoices" subtitle="Jobs needing payment attention">
            {!stats?.overdueInvoices || stats.overdueInvoices.length === 0 ? (
              <EmptyState text="No overdue or unpaid invoices." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {stats.overdueInvoices.slice(0, 6).map((b) => {
                  const client = first(b.clients);

                  return (
                    <a key={b.id} href={`/bookings/${b.id}`} style={rowLink}>
                      <div>
                        <div style={{ fontWeight: 900 }}>
                          {client?.company_name ?? "Customer"}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                          {b.start_at ? fmtDate(b.start_at) : fmtDate(b.start_date)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 900 }}>
                          {typeof b.total_invoice === "number" ? moneyGBP(b.total_invoice) : "—"}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <StatusPill text={b.invoice_status ?? "—"} />
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 14,
          }}
        >
          <Panel title="Upcoming bookings" subtitle="Next jobs coming up">
            {!stats?.upcomingBookings || stats.upcomingBookings.length === 0 ? (
              <EmptyState text="No upcoming bookings." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {stats.upcomingBookings.slice(0, 6).map((b) => {
                  const client = first(b.clients);
                  const equipment = first(b.equipment);

                  return (
                    <a key={b.id} href={`/bookings/${b.id}`} style={rowLink}>
                      <div>
                        <div style={{ fontWeight: 900 }}>
                          {client?.company_name ?? "Customer"} • {equipment?.name ?? "Equipment"}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                          {b.start_at ? fmtDateTime(b.start_at) : fmtDate(b.start_date)} • {b.location ?? "No location"}
                        </div>
                      </div>
                      <StatusPill text={b.status ?? "—"} />
                    </a>
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
                {stats.recentAudit.slice(0, 8).map((a) => (
                  <div key={a.id} style={activityRow}>
                    <div>
                      <div style={{ fontWeight: 900 }}>
                        {(a.actor_username ?? "user")} • {a.action ?? "action"} • {a.entity_type ?? "entity"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                        {fmtDateTime(a.created_at)}
                      </div>
                    </div>
                    <StatusPill text={a.action ?? "—"} />
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
}: {
  title: string;
  value: any;
  subtext?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background: "rgba(255,255,255,0.35)",
        border: "1px solid rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>{title}</div>
        {badge}
      </div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 1000 }}>{value}</div>
      {subtext && <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>{subtext}</div>}
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
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.28)",
        border: "1px solid rgba(0,0,0,0.10)",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ fontWeight: 1000, fontSize: 18 }}>{title}</div>
      {subtitle && <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>{subtitle}</div>}
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
};

const warningLinkStyle: React.CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  color: "#111",
  fontWeight: 900,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
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
    ...tones[tone],
  };
}
