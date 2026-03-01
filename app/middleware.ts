import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function getSecret() {
  // We re-use your existing secret env var to validate the cookie signature
  return process.env.ADMIN_CREATE_USER_TOKEN || "";
}

function base64urlToBuffer(s: string) {
  // pad base64
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  return Buffer.from(s, "base64");
}

function verifyToken(token: string, secret: string) {
  // token = <payload>.<sig>
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, sig] = parts;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest();

  const providedSig = base64urlToBuffer(sig);

  // timing-safe compare
  if (providedSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;

  // decode payload
  const payloadJson = base64urlToBuffer(payload).toString("utf8");
  const obj = JSON.parse(payloadJson);

  const now = Math.floor(Date.now() / 1000);
  if (!obj?.exp || now > obj.exp) return null;

  return obj;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths:
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo.png");

  if (isPublic) return NextResponse.next();

  // Protect these app sections:
  const protectedPaths = [
    "/dashboard",
    "/customers",
    "/bookings",
    "/equipment",
    "/calendar",
    "/settings",
    "/admin",
  ];

  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtected) {
    // Allow other routes to render if you add marketing pages later
    return NextResponse.next();
  }

  const secret = getSecret();
  if (!secret) {
    // If secret missing, fail closed:
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const token = req.cookies.get("staff_session")?.value;
  const valid = token ? verifyToken(token, secret) : null;

  if (!valid) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // run middleware on all paths except static assets handled above
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
