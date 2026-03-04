import { NextRequest, NextResponse } from "next/server";

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

  // Only guard admin routes in middleware (stops dashboard flashing + redirect loop)
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // Allow admin login page without auth
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Require Supabase auth cookie for /admin/*
  const authCookie = findSupabaseAuthCookie(req);
  if (!authCookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Auth cookie may be JSON containing access_token
  let accessToken: string | null = null;
  try {
    const parsed = JSON.parse(authCookie);
    accessToken = parsed?.access_token ?? null;
  } catch {
    accessToken = authCookie;
  }

  const payload = accessToken ? decodeJwtPayload(accessToken) : null;
  const role = payload?.user_metadata?.role;

  if (role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
