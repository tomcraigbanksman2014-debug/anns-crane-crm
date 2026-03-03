"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ClientShell from "../ClientShell";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      setUsername(fromAuthEmail(user?.email ?? null));
      setIsAdmin(user?.user_metadata?.role === "admin"); // ✅ admin flag
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const tiles = [
    { label: "Bookings", href: "/bookings" },
    { label: "Customers", href: "/customers" },
    { label: "Equipment", href: "/equipment" },
    { label: "Calendar", href: "/calendar" },
    { label: "Settings", href: "/settings" },
  ];

  if (isAdmin) {
    tiles.unshift({ label: "Admin: Staff Users", href: "/admin/users" }); // ✅ show for admin
  }

  return (
    <ClientShell>
      <div
        style={{
          width: "min(900px, 92vw)",
          background: "rgba(255,255,255,0.18)",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          border: "1px solid rgba(255,255,255,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>Dashboard</h1>
            <p style={{ marginTop: 8, opacity: 0.85 }}>
              {loading ? "Loading session..." : <>Signed in as <b>{username}</b>{isAdmin ? " (admin)" : ""}</>}
            </p>
          </div>

          <button onClick={signOut} style={{ ...pillStyle, border: "none", cursor: "pointer" }}>
            Sign out
          </button>
        </div>

        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {tiles.map((t) => (
            <a key={t.href} href={t.href} style={cardStyle}>
              {t.label}
            </a>
          ))}
        </div>
      </div>
    </ClientShell>
  );
}

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 700,
};

const cardStyle: React.CSSProperties = {
  display: "block",
  padding: 16,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.35)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
  textAlign: "center",
};
