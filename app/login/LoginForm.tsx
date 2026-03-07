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
      const cleanUsername = username.trim();

      if (!cleanUsername) throw new Error("Username is required");
      if (!password) throw new Error("Password is required");

      const email = toAuthEmail(cleanUsername);

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw new Error(error.message);

      await supabase.auth.updateUser({
        data: {
          last_login_at: new Date().toISOString(),
        },
      });

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
        width: "min(760px, 92vw)",
        margin: "0 auto",
        background: "rgba(255,255,255,0.18)",
        borderRadius: 16,
        padding: "34px 28px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
        border: "1px solid rgba(255,255,255,0.4)",
        textAlign: "center",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 34 }}>Login</h1>

      <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.82, fontSize: 15 }}>
        Use your username and password to access AnnS Crane CRM.
      </p>

      <form
        onSubmit={onSubmit}
        style={{
          marginTop: 24,
          display: "grid",
          gap: 14,
          width: "100%",
          maxWidth: 460,
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
            padding: "14px 20px",
            borderRadius: 12,
            border: "none",
            background: "#111",
            color: "#fff",
            fontWeight: 900,
            fontSize: 16,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            width: 220,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        {msg && (
          <div
            style={{
              marginTop: 2,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(255,0,0,0.10)",
              border: "1px solid rgba(255,0,0,0.25)",
              textAlign: "left",
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
  padding: "14px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  background: "rgba(255,255,255,0.88)",
  fontSize: 15,
  textAlign: "left",
};
