import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase SSR middleware (Edge-safe):
 * - Refreshes session cookies on every request
 * - Protects all app pages except / and /login
 * - Restricts /admin/* to users with user_metadata.role === "admin"
 *
 * IMPORTANT: We intentionally exclude /api from the matcher so API routes
 * can handle auth themselves (Bearer token or cookie).
 */
export async function middleware(req: NextRequest) {
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

  // Create a response we can attach refreshed cookies to
  let res = NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookies) {
        // Attach cookies to the response (this is how session refresh works)
        cookies.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  // IMPORTANT: this will refresh the session if needed and set cookies in `res`
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in -> force login for all protected pages
  if (!user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only area
  if (pathname.startsWith("/admin")) {
    const role = (user.user_metadata as any)?.role;
    if (role !== "admin") {
      const dashUrl = req.nextUrl.clone();
      dashUrl.pathname = "/dashboard";
      return NextResponse.redirect(dashUrl);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
