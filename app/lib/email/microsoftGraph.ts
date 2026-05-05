import type { SupabaseClient } from "@supabase/supabase-js";

export const MICROSOFT_PROVIDER = "microsoft_graph";
export const MICROSOFT_DELEGATED_PROVIDER = "microsoft_delegated";
export const DEFAULT_MICROSOFT_BATCH_LIMIT = 50;

type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type MicrosoftProfile = {
  id?: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string | null;
};

type StoredMicrosoftConnection = {
  id: boolean;
  provider: string;
  email_address: string;
  microsoft_user_id: string | null;
  display_name: string | null;
  tenant_id: string | null;
  scopes: string | null;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
  connected_by_user_id: string | null;
  connected_by_username: string | null;
  connected_at: string | null;
  updated_at: string | null;
};

function env(name: string) {
  return String(process.env[name] ?? "").trim();
}

function nowPlusSeconds(seconds: number) {
  return new Date(Date.now() + Math.max(60, seconds - 120) * 1000).toISOString();
}

function isFutureIso(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now() + 60_000;
}

function normaliseEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function getMicrosoftTenantId() {
  const value = env("MICROSOFT_TENANT_ID") || env("AZURE_TENANT_ID");
  if (!value) throw new Error("MICROSOFT_TENANT_ID is not configured.");
  return value;
}

export function getMicrosoftClientId() {
  const value = env("MICROSOFT_CLIENT_ID") || env("AZURE_CLIENT_ID");
  if (!value) throw new Error("MICROSOFT_CLIENT_ID is not configured.");
  return value;
}

export function getMicrosoftClientSecret() {
  const value = env("MICROSOFT_CLIENT_SECRET") || env("AZURE_CLIENT_SECRET");
  if (!value) throw new Error("MICROSOFT_CLIENT_SECRET is not configured.");
  return value;
}

export function getMicrosoftSenderEmail() {
  return env("MICROSOFT_SENDER_EMAIL") || env("OUTLOOK_SENDER_EMAIL") || "sales@annscranehire.co.uk";
}

export function getMicrosoftRedirectUri(origin?: string) {
  const explicit = env("MICROSOFT_REDIRECT_URI");
  if (explicit) return explicit;

  if (!origin) {
    throw new Error("MICROSOFT_REDIRECT_URI is not configured and no request origin was available.");
  }

  return `${origin.replace(/\/+$/g, "")}/api/email/microsoft/callback`;
}

export function microsoftGraphConfigured() {
  return Boolean(
    (env("MICROSOFT_TENANT_ID") || env("AZURE_TENANT_ID")) &&
      (env("MICROSOFT_CLIENT_ID") || env("AZURE_CLIENT_ID")) &&
      (env("MICROSOFT_CLIENT_SECRET") || env("AZURE_CLIENT_SECRET")) &&
      getMicrosoftSenderEmail()
  );
}

export function microsoftDelegatedOAuthConfigured() {
  return Boolean(
    (env("MICROSOFT_TENANT_ID") || env("AZURE_TENANT_ID")) &&
      (env("MICROSOFT_CLIENT_ID") || env("AZURE_CLIENT_ID")) &&
      (env("MICROSOFT_CLIENT_SECRET") || env("AZURE_CLIENT_SECRET"))
  );
}

export function getMicrosoftDelegatedScopes() {
  return ["offline_access", "User.Read", "Mail.Send"].join(" ");
}

function tokenEndpoint() {
  return `https://login.microsoftonline.com/${encodeURIComponent(getMicrosoftTenantId())}/oauth2/v2.0/token`;
}

