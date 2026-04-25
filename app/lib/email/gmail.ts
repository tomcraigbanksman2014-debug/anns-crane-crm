import type { SupabaseClient } from "@supabase/supabase-js";

export const GMAIL_PROVIDER = "google_gmail";
export const DEFAULT_GMAIL_BATCH_LIMIT = 50;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type GmailConnectionRow = {
  id: string;
  provider: string;
  email_address: string;
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  token_type: string | null;
  expiry_date: string | null;
  connected_by_user_id?: string | null;
  connected_by_username?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SendGmailMessageInput = {
  accessToken: string;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject: string;
  plainText: string;
  html: string;
};

function requiredEnv(name: string) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`Missing Vercel environment variable: ${name}`);
  return value;
}

export function getGoogleClientId() {
  return requiredEnv("GOOGLE_CLIENT_ID");
}

export function getGoogleClientSecret() {
  return requiredEnv("GOOGLE_CLIENT_SECRET");
}

export function getGmailSenderEmail() {
  return String(process.env.GMAIL_SENDER_EMAIL ?? "sales@annscranehire.co.uk")
    .trim()
    .toLowerCase();
}

export function getGoogleRedirectUri(origin?: string | null) {
  const configured = String(process.env.GOOGLE_REDIRECT_URI ?? "").trim();
  if (configured) return configured;

  const safeOrigin = String(origin ?? "").trim().replace(/\/$/, "");
  if (!safeOrigin) throw new Error("Missing GOOGLE_REDIRECT_URI environment variable.");
  return `${safeOrigin}/api/email/google/callback`;
}

