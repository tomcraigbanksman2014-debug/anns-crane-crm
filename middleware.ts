import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function getSecret() {
  return process.env.ADMIN_CREATE_USER_TOKEN || "";
}

function base64UrlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToBuffer(s: string) {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((s.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function sign(value: string, secret: string) {
  const payload = base64UrlEncode(Buffer.from(value, "utf8"));
  const sig = base64UrlEncode(
    crypto.createHmac("sha256", secret).update(payload).digest()
  );
  return `${payload}.${sig}`;
}

function verify(token: string, secret: string) {
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payload, sig] = parts;

  const expected = base64UrlEncode(
    crypto.createHmac("sha256", secret).update(payload).digest()
  );

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);

  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  const decoded = base64UrlDecodeToBuffer(payload).toString("utf8");
  return decoded === "admin";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage = pathname.startsWith("/admin");
  const isAdminLoginPage = pathname === "/admin/login";
  const isAdminApi = pathname.startsWith("/api/admin");

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const secret = getSecret();

  const cookie = req.cookies.get("ac_admin")?.value || "";
  const isAuthedAdmin = cookie ? verify(cookie, secret) : false;

  // Already logged in admin → skip login page
  if (isAdminLoginPage && isAuthedAdmin) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/users";
    return NextResponse.redirect(url);
  }

  // Protect admin pages
  if (isAdminPage && !isAdminLoginPage) {
    if (!isAuthedAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  // Protect admin API routes
  if (isAdminApi) {
    if (pathname === "/api/admin/login") {
      return NextResponse.next();
    }

    if (!isAuthedAdmin) {
      return NextResponse.json(
        { error: "Admin auth required" },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
