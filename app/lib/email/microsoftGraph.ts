import type { SupabaseClient } from "@supabase/supabase-js";

export const MICROSOFT_PROVIDER = "microsoft_graph";
export const DEFAULT_MICROSOFT_BATCH_LIMIT = 50;

function env(name: string) {
  return String(process.env[name] ?? "").trim();
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

export function microsoftGraphConfigured() {
  return Boolean(
    (env("MICROSOFT_TENANT_ID") || env("AZURE_TENANT_ID")) &&
      (env("MICROSOFT_CLIENT_ID") || env("AZURE_CLIENT_ID")) &&
      (env("MICROSOFT_CLIENT_SECRET") || env("AZURE_CLIENT_SECRET")) &&
      getMicrosoftSenderEmail()
  );
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

export async function getFreshMicrosoftGraphAccessToken(_admin?: SupabaseClient) {
  const tenantId = getMicrosoftTenantId();
  const body = new URLSearchParams();
  body.set("client_id", getMicrosoftClientId());
  body.set("client_secret", getMicrosoftClientSecret());
  body.set("scope", "https://graph.microsoft.com/.default");
  body.set("grant_type", "client_credentials");

  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await parseMicrosoftJson(res);

  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "Could not get Microsoft Graph access token.");
  }

  return {
    accessToken: String(data.access_token),
    connection: {
      id: MICROSOFT_PROVIDER,
      email_address: getMicrosoftSenderEmail(),
      provider: MICROSOFT_PROVIDER,
    },
  };
}

export async function sendMicrosoftRawMimeMessage(args: {
  accessToken: string;
  senderEmail: string;
  mime: string;
}) {
  const endpoint = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(args.senderEmail)}/sendMail`;
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

  return { id: String(data?.id ?? "accepted-by-microsoft-graph"), threadId: String(data?.conversationId ?? "") };
}
