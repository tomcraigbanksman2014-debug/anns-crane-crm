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
  const [email, setEmail] = useState("");

  useEffect(() => {
    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data?.user) {
        router.replace("/login");
        return;
      }

      setEmail(data.user.email ?? "");
      setLoading(false);
    }

    loadUser();
  }, [router, supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Dashboard</h1>
      <p>
        {loading ? "Checking session..." : `Signed in as: ${email}`}
      </p>

      <button
        onClick={handleSignOut}
        style={{
          marginTop: 20,
          padding: "10px 14px",
          borderRadius: 8,
          border: "none",
          background: "#111",
          color: "white",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </main>
  );
}
