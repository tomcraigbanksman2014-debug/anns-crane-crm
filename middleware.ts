import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Always allow public routes + assets
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/admin") || // <-- allow admin page to open (no staff cookie required)
    pathname.startsWith("/api") || // allow API routes to be called
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png"
  ) {
    return NextResponse.next();
  }

  // ✅ Protect everything else with staff session cookie
  const staffUser = req.cookies.get("staff_user")?.value;

  if (!staffUser) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
