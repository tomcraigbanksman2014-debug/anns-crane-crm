import { NextRequest, NextResponse } from "next/server";

function getCookie(req: NextRequest, name: string) {
  const v = req.cookies.get(name)?.value;
  return v ?? null;
}

// Supabase stores the access token in a cookie like:
// sb-<project-ref>-auth-token
function findSupabaseAuthCookie(req: NextRequest) {
  const all = req.cookies.getAll();
  const hit = all.find((c) => c.name.includes("-auth-token"));
  return hit?.value ?? null;
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public + Next internal
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next();
  }

  // If no supabase auth cookie -> force login
  const authCookie = findSupabaseAuthCookie(req);
  if (!authCookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Optional: enforce admin-only for /admin/*
  if (pathname.startsWith("/admin")) {
    // The cookie is JSON with access_token in many setups
    // Sometimes it may be a raw JWT; handle both.
    let accessToken: string | null = null;

    try {
      const parsed = JSON.parse(authCookie);
      accessToken = parsed?.access_token ?? null;
    } catch {
      accessToken = authCookie; // assume raw token
    }

    const payload = accessToken ? decodeJwtPayload(accessToken) : null;
    const role = payload?.user_metadata?.role;

    if (role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
