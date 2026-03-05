import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isPublicPath(pathname: string) {
  if (pathname === "/" || pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  // Static assets in /public are served from the root
  if (pathname === "/logo.png") return true;
  // Common static extensions
  if (pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|txt|xml)$/i)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public paths and static assets
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  let res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookies) {
          for (const c of cookies) {
            res.cookies.set(c.name, c.value, c.options);
          }
        },
      },
    }
  );

  // This will also refresh the session cookie if needed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Optional: preserve original destination
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Admin-only routes
  if (pathname.startsWith("/admin")) {
    const role = (user.user_metadata as any)?.role;
    if (role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
