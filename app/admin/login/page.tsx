"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClientShell } from "../../ClientShell";

export default function AdminLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Invalid admin code");
        return;
      }

      router.replace("/admin/users");
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ClientShell>
      <div
        style={{
          width: "min(720px, 92vw)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 34 }}>Admin Login</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.8 }}>
            Enter the admin code to access staff user management.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          style={{
            width: "min(560px, 92vw)",
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.18)",
            borderRadius: 14,
            padding: 18,
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          }}
        >
          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
            Admin code
          </label>

          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter admin code"
            type="password"
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              outline: "none",
              fontSize: 16,
              background: "rgba(255,255,255,0.85)",
            }}
          />

          <button
            type="submit"
            disabled={loading || !code.trim()}
            style={{
              width: "100%",
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "white",
              fontSize: 15,
              cursor: loading || !code.trim() ? "not-allowed" : "pointer",
              opacity: loading || !code.trim() ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          {msg && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,0,0,0.10)",
                border: "1px solid rgba(255,0,0,0.25)",
              }}
            >
              {msg}
            </div>
          )}
        </form>
      </div>
    </ClientShell>
  );
}
