import { NextRequest, NextResponse } from "next/server";
import {
  buildMicrosoftAuthorisationUrl,
  getMicrosoftSenderEmail,
  microsoftDelegatedOAuthConfigured,
} from "../../../../lib/email/microsoftGraph";
import { requireAdminApi } from "../../../../lib/routeGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToSystemHealth(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/settings/system-health", request.nextUrl.origin);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();

  if (auth.response) {
    return redirectToSystemHealth(request, {
      microsoft: "error",
      message: "You must be signed in as an admin to connect the Microsoft mailbox.",
    });
  }

  try {
    if (!microsoftDelegatedOAuthConfigured()) {
      return redirectToSystemHealth(request, {
        microsoft: "error",
        message: "Microsoft OAuth is not configured. Add MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in Vercel first.",
      });
    }

    const state = `${Date.now()}-${crypto.randomUUID()}`;
    const authUrl = buildMicrosoftAuthorisationUrl({
      origin: request.nextUrl.origin,
      state,
    });

    const response = NextResponse.redirect(authUrl);

    response.cookies.set("microsoft_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 10 * 60,
    });

    response.cookies.set("microsoft_expected_sender", getMicrosoftSenderEmail(), {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 10 * 60,
    });

    return response;
  } catch (error: any) {
    return redirectToSystemHealth(request, {
      microsoft: "error",
      message: error?.message || "Could not start Microsoft mailbox connection.",
    });
  }
}
