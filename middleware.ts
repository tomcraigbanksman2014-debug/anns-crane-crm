import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isPasswordExpired(passwordChangedAt?: string | null) {
  if (!passwordChangedAt) return false;
  const changed = new Date(passwordChangedAt);
  if (Number.isNaN(changed.getTime())) return false;

  const now = new Date();
  const msInDay = 1000 * 60 * 60 * 24;
  const ageDays = (now.getTime() - changed.getTime()) / msInDay;

  return ageDays >= 183;
}

function isMasterAdminEmail(email?: string | null) {
  const masterAdminEmail = String(process.env.MASTER_ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();

  return !!email && !!masterAdminEmail && email.toLowerCase() === masterAdminEmail;
}

function isPublicAsset(pathname: string) {
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/change-password") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/site.webmanifest" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/logo.png" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/icon.png"
  ) {
    return true;
  }

  if (
    pathname.startsWith("/icon-") ||
    pathname.startsWith("/favicon-") ||
    pathname.startsWith("/web-app-manifest-")
  ) {
    return true;
  }

  if (
    pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|txt|webmanifest)$/i)
  ) {
    return true;
  }

  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicAsset(pathname)) {
    return NextResponse.next({
      request: {
        headers: req.headers,
      },
    });
  }

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const isMaster = isMasterAdminEmail(user.email ?? null);
  const mustChangePassword =
    !isMaster && !!(user.user_metadata as any)?.must_change_password;

  const passwordChangedAt = (user.user_metadata as any)?.password_changed_at ?? null;
  const passwordExpired = !isMaster && isPasswordExpired(passwordChangedAt);

  if ((mustChangePassword || passwordExpired) && !pathname.startsWith("/change-password")) {
    const url = req.nextUrl.clone();
    url.pathname = "/change-password";
    return NextResponse.redirect(url);
  }

  if (!mustChangePassword && !passwordExpired && pathname.startsWith("/change-password")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin")) {
    const role = (user.user_metadata as any)?.role;
    if (role !== "admin" && !isMaster) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image).*)"],
};
