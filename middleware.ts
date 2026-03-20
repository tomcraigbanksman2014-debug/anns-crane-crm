import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isMasterAdminEmail } from "./app/lib/admin";

const PUBLIC_PATHS = [
  "/login",
  "/favicon.ico",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.png",
  "/offline.html",
];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/api/health")) return true;
  if (pathname.startsWith("/storage")) return true;
  if (pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|css|js|map)$/)) return true;
  return false;
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function isOperatorArea(pathname: string) {
  return pathname.startsWith("/operator");
}

function isAdminArea(pathname: string) {
  return pathname.startsWith("/admin");
}

function isOfficeOnlyPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/search")) return true;
  if (pathname.startsWith("/jobs")) return true;
  if (pathname.startsWith("/transport-jobs")) return true;
  if (pathname.startsWith("/transport-planner")) return true;
  if (pathname.startsWith("/transport-map")) return true;
  if (pathname.startsWith("/vehicles")) return true;
  if (pathname.startsWith("/cranes")) return true;
  if (pathname.startsWith("/timesheets")) return true;
  if (pathname.startsWith("/quotes")) return true;
  if (pathname.startsWith("/customers")) return true;
  if (pathname.startsWith("/equipment")) return true;
  if (pathname.startsWith("/operators")) return true;
  if (pathname.startsWith("/suppliers")) return true;
  if (pathname.startsWith("/purchase-orders")) return true;
  if (pathname.startsWith("/calendar")) return true;
  if (pathname.startsWith("/planner")) return true;
  if (pathname.startsWith("/settings")) return true;
  if (pathname.startsWith("/admin")) return true;
  return false;
}

async function resolveUserRole(
  supabase: any,
  user: any
): Promise<"admin" | "staff" | "operator" | ""> {
  const email = String(user?.email ?? "").trim().toLowerCase();
  const usernameFromEmail = fromAuthEmail(user?.email ?? null).toLowerCase();

  if (isMasterAdminEmail(email)) {
    return "admin";
  }

  let resolvedRole = String(user?.user_metadata?.role ?? "").trim().toLowerCase() as
    | "admin"
    | "staff"
    | "operator"
    | "";

  if (resolvedRole === "operator") {
    return "operator";
  }

  const { data: operators } = await supabase
    .from("operators")
    .select("id, full_name, email, status")
    .eq("status", "active");

  const matchedOperator =
    (operators ?? []).find((op: any) => {
      const operatorEmail = String(op.email ?? "").trim().toLowerCase();
      const operatorName = String(op.full_name ?? "").trim().toLowerCase();

      return (
        (!!operatorEmail && operatorEmail === email) ||
        (!!operatorName && operatorName === usernameFromEmail) ||
        (!!usernameFromEmail && !!operatorEmail && operatorEmail.startsWith(`${usernameFromEmail}@`))
      );
    }) ?? null;

  if (matchedOperator) {
    return "operator";
  }

  if (resolvedRole === "admin") return "admin";
  if (resolvedRole === "staff") return "staff";

  return "";
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
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const resolvedRole = await resolveUserRole(supabase, user);

  if (resolvedRole === "operator") {
    if (isOfficeOnlyPath(pathname) && !isOperatorArea(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/operator/jobs";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isAdminArea(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/operator/jobs";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (resolvedRole === "staff") {
    if (isAdminArea(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isOperatorArea(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (resolvedRole === "admin") {
    if (isOperatorArea(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (!resolvedRole) {
    if (isAdminArea(pathname) || isOperatorArea(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)",
  ],
};
