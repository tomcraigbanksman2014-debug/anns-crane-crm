import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = [
  "/login",
  "/favicon.ico",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.png",
  "/offline.html",
];

const PUBLIC_PATH_PREFIXES = [
  "/unsubscribe",
  "/api/marketing/unsubscribe",
  "/subcontractor-onboarding",
  "/api/subcontractor-onboarding",
];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;

  for (const publicPrefix of PUBLIC_PATH_PREFIXES) {
    if (pathname === publicPrefix || pathname.startsWith(`${publicPrefix}/`)) {
      return true;
    }
  }

  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/storage")) return true;
  if (pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|css|js|map)$/)) return true;

  return false;
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: any) {
          response.cookies.set({
            name,
            value: "",
            ...options,
            maxAge: 0,
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const mustChangePassword = Boolean(
    (user.user_metadata as any)?.must_change_password === true
  );

  if (mustChangePassword) {
    const isAllowedPath = pathname === "/change-password";

    if (!isAllowedPath && !isApiPath(pathname)) {
      const changePasswordUrl = request.nextUrl.clone();
      changePasswordUrl.pathname = "/change-password";
      return NextResponse.redirect(changePasswordUrl);
    }
  }

  if (!mustChangePassword && pathname === "/change-password") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)",
  ],
};