export function buildMicrosoftAuthorisationUrl(args: {
  origin: string;
  state: string;
}) {
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(getMicrosoftTenantId())}/oauth2/v2.0/authorize`);

  url.searchParams.set("client_id", getMicrosoftClientId());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getMicrosoftRedirectUri(args.origin));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", getMicrosoftDelegatedScopes());
  url.searchParams.set("state", args.state);
  url.searchParams.set("prompt", "select_account");

  return url.toString();
}

async function parseMicrosoftJson(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function exchangeMicrosoftToken(body: URLSearchParams): Promise<MicrosoftTokenResponse> {
  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await parseMicrosoftJson(res)) as MicrosoftTokenResponse;

  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "Could not get Microsoft Graph access token.");
  }

  return data;
}

export async function exchangeMicrosoftAuthorisationCode(args: {
  code: string;
  origin: string;
}) {
  const body = new URLSearchParams();
  body.set("client_id", getMicrosoftClientId());
  body.set("client_secret", getMicrosoftClientSecret());
  body.set("code", args.code);
  body.set("redirect_uri", getMicrosoftRedirectUri(args.origin));
  body.set("grant_type", "authorization_code");
  body.set("scope", getMicrosoftDelegatedScopes());

  const token = await exchangeMicrosoftToken(body);

  if (!token.refresh_token) {
    throw new Error("Microsoft did not return a refresh token. Make sure offline_access is included and reconnect the mailbox.");
  }

  return token;
}

async function refreshMicrosoftDelegatedToken(refreshToken: string) {
  const body = new URLSearchParams();
  body.set("client_id", getMicrosoftClientId());
  body.set("client_secret", getMicrosoftClientSecret());
  body.set("refresh_token", refreshToken);
  body.set("grant_type", "refresh_token");
  body.set("scope", getMicrosoftDelegatedScopes());

  return exchangeMicrosoftToken(body);
}

export async function getMicrosoftProfile(accessToken: string): Promise<MicrosoftProfile> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const data = (await parseMicrosoftJson(res)) as MicrosoftProfile & any;

  if (!res.ok) {
    throw new Error(data?.error?.message || data?.error_description || data?.error || "Could not read Microsoft mailbox profile.");
  }

  return data;
}

export async function readMicrosoftDelegatedConnection(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("microsoft_mailbox_connections")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if (String(error.message || "").toLowerCase().includes("does not exist")) return null;
    throw new Error(error.message);
  }

  return (data ?? null) as StoredMicrosoftConnection | null;
}

export async function saveMicrosoftDelegatedConnection(args: {
  admin: SupabaseClient;
  token: MicrosoftTokenResponse;
  profile: MicrosoftProfile;
  connectedByUserId: string | null;
  connectedByUsername: string | null;
}) {
  const email = normaliseEmail(args.profile.mail || args.profile.userPrincipalName);
  const expected = normaliseEmail(getMicrosoftSenderEmail());

  if (!email) {
    throw new Error("Microsoft account did not return an email address.");
  }

  if (expected && email !== expected) {
    throw new Error(`Signed in as ${email}, but CRM is configured to send from ${expected}. Sign in with the sales mailbox.`);
  }

  const expiresAt = nowPlusSeconds(Number(args.token.expires_in ?? 3600));

  const { data, error } = await args.admin
    .from("microsoft_mailbox_connections")
    .upsert(
      {
        id: true,
        provider: MICROSOFT_DELEGATED_PROVIDER,
        email_address: email,
        microsoft_user_id: args.profile.id ?? null,
        display_name: args.profile.displayName ?? null,
        tenant_id: getMicrosoftTenantId(),
        scopes: args.token.scope ?? getMicrosoftDelegatedScopes(),
        refresh_token: args.token.refresh_token,
        access_token: args.token.access_token ?? null,
        expires_at: expiresAt,
        connected_by_user_id: args.connectedByUserId,
        connected_by_username: args.connectedByUsername,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as StoredMicrosoftConnection;
}

async function getFreshDelegatedAccessToken(admin: SupabaseClient, connection: StoredMicrosoftConnection) {
  if (connection.access_token && isFutureIso(connection.expires_at)) {
    return {
      accessToken: connection.access_token,
      connection: {
        id: MICROSOFT_DELEGATED_PROVIDER,
        email_address: connection.email_address,
        provider: MICROSOFT_DELEGATED_PROVIDER,
        mode: "delegated" as const,
        connectedByUsername: connection.connected_by_username ?? null,
        updatedAt: connection.updated_at ?? null,
      },
    };
  }

  const token = await refreshMicrosoftDelegatedToken(connection.refresh_token);
  const nextRefreshToken = token.refresh_token || connection.refresh_token;
  const expiresAt = nowPlusSeconds(Number(token.expires_in ?? 3600));

  const { data, error } = await admin
    .from("microsoft_mailbox_connections")
    .update({
      refresh_token: nextRefreshToken,
      access_token: token.access_token,
      scopes: token.scope ?? connection.scopes,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const updated = data as StoredMicrosoftConnection;

  return {
    accessToken: String(token.access_token),
    connection: {
      id: MICROSOFT_DELEGATED_PROVIDER,
      email_address: updated.email_address,
      provider: MICROSOFT_DELEGATED_PROVIDER,
      mode: "delegated" as const,
      connectedByUsername: updated.connected_by_username ?? null,
      updatedAt: updated.updated_at ?? null,
    },
  };
}

async function getFreshApplicationAccessToken() {
  const body = new URLSearchParams();
  body.set("client_id", getMicrosoftClientId());
  body.set("client_secret", getMicrosoftClientSecret());
  body.set("scope", "https://graph.microsoft.com/.default");
  body.set("grant_type", "client_credentials");

  const token = await exchangeMicrosoftToken(body);

  return {
    accessToken: String(token.access_token),
    connection: {
      id: MICROSOFT_PROVIDER,
      email_address: getMicrosoftSenderEmail(),
      provider: MICROSOFT_PROVIDER,
      mode: "application" as const,
      connectedByUsername: null,
      updatedAt: null,
    },
  };
}

export async function getFreshMicrosoftGraphAccessToken(admin?: SupabaseClient) {
  if (admin) {
    const connection = await readMicrosoftDelegatedConnection(admin);
    if (connection?.refresh_token) {
      return getFreshDelegatedAccessToken(admin, connection);
    }
  }

  return getFreshApplicationAccessToken();
}

export async function disconnectMicrosoftDelegatedConnection(admin: SupabaseClient) {
  const { error } = await admin
    .from("microsoft_mailbox_connections")
    .delete()
    .eq("id", true);

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendMicrosoftRawMimeMessage(args: {
  accessToken: string;
  senderEmail: string;
  mime: string;
  sendAsMe?: boolean;
}) {
  const endpoint = args.sendAsMe
    ? "https://graph.microsoft.com/v1.0/me/sendMail"
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(args.senderEmail)}/sendMail`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "text/plain",
    },
    body: Buffer.from(args.mime, "utf8").toString("base64"),
  });

  if (res.status === 202) {
    return { id: "accepted-by-microsoft-graph", threadId: "" };
  }

  const data = await parseMicrosoftJson(res);
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.error_description || data?.error || "Microsoft Graph send failed.");
  }

  return { id: String((data as any)?.id ?? "accepted-by-microsoft-graph"), threadId: String((data as any)?.conversationId ?? "") };
}
