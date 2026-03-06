"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

function toAuthEmail(username: string) {
  return `${username.trim().toLowerCase()}@anns.local`;
}

export default function LoginForm() {
  const supabase = createSupabaseBrowserClient();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const email = toAuthEmail(username);

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      // Hard navigation so middleware reads fresh cookies
      window.location.href = "/dashboard";
    } catch (err: any) {
      setMsg(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        width: "min(700px, 92vw)",
        margin: "0 auto",
        background: "rgba(255,255,255,0.18)",
        borderRadius: 14,
        padding: 28,
        boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
        border: "1px solid rgba(255,255,255,0.4)",
      }}
    >
      <h1 style={{ margin: 0 }}>Login</h1>

      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Use your username and password to access AnnS Crane CRM.
      </p>

      <form
        onSubmit={onSubmit}
        style={{
          marginTop: 18,
          display: "grid",
          gap: 12,
          maxWidth: 420,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username (e.g. admin)"
          autoComplete="username"
          style={inputStyle}
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          style={inputStyle}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 4,
            padding: "14px 14px",
            borderRadius: 12,
            border: "none",
            background: "#111",
            color: "#fff",
            fontWeight: 900,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        {msg && (
          <div
            style={{
              marginTop: 4,
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
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  background: "rgba(255,255,255,0.85)",
  fontSize: 14,
};
