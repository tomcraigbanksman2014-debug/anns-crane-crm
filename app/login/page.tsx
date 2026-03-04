"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ClientShell from "../ClientShell";

function toAuthEmail(username: string) {
  return `${username.trim().toLowerCase()}@anns.local`;
}

export default function LoginPage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, anon);
  }, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // If already signed in, go straight to dashboard
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/dashboard");
    })();
  }, [router, supabase]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const email = toAuthEmail(username);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      // Wait until session is definitely present before routing
      const session = data.session ?? (await supabase.auth.getSession()).data.session;
      if (!session) {
        setMsg("Signed in but no session found. Check Supabase auth settings.");
        return;
      }

      router.replace("/dashboard");
    } catch (err: any) {
      setMsg(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ClientShell>
      <div
        style={{
          width: "min(720px, 92vw)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 34 }}>Sign in</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.8 }}>
            Use your staff username and password.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          style={{
            width: "min(560px, 92vw)",
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.18)",
            borderRadius: 14,
            padding: 18,
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          }}
        >
          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. tom"
            autoComplete="username"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              outline: "none",
              fontSize: 16,
              background: "rgba(255,255,255,0.85)",
            }}
          />

          <label style={{ display: "block", fontSize: 12, margin: "12px 0 6px" }}>
            Password
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            type="password"
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              outline: "none",
              fontSize: 16,
              background: "rgba(255,255,255,0.85)",
            }}
          />

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            style={{
              width: "100%",
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "white",
              fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              fontWeight: 800,
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          {msg && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,0,0,0.10)",
                border: "1px solid rgba(255,0,0,0.25)",
                fontWeight: 700,
              }}
            >
              {msg}
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            Tip: your login email is stored internally as <b>username@anns.local</b>.
          </div>
        </form>
      </div>
    </ClientShell>
  );
}
