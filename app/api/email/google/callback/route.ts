import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { writeAuditLog } from "../../../../lib/audit";
import {
  exchangeGoogleCodeForTokens,
  getGmailProfile,
  getGmailSenderEmail,
  upsertGmailConnection,
} from "../../../../lib/email/gmail";

function getOrigin(req: Request) {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function decodeState(value: string | null) {
  try {
    if (!value) return null;
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    const returnTo = String(parsed?.returnTo ?? "");
    if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return { returnTo: "/sales-hub" };
    return { returnTo };
  } catch {
    return null;
  }
}

function redirectWithMessage(req: Request, returnTo: string, type: "success" | "error", message: string) {
  const url = new URL(returnTo || "/sales-hub", req.url);
  url.searchParams.set(type, message);
  const res = NextResponse.redirect(url);
  res.cookies.delete("anns_gmail_oauth_state");
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const savedState = cookies().get("anns_gmail_oauth_state")?.value ?? null;
  const decodedState = decodeState(state);
  const returnTo = decodedState?.returnTo || "/sales-hub";

  try {
    if (!state || !savedState || state !== savedState) {
      return redirectWithMessage(
        req,
        "/sales-hub",
        "error",
        "Gmail connection failed because the security check expired. Please try again."
      );
    }

    const googleError = url.searchParams.get("error");
    if (googleError) return redirectWithMessage(req, returnTo, "error", `Gmail connection cancelled: ${googleError}`);

    const code = url.searchParams.get("code");
    if (!code) return redirectWithMessage(req, returnTo, "error", "Google did not return an OAuth code.");

    const authSupabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();

    if (!user) return redirectWithMessage(req, returnTo, "error", "You must be signed in to finish Gmail connection.");

    const tokens = await exchangeGoogleCodeForTokens({ code, origin: getOrigin(req) });
    const profile = await getGmailProfile(tokens.access_token);
    const expectedEmail = getGmailSenderEmail();

    if (profile.emailAddress !== expectedEmail) {
      return redirectWithMessage(
        req,
        returnTo,
        "error",
        `Google connected as ${profile.emailAddress || "a different account"}. Please reconnect and choose ${expectedEmail}.`
      );
    }

    const admin = createSupabaseAdminClient();
    const connection = await upsertGmailConnection({
      admin,
      emailAddress: profile.emailAddress,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope,
      tokenType: tokens.token_type,
      expiryDate: tokens.expiry_date,
      connectedByUserId: user.id,
      connectedByUsername: fromAuthEmail(user.email ?? null) || null,
    });

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "gmail_sender_connected",
      entity_type: "email_oauth_connection",
      entity_id: connection.id,
      meta: { provider: connection.provider, email_address: connection.email_address },
    });

    return redirectWithMessage(req, returnTo, "success", `Gmail sender connected for ${profile.emailAddress}.`);
  } catch (e: any) {
    return redirectWithMessage(req, returnTo, "error", e?.message || "Could not finish Gmail connection.");
  }
}
