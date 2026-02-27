"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    alert(`Login clicked\nEmail: ${email}\nPassword: ${"*".repeat(password.length)}`);
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Login</h1>
        <p style={{ marginTop: 6, color: "#6b7280" }}>Sign in to Ann’s Crane CRM</p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 14 }}>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@example.com"
              required
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                fontSize: 16,
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 14 }}>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              required
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                fontSize: 16,
              }}
            />
          </label>

          <button
            type="submit"
            style={{
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Sign in
          </button>

          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            (Next step: connect this to Supabase auth.)
          </p>
        </form>
      </div>
    </main>
  );
}
