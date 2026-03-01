"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export default function LoginPage() {
  const router = useRouter();

  // Keep your Supabase client around in case you still want the admin email login later.
  // For staff username login, we use /api/login instead.
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, anonKey);
  }, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const u = username.trim();
    if (u.length < 3) return setError("Username must be at least 3 characters.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");

    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password }),
      });

      if (!res.ok) {
        const msg = await res.text();
        setError(msg || "Login failed.");
        return;
      }

      // If the API sets a cookie/session, this will now be authenticated.
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Styling: match your existing grey + no scroll
  const bg = "#bfc1c6"; // same shade you’re using elsewhere
  const card = "rgba(255,255,255,0.22)";
  const border = "rgba(255,255,255,0.35)";

  return (
    <main
      style={{
        height: "100svh",
        overflow: "hidden",
        background: bg,
        fontFamily: "system-ui",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <div
        style={{
          width: "min(520px, 92vw)",
          display: "grid",
          gap: 16,
          justifyItems: "center",
        }}
      >
        <img
          src="/logo.png"
          alt="AnnS Crane Hire"
          style={{
            width: 110,
            height: "auto",
            display: "block",
          }}
        />

        <form
          onSubmit={handleSubmit}
          style={{
            width: "100%",
            background: card,
            border: `1px solid ${border}`,
            borderRadius: 14,
            padding: 18,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 30 }}>Login</h1>
          <p style={{ marginTop: 6, marginBottom: 16, opacity: 0.75 }}>
            Sign in to AnnS Crane CRM
          </p>

          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. office1"
            autoComplete="username"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              outline: "none",
              marginBottom: 14,
            }}
          />

          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
            Password
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              outline: "none",
              marginBottom: 14,
            }}
          />

          <button
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#f0f0f0",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          {error && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "rgba(255, 90, 90, 0.18)",
              }}
            >
              {error}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
