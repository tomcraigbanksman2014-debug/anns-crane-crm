import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUBCONTRACTOR_DOCUMENT_BUCKET = "subcontractor-onboarding-documents";
export const ONBOARDING_EDITABLE_STATUSES = new Set([
  "invite_sent",
  "in_progress",
  "changes_required",
]);

export type OnboardingInvite = {
  id: string;
  invitee_name: string;
  invitee_email?: string | null;
  invitee_phone?: string | null;
  invited_role?: string | null;
  status: string;
  token_version: number;
  expires_at: string;
  first_opened_at?: string | null;
  last_saved_at?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  returned_at?: string | null;
  revoked_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by_user_id?: string | null;
  created_by_username?: string | null;
  operator_id?: string | null;
  submission_data?: Record<string, any> | null;
  return_message?: string | null;
  internal_notes?: string | null;
  declaration_name?: string | null;
  declaration_signed_at?: string | null;
};

export function getOnboardingSecret() {
  const value = String(process.env.SUBCONTRACTOR_ONBOARDING_SECRET ?? "").trim();

  if (value.length < 32) {
    throw new Error(
      "Server missing a dedicated SUBCONTRACTOR_ONBOARDING_SECRET of at least 32 characters"
    );
  }

  return value;
}

function signatureFor(payload: string) {
  return crypto
    .createHmac("sha256", getOnboardingSecret())
    .update(payload)
    .digest("base64url");
}

export function createOnboardingToken(invite: Pick<OnboardingInvite, "id" | "token_version">) {
  const payload = `${invite.id}.${Number(invite.token_version || 1)}`;
  return `${payload}.${signatureFor(payload)}`;
}

export function parseAndVerifyOnboardingToken(token: string) {
  const parts = String(token ?? "").trim().split(".");
  if (parts.length !== 3) return null;

  const [id, versionRaw, suppliedSignature] = parts;
  const version = Number(versionRaw);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(version) || version < 1) {
    return null;
  }

  const payload = `${id}.${version}`;
  const expected = signatureFor(payload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);

  if (suppliedBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;

  return { id, version };
}

export function isInviteExpired(invite: Pick<OnboardingInvite, "expires_at">) {
  const expires = new Date(invite.expires_at);
  return !Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now();
}

export async function readInviteFromToken(
  admin: SupabaseClient,
  token: string,
  options?: { allowExpired?: boolean }
): Promise<
  | { invite: OnboardingInvite; error: null }
  | { invite: null; error: "invalid" | "not_found" | "superseded" | "expired" }
> {
  const parsed = parseAndVerifyOnboardingToken(token);
  if (!parsed) return { invite: null, error: "invalid" };

  const { data, error } = await admin
    .from("subcontractor_onboarding_invites")
    .select("*")
    .eq("id", parsed.id)
    .maybeSingle();

  if (error || !data) return { invite: null, error: "not_found" };

  const invite = data as OnboardingInvite;
  if (Number(invite.token_version || 1) !== parsed.version) {
    return { invite: null, error: "superseded" };
  }

  if (!options?.allowExpired && isInviteExpired(invite)) {
    return { invite: null, error: "expired" };
  }

  return { invite, error: null };
}

export function getOnboardingOrigin(explicitOrigin?: string | null) {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  const origin = configured || String(explicitOrigin ?? "").trim();
  return origin.replace(/\/+$/g, "");
}

export function buildOnboardingLink(
  invite: Pick<OnboardingInvite, "id" | "token_version">,
  origin?: string | null
) {
  const base = getOnboardingOrigin(origin);
  const path = `/subcontractor-onboarding/${encodeURIComponent(createOnboardingToken(invite))}`;
  return base ? `${base}${path}` : path;
}

export function normaliseWhatsAppNumber(value: string | null | undefined) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `44${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppInviteUrl(args: {
  phone?: string | null;
  name?: string | null;
  link: string;
}) {
  const phone = normaliseWhatsAppNumber(args.phone);
  if (!phone) return "";
  const firstName = String(args.name ?? "").trim().split(/\s+/)[0] || "there";
  const message = `Hi ${firstName}, it looks like your subcontractor form has been started but not completed or submitted yet. Please reopen the link, complete all sections, upload the required documents and press submit at the end. Let me know if you have any problems.

${args.link}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function onboardingStatusLabel(value: string | null | undefined) {
  switch (String(value ?? "").toLowerCase()) {
    case "invite_sent":
      return "Invite sent";
    case "in_progress":
      return "In progress";
    case "submitted_for_review":
      return "Submitted for review";
    case "changes_required":
      return "Changes required";
    case "approved":
      return "Approved";
    case "revoked":
      return "Revoked";
    default:
      return "Unknown";
  }
}

export function cleanSubmissionValue(value: unknown, maxLength = 500) {
  const text = String(value ?? "").trim();
  return text.slice(0, maxLength);
}

export function sanitizeFilename(filename: string) {
  const cleaned = String(filename ?? "document")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return cleaned || "document";
}
