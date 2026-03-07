"use client";

import { useState } from "react";
import ClientShell from "../../ClientShell";

export default function AdminUsersPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!username.trim()) {
      setMsg("Username is required.");
      return;
    }

    if (password.trim().length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
          role,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not create user.");
        return;
      }

      setMsg(`User "${username.trim()}" created successfully.`);
      setUsername("");
      setPassword("");
      setRole("staff");
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Admin: Staff accounts</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Create staff login accounts for AnnS Crane CRM.
            </p>
          </div>

          <a href="/dashboard" style={btnStyle}>
            ← Back to dashboard
          </a>
        </div>

        <form onSubmit={onSubmit} style={card}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Create staff login</h2>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            This creates a Supabase Auth user as username@anns.local with metadata role.
          </p>

          {msg && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: msg.includes("successfully")
                  ? "rgba(0,180,120,0.10)"
                  : "rgba(255,0,0,0.10)",
                border: msg.includes("successfully")
                  ? "1px solid rgba(0,180,120,0.25)"
                  : "1px solid rgba(255,0,0,0.25)",
              }}
            >
              {msg}
            </div>
          )}

          <div style={grid12}>
            <Field span={6} label="Username">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={input}
                placeholder="e.g. office1"
              />
            </Field>

            <Field span={6} label="Password">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                style={input}
                placeholder="Set a strong password"
              />
            </Field>

            <Field span={3} label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value)} style={input}>
                <option value="staff">staff</option>
                <option value="admin">admin</option>
              </select>
            </Field>

            <div
              style={{
                gridColumn: "span 9",
                display: "flex",
                alignItems: "flex-end",
              }}
            >
              <button type="submit" disabled={loading} style={primaryBtn}>
                {loading ? "Creating..." : "Create user"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span: number;
}) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const card: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const grid12: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 12,
  marginTop: 12,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const input: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "white",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
  width: "100%",
};

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};
