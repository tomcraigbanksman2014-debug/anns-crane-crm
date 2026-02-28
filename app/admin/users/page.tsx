"use client";

import { useState } from "react";

const ADMIN_TOKEN = "bfqoxbugzfbcvspygroj-admin-2026-02-28-!X9mK2qP7vR4sL8z";

export default function AdminUsersPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        },
        body: JSON.stringify({ username, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErr(json?.error || "Failed to create user");
        return;
      }

      setMsg(`✅ Created user "${username}"`);
      setUsername("");
      setPassword("");
    } catch (e: any) {
      setErr(e?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Admin → Create Staff User</h1>
      <p style={{ color: "rgba(0,0,0,0.6)" }}>
        Create staff usernames + passwords. Staff do not need email accounts.
      </p>

      <form onSubmit={handleCreateUser} style={{ maxWidth: 420, display: "grid", gap: 12, marginTop: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 14 }}>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="e.g. office1"
            required
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 16 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 14 }}>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="min 6 characters"
            required
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 16 }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 6,
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            fontSize: 16,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Creating..." : "Create user"}
        </button>

        {err && (
          <div style={{ padding: 10, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
            {err}
          </div>
        )}

        {msg && (
          <div style={{ padding: 10, borderRadius: 10, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46" }}>
            {msg}
          </div>
        )}
      </form>
    </main>
  );
}
