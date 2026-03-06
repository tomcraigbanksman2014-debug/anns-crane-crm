"use client";

import { useState } from "react";

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Login failed");
        return;
      }

      // Hard redirect so cookies are definitely used on the next request
      window.location.href = "/dashboard";
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username (e.g. office1)"
        autoComplete="username"
        style={{
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.14)",
          outline: "none",
        }}
      />

      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        type="password"
        autoComplete="current-password"
        style={{
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.14)",
          outline: "none",
        }}
      />

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "12px 14px",
          borderRadius: 10,
          border: "none",
          background: "#111",
          color: "#fff",
          fontWeight: 900,
          cursor: "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>

      {error && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(255,0,0,0.10)",
            border: "1px solid rgba(255,0,0,0.25)",
          }}
        >
          {error}
        </div>
      )}
    </form>
  );
}
