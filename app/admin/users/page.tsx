"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ClientShell from "../../ClientShell";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

function toAuthEmail(username: string) {
  return `${username.toLowerCase()}@anns.local`;
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export default function AdminUsersPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [loadingSession, setLoadingSession] = useState(true);
  const [me, setMe] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  // Only allow admin (temporarily: username === "tom")
  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const u = fromAuthEmail(data.user?.email ?? null);
      setMe(u);
      setLoadingSession(false);

      if (!u) {
        router.replace("/login");
        return;
      }
      if (u !== "tom") {
        router.replace("/dashboard");
        return;
      }
    }
    load();
  }, [router, supabase]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setIsError(false);

    const u = username.trim().toLowerCase();
    if (u.length < 3) {
      setIsError(true);
      setMsg("Username must be at least 3 characters.");
      return;
    }
    if (password.length < 6) {
      setIsError(true);
      setMsg("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: u,
          password,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setIsError(true);
        setMsg(data?.error || "Failed to create user.");
        return;
      }

      setIsError(false);
      setMsg(`Created user: ${u}`);
      setUsername("");
      setPassword("");
    } finally {
      setSaving(false);
    }
  }

  if (loadingSession) return null;

  return (
    <ClientShell>
      <div
        style={{
          width: "min(720px, 92vw)",
          background: "rgba(255,255,255,0.18)",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          border: "1px solid rgba(255,255,255,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>Admin → Users</h1>
            <p style={{ marginTop: 8, opacity: 0.85 }}>
              Signed in as <b>{me}</b>
            </p>
          </div>

          <a href="/dashboard" style={pillStyle}>
            Back to dashboard
          </a>
        </div>

        <form onSubmit={createUser} style={{ marginTop: 18, display: "grid", gap: 12 }}>
          <div style={{ opacity: 0.85, fontSize: 13 }}>
            Staff will log in using <b>username + password</b>.
            (We store them in Supabase as <b>{`username@anns.local`}</b>.)
          </div>

          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="New staff username (e.g. office1)"
            style={inputStyle}
            autoComplete="off"
          />

          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Temporary password (min 6 characters)"
            style={inputStyle}
            type="password"
            autoComplete="new-password"
          />

          <button
            disabled={saving}
            type="submit"
            style={{
              ...pillStyle,
              border: "none",
              cursor: "pointer",
              background: "#111",
              color: "white",
              fontWeight: 800,
              justifySelf: "start",
            }}
          >
            {saving ? "Creating..." : "Create staff user"}
          </button>

          {msg && (
            <div
              style={{
                marginTop: 6,
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                background: isError ? "rgba(255,0,0,0.12)" : "rgba(0,255,120,0.12)",
                fontSize: 13,
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

const inputStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  fontSize: 14,
  background: "rgba(255,255,255,0.85)",
};
