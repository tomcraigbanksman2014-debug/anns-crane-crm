"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export default function HomePage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, anonKey);
  }, []);

  useEffect(() => {
    async function checkUser() {
      const { data } = await supabase.auth.getUser();

      if (data?.user) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    }

    checkUser();
  }, [router, supabase]);

  return <p style={{ padding: 40 }}>Redirecting...</p>;
}
