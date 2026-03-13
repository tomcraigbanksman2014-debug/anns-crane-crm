"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

function toLoginEmail(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return "";
  if (v.includes("@")) return v;

  return `${v}@anns.local`;
}

export default function LoginClient({
  next,
}: {
  next: string;
}) {
  const supabase = createSupabaseBrowserClient();

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const email = toLoginEmail(usernameOrEmail);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Invalid login credentials");
      setLoading(false);
      return;
    }

    window.location.href = next || "/";
  }

  return (
    <div style={page}>
      <div style={card}>
        <img src="/logo.png" alt="AnnS Crane Hire" style={logo} />

        <h1 style={{ marginBottom: 6 }}>Login</h1>
        <p style={{ opacity: 0.7, marginBottom: 20 }}>
          Use your username or email and password to access AnnS Crane CRM
        </p>

        <form onSubmit={signIn} style={{ width: "100%" }}>
          <input
            placeholder="Username or Email"
            value={usernameOrEmail}
            onChange={(e) => setUsernameOrEmail(e.target.value)}
            style={input}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={input}
          />

          {error ? <div style={errorBox}>{error}</div> : null}

          <button disabled={loading} style={button}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#dfeaf5",
};

const card: React.CSSProperties = {
  width: 420,
  maxWidth: "92vw",
  padding: 32,
  borderRadius: 18,
  background: "rgba(255,255,255,0.65)",
  border: "1px solid rgba(0,0,0,0.08)",
  textAlign: "center",
  boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
};

const logo: React.CSSProperties = {
  width: 80,
  marginBottom: 16,
};

const input: React.CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 14px",
  marginBottom: 12,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  fontSize: 15,
  boxSizing: "border-box",
};

const button: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  background: "rgba(255,0,0,0.1)",
  border: "1px solid rgba(255,0,0,0.3)",
  marginBottom: 12,
};
