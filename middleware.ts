import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isPasswordExpired(passwordChangedAt?: string | null) {
  if (!passwordChangedAt) return false;
  const changed = new Date(passwordChangedAt);
  if (Number.isNaN(changed.getTime())) return false;

  const now = new Date();
  const msInDay = 1000 * 60 * 60 * 24;
  const ageDays = (now.getTime() - changed.getTime()) / msInDay;

  return ageDays >= 183; // approx 6 months
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/logo.png") ||
    pathname.startsWith("/public");

  if (isPublic) {
    return res;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const mustChangePassword = !!(user.user_metadata as any)?.must_change_password;
  const passwordChangedAt = (user.user_metadata as any)?.password_changed_at ?? null;
  const passwordExpired = isPasswordExpired(passwordChangedAt);

  // Force password change except when already on change-password page
  if ((mustChangePassword || passwordExpired) && !pathname.startsWith("/change-password")) {
    const url = req.nextUrl.clone();
    url.pathname = "/change-password";
    return NextResponse.redirect(url);
  }

  // If already compliant, don't let them sit on change-password unnecessarily
  if (!mustChangePassword && !passwordExpired && pathname.startsWith("/change-password")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
