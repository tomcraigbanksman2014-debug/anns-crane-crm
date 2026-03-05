import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/public")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public pages
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Create a response we can attach refreshed cookies to
  let res = NextResponse.next();

  // Supabase SSR server client that can READ + WRITE cookies in middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // This refreshes session if needed and ensures cookies exist
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not signed in → force login
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Optional: admin-only gating for /admin/*
  if (pathname.startsWith("/admin")) {
    const role = (user.user_metadata as any)?.role;
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return res;
}

export const config = {
  // ✅ Do NOT run middleware on /api routes (prevents weird auth issues)
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
