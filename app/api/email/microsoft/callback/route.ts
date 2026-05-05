import { NextRequest, NextResponse } from "next/server";
import {
  exchangeMicrosoftAuthorisationCode,
  getMicrosoftProfile,
  saveMicrosoftDelegatedConnection,
} from "../../../../lib/email/microsoftGraph";
import { requireAdminApi } from "../../../../lib/routeGuards";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { writeAuditLog } from "../../../../lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fromAuthEmail(email: string | null | undefined) {
  const raw = String(email ?? "").trim();
  if (!raw) return "";
  return raw.includes("@") ? raw.split("@")[0] : raw;
}

function redirectToSystemHealth(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/settings/system-health", request.nextUrl.origin);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = NextResponse.redirect(url);

  response.cookies.set("microsoft_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set("microsoft_expected_sender", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const microsoftError = searchParams.get("error");
  const microsoftErrorDescription = searchParams.get("error_description");

  if (microsoftError) {
    return redirectToSystemHealth(request, {
      microsoft: "error",
      message: microsoftErrorDescription || microsoftError || "Microsoft sign-in was cancelled or failed.",
    });
  }

  const code = String(searchParams.get("code") ?? "").trim();
  const state = String(searchParams.get("state") ?? "").trim();
  const expectedState = String(request.cookies.get("microsoft_oauth_state")?.value ?? "").trim();

  if (!code) {
    return redirectToSystemHealth(request, {
      microsoft: "error",
      message: "Microsoft did not return an authorisation code.",
    });
  }

  if (!state || !expectedState || state !== expectedState) {
    return redirectToSystemHealth(request, {
      microsoft: "error",
      message: "Microsoft connection state check failed. Please try connecting the mailbox again.",
    });
  }

  const auth = await requireAdminApi();

  if (auth.response || !auth.ctx?.user) {
    return redirectToSystemHealth(request, {
      microsoft: "error",
      message: "You must be signed in as an admin to finish connecting the Microsoft mailbox.",
    });
  }

  try {
    const admin = createSupabaseAdminClient();

    const token = await exchangeMicrosoftAuthorisationCode({
      code,
      origin: request.nextUrl.origin,
    });

    const profile = await getMicrosoftProfile(String(token.access_token));

    const connectedByUsername = fromAuthEmail(auth.ctx.user.email ?? null);

    const connection = await saveMicrosoftDelegatedConnection({
      admin,
      token,
      profile,
      connectedByUserId: auth.ctx.user.id ?? null,
      connectedByUsername: connectedByUsername || null,
    });

    await writeAuditLog({
      actor_user_id: auth.ctx.user.id ?? null,
      actor_username: connectedByUsername || null,
      action: "microsoft_mailbox_connected",
      entity_type: "email_connection",
      entity_id: "microsoft_delegated",
      meta: {
        email_address: connection.email_address,
        microsoft_user_id: connection.microsoft_user_id,
        display_name: connection.display_name,
        provider: connection.provider,
      },
    });

    return redirectToSystemHealth(request, {
      microsoft: "connected",
      message: `Microsoft mailbox connected as ${connection.email_address}.`,
    });
  } catch (error: any) {
    return redirectToSystemHealth(request, {
      microsoft: "error",
      message: error?.message || "Could not finish Microsoft mailbox connection.",
    });
  }
}
