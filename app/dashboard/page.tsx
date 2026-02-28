"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export default function DashboardPage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, anonKey);
  }, []);

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    async function loadUser() {
      try {
        // If env vars missing, show a clear message in console and stop
        if (
          !process.env.NEXT_PUBLIC_SUPABASE_URL ||
          !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ) {
          console.error(
            "Missing env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
          );
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.getUser();

        // Not logged in -> back to login
        if (error || !data?.user) {
          router.replace("/login");
          return;
        }

        setEmail(data.user.email ?? "");
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [router, supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p style={{ color: "#6b7280", marginTop: 8 }}>
          {loading ? "Checking session..." : `Signed in as: ${email || "Unknown"}`}
        </p>

        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              cursor: "pointer",
            }}
          >
            Home
          </button>

          <button
            onClick={handleSignOut}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "#111827",
              color: "white",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>

        <div
          style={{
            marginTop: 20,
            padding: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
          }}
        >
          <strong>✅ You are on /dashboard</strong>
          <p style={{ marginTop: 8, marginBottom: 0, color: "#6b7280" }}>
            Next: build your CRM pages here.
          </p>
        </div>
      </div>
    </main>
  );
}
