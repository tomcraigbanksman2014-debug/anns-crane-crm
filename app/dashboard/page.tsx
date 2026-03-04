"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ClientShell from "../ClientShell";
import { createClient } from "@supabase/supabase-js";
import DashboardSearch from "../components/DashboardSearch";
import StatusPill from "../components/StatusPill";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function moneyGBP(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "GBP" });
}

export default function DashboardPage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, anon);
  }, []);

  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "staff" | "">("");
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      setUsername(fromAuthEmail(user.email ?? null));
      setRole((user.user_metadata?.role as any) ?? "");

      // Load stats
      const res = await fetch("/api/dashboard/stats");
      const json = await res.json().catch(() => null);
      setStats(json);

      setLoading(false);
    }

    load();
  }, [router, supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const tiles = [
    { label: "Bookings", href: "/bookings", tone: "warn" as const },
    { label: "Customers", href: "/customers", tone: "good" as const },
    { label: "Equipment", href: "/equipment", tone: "good" as const },
    { label: "Calendar", href: "/calendar", tone: "neutral" as const },
    { label: "Settings", href: "/settings", tone: "neutral" as const },
  ];

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
          width: "min(1020px, 95vw)",
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
              {loading ? "Loading session..." : <>Signed in as <b>{username}</b> {role ? `(${role})` : ""}</>}
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

        {/* Search */}
        <div style={{ marginTop: 14 }}>
          <DashboardSearch />
        </div>

        {/* Stats */}
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <StatCard title="Bookings today" value={stats?.bookingsToday ?? "-"} badge={<StatusPill text="TODAY" kind="info" />} />
          <StatCard title="Active hires" value={stats?.activeHires ?? "-"} badge={<StatusPill text="LIVE" kind="good" />} />
          <StatCard title="Equipment available" value={`${stats?.availableEquipment ?? "-"} / ${stats?.totalEquipment ?? "-"}`} badge={<StatusPill text="AVAIL" kind="good" />} />
          <StatCard title="Invoices outstanding" value={typeof stats?.outstandingInvoices === "number" ? moneyGBP(stats.outstandingInvoices) : "-"} badge={<StatusPill text="£" kind="warn" />} />
        </div>

        {/* Navigation tiles */}
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
      </div>
    </ClientShell>
  );
}

function StatCard({ title, value, badge }: { title: string; value: any; badge?: React.ReactNode }) {
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
    </div>
  );
}

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
