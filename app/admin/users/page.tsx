"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ClientShell from "../../ClientShell";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type ListedUser = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  role?: string | null;
};

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export default function AdminUsersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [meLoading, setMeLoading] = useState(true);
  const [meEmail, setMeEmail] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);

  const [usersLoading, setUsersLoading] = useState(true);
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);

  // create user form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadMe() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        router.replace("/login");
        return;
      }

      const roleMeta = (user.user_metadata as any)?.role ?? null;
      setMeEmail(user.email ?? null);
      setMeRole(roleMeta);

      // hard block if not admin
      if (roleMeta !== "admin") {
        router.replace("/dashboard");
        return;
      }

      setMeLoading(false);
    }
    loadMe();
  }, [router, supabase]);

  async function refreshUsers() {
    setUsersLoading(true);
    setUsersError(null);

    try {
      const res = await fetch("/api/admin/users", { method: "GET" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setUsersError(data?.error || "Failed to load users.");
        setUsers([]);
        return;
      }

      setUsers((data?.users || []) as ListedUser[]);
    } catch {
      setUsersError("Failed to load users.");
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    if (!meLoading && meRole === "admin") refreshUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoading, meRole]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateMsg(null);

    const u = username.trim().toLowerCase();
    const p = password;

    if (!u || !p) {
      setCreateMsg("Username and password are required.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p, role }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setCreateMsg(data?.error || "Failed to create user.");
        return;
      }

      setCreateMsg(`Created ${u} (${role}).`);
      setUsername("");
      setPassword("");
      setRole("staff");
      await refreshUsers();
    } catch {
      setCreateMsg("Failed to create user.");
    } finally {
      setCreating(false);
    }
  }

  if (meLoading) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 92vw)" }}>
          <h1 style={{ margin: 0 }}>Admin</h1>
          <p style={{ opacity: 0.8, marginTop: 8 }}>Loading…</p>
        </div>
      </ClientShell>
    );
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Admin: Staff accounts</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Signed in as <b>{fromAuthEmail(meEmail)}</b> (admin)
            </p>
          </div>

          <a href="/dashboard" style={pillLink}>
            ← Back to dashboard
          </a>
        </div>

        {/* Create user */}
        <div style={panel}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Create staff login</h2>
          <p style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
            This creates a Supabase Auth user as <code>{`username@anns.local`}</code> with metadata role.
          </p>

          <form onSubmit={onCreate} style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={label}>Username</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. office1"
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set a strong password"
                  type="password"
                  style={input}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10, alignItems: "end" }}>
              <div>
                <label style={label}>Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value as any)} style={input}>
                  <option value="staff">staff</option>
                  <option value="admin">admin</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={creating || !username.trim() || !password}
                style={{
                  ...button,
                  opacity: creating || !username.trim() || !password ? 0.7 : 1,
                  cursor: creating || !username.trim() || !password ? "not-allowed" : "pointer",
                }}
              >
                {creating ? "Creating…" : "Create user"}
              </button>
            </div>

            {createMsg && (
              <div style={msgBox(createMsg.startsWith("Created") ? "ok" : "err")}>{createMsg}</div>
            )}
          </form>
        </div>

        {/* List users */}
        <div style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Existing users</h2>
            <button onClick={refreshUsers} style={{ ...pillButton, border: "none", cursor: "pointer" }}>
              Refresh
            </button>
          </div>

          {usersError && <div style={msgBox("err")}>{usersError}</div>}

          {usersLoading ? (
            <p style={{ marginTop: 10, opacity: 0.8 }}>Loading users…</p>
          ) : users.length === 0 ? (
            <p style={{ marginTop: 10, opacity: 0.8 }}>No users found.</p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={th}>Email</th>
                    <th align="left" style={th}>Role</th>
                    <th align="left" style={th}>Created</th>
                    <th align="left" style={th}>Last sign-in</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td style={td}>{u.email ?? "-"}</td>
                      <td style={td}>{u.role ?? "-"}</td>
                      <td style={td}>{u.created_at ? new Date(u.created_at).toLocaleString() : "-"}</td>
                      <td style={td}>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "-"}</td>
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

const panel: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const label: React.CSSProperties = { display: "block", fontSize: 12, marginBottom: 6, opacity: 0.85 };

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 14,
  background: "rgba(255,255,255,0.85)",
};

const button: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "white",
  fontSize: 14,
  fontWeight: 800,
};

const pillLink: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const pillButton: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  color: "#111",
  fontWeight: 800,
};

const th: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.8,
};

const td: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
};

function msgBox(kind: "ok" | "err"): React.CSSProperties {
  return {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 10,
    background: kind === "ok" ? "rgba(0,255,0,0.08)" : "rgba(255,0,0,0.10)",
    border: kind === "ok" ? "1px solid rgba(0,160,0,0.25)" : "1px solid rgba(255,0,0,0.25)",
  };
}
