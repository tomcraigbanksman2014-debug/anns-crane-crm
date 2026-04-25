import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { canCreateCustomers, getAccessContext } from "../../../../lib/access";
import { buildGoogleOAuthUrl, getGmailSenderEmail } from "../../../../lib/email/gmail";

function getOrigin(req: Request) {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

function safeReturnTo(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/sales-hub";
  return raw;
}

function encodeState(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export async function GET(req: Request) {
  try {
    const access = await getAccessContext();

    if (!access.user) return NextResponse.redirect(new URL("/login", req.url));

    if (!canCreateCustomers(access)) {
      const denied = new URL("/sales-hub", req.url);
      denied.searchParams.set("error", "You do not have permission to connect the Gmail sender.");
      return NextResponse.redirect(denied);
    }

    const url = new URL(req.url);
    const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
    const state = encodeState({ nonce: randomUUID(), returnTo, createdAt: Date.now() });

    const oauthUrl = buildGoogleOAuthUrl({
      state,
      origin: getOrigin(req),
      loginHint: getGmailSenderEmail(),
    });

    const res = NextResponse.redirect(oauthUrl);
    res.cookies.set("anns_gmail_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 10 * 60,
    });

    return res;
  } catch (e: any) {
    const failed = new URL("/sales-hub", req.url);
    failed.searchParams.set("error", e?.message || "Could not start Gmail connection.");
    return NextResponse.redirect(failed);
  }
}
