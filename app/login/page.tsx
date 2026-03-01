"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ClientShell from "../ClientShell";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorMsg(
          data?.error || "Invalid username or password"
        );
        return;
      }

      router.replace("/dashboard");
    } catch {
      setErrorMsg("Something went wrong. Try again.");
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
        <h1 style={{ margin: 0, fontSize: 28 }}>Staff Login</h1>

        <form
          onSubmit={handleSubmit}
          style={{ marginTop: 20, display: "grid", gap: 12 }}
        >
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 14,
            }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 14,
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
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          {errorMsg && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                background: "rgba(255,0,0,0.12)",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {errorMsg}
            </div>
          )}
        </form>
      </div>
    </ClientShell>
  );
}
