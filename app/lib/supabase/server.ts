// app/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Component-safe Supabase client:
 * - Can READ cookies
 * - MUST NOT WRITE cookies (Next.js restriction)
 *
 * If you need cookie writes (session refresh), do it in:
 * - middleware.ts (recommended), or
 * - a Route Handler / Server Action
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // IMPORTANT: no-op in Server Components to avoid:
        // "Cookies can only be modified in a Server Action or Route Handler"
        setAll() {},
      },
    }
  );
}
