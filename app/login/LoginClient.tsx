"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

export default function LoginClient({
  next,
}: {
  next?: string;
}) {
  const supabase = createSupabaseBrowserClient();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toLoginEmail(value: string) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return "";
    if (raw.includes("@")) return raw;
    return `${raw}@anns.local`;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const email = toLoginEmail(username);

    if (!email || !password) {
      setError("Enter your username and password.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !data.user) {
        setError(signInError?.message || "Could not sign in.");
        setLoading(false);
        return;
      }

      const mustChangePassword = Boolean(
        (data.user.user_metadata as any)?.must_change_password === true
      );

      if (mustChangePassword) {
        window.location.href = "/change-password";
        return;
      }

      window.location.href = next || "/";
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={logoWrap}>
          <img src="/logo.png" alt="AnnS Crane Hire" style={logoStyle} />
        </div>

        <h1 style={titleStyle}>AnnS Crane CRM</h1>
        <p style={subtitleStyle}>Sign in to continue</p>

        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. t.admin"
              autoComplete="username"
              style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          {error ? <div style={errorBox}>{error}</div> : null}

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#dfeaf5",
  display: "grid",
  placeItems: "center",
  padding: 16,
  boxSizing: "border-box",
};

const cardStyle: React.CSSProperties = {
  width: "min(420px, 92vw)",
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 18,
  padding: 24,
  boxShadow: "0 12px 40px rgba(0,0,0,0.10)",
};

const logoWrap: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  marginBottom: 12,
};

const logoStyle: React.CSSProperties = {
  width: 90,
  height: "auto",
  objectFit: "contain",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  textAlign: "center",
  fontSize: 30,
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 18,
  textAlign: "center",
  opacity: 0.75,
};

const formStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  opacity: 0.8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  boxSizing: "border-box",
  fontSize: 15,
};

const buttonStyle: React.CSSProperties = {
  marginTop: 4,
  height: 46,
  borderRadius: 12,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  fontSize: 15,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
  color: "#111",
};
