import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
