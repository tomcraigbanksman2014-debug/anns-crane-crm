import { NextRequest, NextResponse } from "next/server";

// Supabase stores the session in cookies like: sb-<project-ref>-auth-token
// Some setups chunk it: sb-...-auth-token.0 / .1 etc.
function hasSupabaseAuthCookie(req: NextRequest) {
  return req.cookies.getAll().some((c) => c.name.includes("-auth-token"));
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

function findAnyAuthTokenValue(req: NextRequest) {
  // If cookies are chunked, any one cookie will exist but may be partial.
  // For admin gating, we’ll try to parse JSON if possible; otherwise we won’t hard-block.
  const hit = req.cookies.getAll().find((c) => c.name.includes("-auth-token"));
  return hit?.value ?? null;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Always allow Next internals + public assets + API routes
  // (We protect APIs inside the route handlers themselves.)
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/public") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  // Require auth cookie for app pages
  if (!hasSupabaseAuthCookie(req)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Optional: admin-only gate for /admin/*
  if (pathname.startsWith("/admin")) {
    const raw = findAnyAuthTokenValue(req);

    let accessToken: string | null = null;

    // Some setups store a JSON blob that includes access_token
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        accessToken = parsed?.access_token ?? null;
      } catch {
        // Might already be a JWT
        accessToken = raw;
      }
    }

    const payload = accessToken ? decodeJwtPayload(accessToken) : null;
    const role = payload?.user_metadata?.role;

    // If we can't reliably detect role, don't hard-block here.
    // Admin routes should ALSO check role server-side if needed.
    if (role && role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
