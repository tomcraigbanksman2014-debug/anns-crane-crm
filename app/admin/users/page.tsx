"use client";

import { useEffect, useState } from "react";
import ClientShell from "../../ClientShell";

type StaffUser = {
  id: string;
  email: string | null;
  username: string;
  role: string;
  created_at?: string | null;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not load users.");
        return;
      }

      setUsers(data?.users ?? []);
    } catch {
      setMsg("Could not load users.");
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function onCreate(e: React.FormEvent) {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          role,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not create user.");
        return;
      }

      setMsg(`User "${data.username}" created successfully.`);
      setUsername("");
      setPassword("");
      setRole("staff");
      await loadUsers();
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(userId: string, username: string) {
    if (!confirm(`Delete user "${username}"?`)) return;

    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not delete user.");
        return;
      }

      setMsg(`User "${username}" deleted.`);
      await loadUsers();
    } catch {
      setMsg("Something went wrong. Try again.");
    }
  }

  async function onResetPassword(userId: string, username: string) {
    const newPassword = prompt(`Enter a new password for "${username}"`);
    if (!newPassword) return;

    if (newPassword.trim().length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }

    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not reset password.");
        return;
      }

      setMsg(`Password reset for "${username}".`);
    } catch {
      setMsg("Something went wrong. Try again.");
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
              Create, manage and reset staff/admin logins.
            </p>
          </div>

          <a href="/dashboard" style={btnStyle}>
            ← Back to dashboard
          </a>
        </div>

        {msg && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 10,
              background:
                msg.includes("successfully") ||
                msg.includes("deleted") ||
                msg.includes("reset")
                  ? "rgba(0,180,120,0.10)"
                  : "rgba(255,0,0,0.10)",
              border:
                msg.includes("successfully") ||
                msg.includes("deleted") ||
                msg.includes("reset")
                  ? "1px solid rgba(0,180,120,0.25)"
                  : "1px solid rgba(255,0,0,0.25)",
            }}
          >
            {msg}
          </div>
        )}

        <form onSubmit={onCreate} style={card}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Create staff login</h2>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Username is case-insensitive. Password remains case-sensitive.
          </p>

          <div style={grid12}>
            <Field span={5} label="Username">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={input}
                placeholder="e.g. office1"
              />
            </Field>

            <Field span={4} label="Password">
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
          </div>

          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={loading} style={primaryBtn}>
              {loading ? "Creating..." : "Create user"}
            </button>
          </div>
        </form>

        <div style={card}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Existing users</h2>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Reset passwords or delete unused accounts.
          </p>

          {loadingUsers ? (
            <p style={{ marginTop: 14 }}>Loading users...</p>
          ) : users.length === 0 ? (
            <p style={{ marginTop: 14 }}>No users found.</p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Username</th>
                    <th align="left" style={thStyle}>Email</th>
                    <th align="left" style={thStyle}>Role</th>
                    <th align="left" style={thStyle}>Created</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td style={tdStyle}>{u.username}</td>
                      <td style={tdStyle}>{u.email ?? "—"}</td>
                      <td style={tdStyle}>{u.role}</td>
                      <td style={tdStyle}>
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => onResetPassword(u.id, u.username)}
                            style={actionBtn}
                          >
                            Reset password
                          </button>

                          <button
                            type="button"
                            onClick={() => onDelete(u.id, u.username)}
                            style={dangerBtn}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
};

const actionBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 9,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.55)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 9,
  border: "1px solid rgba(255,0,0,0.25)",
  background: "rgba(255,0,0,0.10)",
  color: "#b00020",
  fontWeight: 900,
  cursor: "pointer",
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

const thStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.8,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
};
