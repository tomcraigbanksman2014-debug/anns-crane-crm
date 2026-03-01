"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export default function AdminUsersPage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, anonKey);
  }, []);

  const [checking, setChecking] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  // Optional: lock this page behind your Supabase login
  useEffect(() => {
    async function check() {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data?.user) {
          router.replace("/login");
          return;
        }
      } finally {
        setChecking(false);
      }
    }
    check();
  }, [router, supabase]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setIsError(false);

    const u = username.trim();
    if (u.length < 3) {
      setIsError(true);
      setMessage("Username must be at least 3 characters.");
      return;
    }
    if (password.length < 6) {
      setIsError(true);
      setMessage("Password must be at least 6 characters.");
      return;
    }

    const token = process.env.NEXT_PUBLIC_ADMIN_CREATE_USER_TOKEN;
    if (!token) {
      setIsError(true);
      setMessage(
        "Missing NEXT_PUBLIC_ADMIN_CREATE_USER_TOKEN in Vercel env vars."
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({ username: u, password }),
      });

      if (!res.ok) {
        const text = await res.text();
        setIsError(true);
        setMessage(text || `Request failed (${res.status})`);
        return;
      }

      const data = await res.json();
      setIsError(false);
      setMessage(`Created user "${data.username}"`);
      setUsername("");
      setPassword("");
    } catch (err: any) {
      setIsError(true);
      setMessage(err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // ---- Styling helpers ----
  const bg = "#bfc1c6"; // match your current screen grey
  const card = "rgba(255,255,255,0.22)";
  const border = "rgba(255,255,255,0.35)";

  if (checking) {
    return (
      <main
        style={{
          minHeight: "100svh",
          background: bg,
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui",
        }}
      >
        <div>Checking session...</div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100svh",
        background: bg,
        display: "grid",
        placeItems: "center",
        fontFamily: "system-ui",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(520px, 92vw)",
          textAlign: "center",
        }}
      >
        <img
          src="/logo.png"
          alt="AnnS Crane Hire"
          style={{
            width: 110, // 👈 make logo bigger here
            height: "auto",
            margin: "0 auto 18px",
            display: "block",
          }}
        />

        <h1 style={{ margin: 0, fontSize: 34, letterSpacing: 0.2 }}>
          Admin → Create Staff User
        </h1>
        <p style={{ marginTop: 10, marginBottom: 18, opacity: 0.75 }}>
          Create staff usernames + passwords. Staff do not need email accounts.
        </p>

        <form
          onSubmit={handleCreateUser}
          style={{
            background: card,
            border: `1px solid ${border}`,
            borderRadius: 14,
            padding: 18,
            textAlign: "left",
          }}
        >
          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. office1"
            autoComplete="off"
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
            placeholder="min 6 characters"
            type="password"
            autoComplete="new-password"
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
            {loading ? "Creating..." : "Create user"}
          </button>

          {message && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                background: isError ? "rgba(255, 90, 90, 0.18)" : "rgba(90, 255, 160, 0.22)",
              }}
            >
              {message}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
