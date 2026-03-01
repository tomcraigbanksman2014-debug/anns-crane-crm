"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ClientShell from "../ClientShell";

function getCookie(name: string) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()!.split(";").shift() || "";
  return "";
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState("");

  useEffect(() => {
    setUser(getCookie("staff_user"));
  }, []);

  async function signOut() {
    // Call API to clear cookie properly
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }

  return (
    <ClientShell>
      <div
        style={{
          width: "min(800px, 92vw)",
          background: "rgba(255,255,255,0.18)",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          border: "1px solid rgba(255,255,255,0.4)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Dashboard</h1>

        <p style={{ opacity: 0.85 }}>
          Signed in as: <b>{user || "Unknown"}</b>
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="/bookings" style={linkStyle}>
            Bookings
          </a>
          <a href="/customers" style={linkStyle}>
            Customers
          </a>
          <a href="/equipment" style={linkStyle}>
            Equipment
          </a>
          <a href="/calendar" style={linkStyle}>
            Calendar
          </a>
          <a href="/settings" style={linkStyle}>
            Settings
          </a>
        </div>

        <button
          onClick={signOut}
          style={{
            marginTop: 18,
            padding: "12px 14px",
            borderRadius: 8,
            border: "none",
            background: "#111",
            color: "white",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </ClientShell>
  );
}

const linkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.35)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 600,
};
