// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isProtectedPath(pathname: string) {
  // Anything that should require login
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/customers") ||
    pathname.startsWith("/equipment") ||
    pathname.startsWith("/bookings") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/admin")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public pages
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api") || // let API routes handle their own auth
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo.png")
  ) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  // Supabase SSR client that CAN write cookies (middleware is allowed)
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

  // If route is protected, require an authenticated user
  if (isProtectedPath(pathname)) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