export function buildGoogleOAuthUrl(args: {
  state: string;
  origin?: string | null;
  loginHint?: string | null;
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", getGoogleClientId());
  url.searchParams.set("redirect_uri", getGoogleRedirectUri(args.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/gmail.send",
    ].join(" ")
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", args.state);

  const loginHint = String(args.loginHint ?? getGmailSenderEmail()).trim();
  if (loginHint) url.searchParams.set("login_hint", loginHint);

  return url;
}

function expiryDateFromExpiresIn(expiresIn: unknown) {
  const seconds = Math.max(60, Number(expiresIn ?? 3600));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function parseGoogleJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

export async function exchangeGoogleCodeForTokens(args: {
  code: string;
  origin?: string | null;
}) {
  const body = new URLSearchParams();
  body.set("code", args.code);
  body.set("client_id", getGoogleClientId());
  body.set("client_secret", getGoogleClientSecret());
  body.set("redirect_uri", getGoogleRedirectUri(args.origin));
  body.set("grant_type", "authorization_code");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await parseGoogleJson(res)) as TokenResponse;

  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google did not return an access token.");
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    scope: data.scope ?? null,
    token_type: data.token_type ?? "Bearer",
    expiry_date: expiryDateFromExpiresIn(data.expires_in),
  };
}

export async function getGmailProfile(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await parseGoogleJson(res);

  if (!res.ok) {
    throw new Error(data?.error?.message || "Could not read connected Google account email.");
  }

  return {
    emailAddress: String(data?.email ?? "").trim().toLowerCase(),
  };
}

export async function getStoredGmailConnection(admin: SupabaseClient) {
  const email = getGmailSenderEmail();
  const { data, error } = await admin
    .from("email_oauth_connections")
    .select("*")
    .eq("provider", GMAIL_PROVIDER)
    .eq("email_address", email)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as GmailConnectionRow | null;
}

export async function upsertGmailConnection(args: {
  admin: SupabaseClient;
  emailAddress: string;
  accessToken: string;
  refreshToken?: string | null;
  scope?: string | null;
  tokenType?: string | null;
  expiryDate?: string | null;
  connectedByUserId?: string | null;
  connectedByUsername?: string | null;
}) {
  const existing = await getStoredGmailConnection(args.admin).catch(() => null);
  const refreshToken = args.refreshToken || existing?.refresh_token || null;

  const payload = {
    provider: GMAIL_PROVIDER,
    email_address: args.emailAddress.trim().toLowerCase(),
    access_token: args.accessToken,
    refresh_token: refreshToken,
    scope: args.scope ?? existing?.scope ?? null,
    token_type: args.tokenType ?? existing?.token_type ?? "Bearer",
    expiry_date: args.expiryDate ?? null,
    connected_by_user_id: args.connectedByUserId ?? null,
    connected_by_username: args.connectedByUsername ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await args.admin
    .from("email_oauth_connections")
    .upsert(payload, { onConflict: "provider,email_address" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as GmailConnectionRow;
}

function tokenIsStillFresh(expiryDate: string | null | undefined) {
  if (!expiryDate) return false;
  const time = new Date(expiryDate).getTime();
  if (Number.isNaN(time)) return false;
  return time > Date.now() + 90 * 1000;
}

export async function getFreshGmailAccessToken(admin: SupabaseClient) {
  const connection = await getStoredGmailConnection(admin);

  if (!connection?.access_token) {
    throw new Error("Gmail is not connected yet. Connect the sales mailbox first.");
  }

  if (tokenIsStillFresh(connection.expiry_date)) {
    return { accessToken: connection.access_token, connection };
  }

  if (!connection.refresh_token) {
    throw new Error("Gmail connection has expired and no refresh token is stored. Reconnect Gmail.");
  }

  const body = new URLSearchParams();
  body.set("client_id", getGoogleClientId());
  body.set("client_secret", getGoogleClientSecret());
  body.set("refresh_token", connection.refresh_token);
  body.set("grant_type", "refresh_token");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await parseGoogleJson(res)) as TokenResponse;

  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Could not refresh Gmail access token.");
  }

  const { data: updated, error } = await admin
    .from("email_oauth_connections")
    .update({
      access_token: data.access_token,
      scope: data.scope ?? connection.scope,
      token_type: data.token_type ?? connection.token_type ?? "Bearer",
      expiry_date: expiryDateFromExpiresIn(data.expires_in),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return {
    accessToken: data.access_token,
    connection: updated as GmailConnectionRow,
  };
}

function cleanHeader(value: string) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  const cleaned = cleanHeader(value);
  if (!cleaned) return "";
  if (/^[\x20-\x7E]+$/.test(cleaned)) return cleaned;
  return `=?UTF-8?B?${Buffer.from(cleaned, "utf8").toString("base64")}?=`;
}

function formatAddress(email: string, name?: string | null) {
  const cleanEmail = cleanHeader(email).replace(/[<>]/g, "").trim();
  const cleanName = cleanHeader(String(name ?? "")).replace(/"/g, "'").trim();
  if (!cleanName) return `<${cleanEmail}>`;
  if (/^[\x20-\x7E]+$/.test(cleanName)) return `"${cleanName}" <${cleanEmail}>`;
  return `${encodeHeader(cleanName)} <${cleanEmail}>`;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normaliseLineEndings(value: string) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r\n");
}

export function buildRawGmailMessage(input: Omit<SendGmailMessageInput, "accessToken">) {
  const boundary = `anns-crm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const message = [
    `From: ${formatAddress(input.fromEmail, input.fromName || "AnnS Crane Hire")}`,
    `To: ${formatAddress(input.toEmail)}`,
    `Subject: ${encodeHeader(input.subject || "AnnS Crane Hire")}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normaliseLineEndings(input.plainText || ""),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normaliseLineEndings(input.html || ""),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return base64UrlEncode(message);
}

export async function sendGmailMessage(input: SendGmailMessageInput) {
  const raw = buildRawGmailMessage({
    fromEmail: input.fromEmail,
    fromName: input.fromName,
    toEmail: input.toEmail,
    subject: input.subject,
    plainText: input.plainText,
    html: input.html,
  });

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const data = await parseGoogleJson(res);

  if (!res.ok) {
    throw new Error(data?.error?.message || "Gmail send failed.");
  }

  return {
    id: String(data?.id ?? ""),
    threadId: String(data?.threadId ?? ""),
  };
}
