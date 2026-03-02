"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ClientShell from "../ClientShell";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

function toAuthEmail(username: string) {
  // Staff type a username; we convert to a controlled “fake email”
  return `${username.toLowerCase()}@anns.local`;
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const u = username.trim().toLowerCase();
    if (u.length < 3) {
      setMsg("Username must be at least 3 characters.");
      return;
    }
    if (password.length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: toAuthEmail(u),
        password,
      });

      if (error) {
        setMsg("Invalid username or password.");
        return;
      }

      router.replace("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ClientShell>
      <div
        style={{
          width: "min(520px, 92vw)",
          background: "rgba(255,255,255,0.18)",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          border: "1px solid rgba(255,255,255,0.4)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28 }}>Login</h1>
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          Use your username and password to access AnnS Crane CRM.
        </p>

        <form onSubmit={onSubmit} style={{ marginTop: 18, display: "grid", gap: 12 }}>
          <input
            type="text"
            placeholder="Username (e.g. office1)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 14,
              background: "rgba(255,255,255,0.85)",
            }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 14,
              background: "rgba(255,255,255,0.85)",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 8,
              border: "none",
              background: "#111",
              color: "white",
              fontSize: 14,
              cursor: "pointer",
              opacity: loading ? 0.8 : 1,
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          {msg && (
            <div
              style={{
                marginTop: 6,
                padding: 10,
                background: "rgba(255,0,0,0.12)",
                borderRadius: 8,
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
