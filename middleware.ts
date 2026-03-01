import { NextRequest, NextResponse } from "next/server";

/**
 * Staff auth cookie (set by /api/login)
 */
const STAFF_COOKIE = "staff_user";

/**
 * Admin auth cookie (set by /api/admin/login)
 */
const ADMIN_COOKIE = "ac_admin";

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png"
  );
}

function isAdminLoginPath(pathname: string) {
  return pathname === "/admin/login" || pathname.startsWith("/api/admin/login");
}

function isAdminProtected(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
}

function isStaffProtected(pathname: string) {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/bookings") ||
    pathname.startsWith("/customers") ||
    pathname.startsWith("/equipment") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/settings")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public assets + login endpoint + login page
  if (isPublicPath(pathname)) return NextResponse.next();

  // ✅ Admin routes (separate auth)
  if (isAdminLoginPath(pathname)) return NextResponse.next();

  if (isAdminProtected(pathname)) {
    const admin = req.cookies.get(ADMIN_COOKIE)?.value;
    if (!admin) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ✅ Staff routes (staff cookie required)
  if (isStaffProtected(pathname)) {
    const staff = req.cookies.get(STAFF_COOKIE)?.value;
    if (!staff) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
