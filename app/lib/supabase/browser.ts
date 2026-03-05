"use client";

import { createBrowserClient } from "@supabase/ssr";

function getAllCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined") return [];
  const cookie = document.cookie ?? "";
  if (!cookie) return [];

  return cookie.split(";").map((part) => {
    const [rawName, ...rest] = part.trim().split("=");
    const name = decodeURIComponent(rawName ?? "");
    const value = decodeURIComponent(rest.join("=") ?? "");
    return { name, value };
  });
}

function setCookie(name: string, value: string, options?: any) {
  if (typeof document === "undefined") return;

  const opts = options ?? {};
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  cookie += `; Path=${opts.path ?? "/"}`;
  if (opts.maxAge !== undefined) cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.expires) cookie += `; Expires=${new Date(opts.expires).toUTCString()}`;
  if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
  if (opts.secure) cookie += `; Secure`;
  if (opts.domain) cookie += `; Domain=${opts.domain}`;

  document.cookie = cookie;
}

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return getAllCookies();
        },
        setAll(cookies) {
          for (const c of cookies) setCookie(c.name, c.value, c.options);
        },
      },
    }
  );
}
