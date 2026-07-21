import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOnboardingSecret } from "./subcontractorOnboarding";

export const MAX_ONBOARDING_DOCUMENTS = 12;
export const MAX_ONBOARDING_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ONBOARDING_TOTAL_BYTES = 40 * 1024 * 1024;
export const UPLOAD_INTENT_TTL_MINUTES = 15;

export function publicOnboardingEnabled() {
  return String(process.env.SUBCONTRACTOR_PUBLIC_ONBOARDING_ENABLED ?? "true")
    .trim()
    .toLowerCase() !== "false";
}

export function getClientIp(headers: Headers) {
  const forwarded = String(headers.get("x-forwarded-for") ?? "")
    .split(",")[0]
    .trim();
  const direct = String(headers.get("x-real-ip") ?? "").trim();
  const candidate = forwarded || direct || "unknown";
  return candidate.slice(0, 120);
}

export function hashOnboardingValue(namespace: string, value: string) {
  return crypto
    .createHmac("sha256", getOnboardingSecret())
    .update(`${namespace}:${String(value ?? "").trim().toLowerCase()}`)
    .digest("hex");
}

export function createPublicFormProof() {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(18).toString("base64url");
  const payload = `${timestamp}.${nonce}`;
  const signature = crypto
    .createHmac("sha256", getOnboardingSecret())
    .update(`public-form:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyPublicFormProof(proof: string) {
  const [timestampRaw, nonce, suppliedSignature, ...extra] = String(proof ?? "").split(".");
  if (extra.length || !timestampRaw || !nonce || !suppliedSignature) return false;

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  if (age < 1500 || age > 2 * 60 * 60 * 1000) return false;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(nonce)) return false;

  const payload = `${timestampRaw}.${nonce}`;
  const expected = crypto
    .createHmac("sha256", getOnboardingSecret())
    .update(`public-form:${payload}`)
    .digest("base64url");

  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export async function consumeOnboardingRateLimit(
  admin: SupabaseClient,
  args: {
    keyHash: string;
    action: string;
    windowSeconds: number;
    maxRequests: number;
    inviteId?: string | null;
  }
) {
  const { data, error } = await admin.rpc("consume_subcontractor_onboarding_rate_limit", {
    p_key_hash: args.keyHash,
    p_action: args.action,
    p_window_seconds: Math.max(1, Math.floor(args.windowSeconds)),
    p_max_requests: Math.max(1, Math.floor(args.maxRequests)),
    p_invite_id: args.inviteId ?? null,
  });

  if (error) {
    console.error("Subcontractor onboarding rate-limit check failed", {
      action: args.action,
      message: error.message,
    });
    throw new Error("ONBOARDING_SECURITY_UNAVAILABLE");
  }

  return data === true;
}

export async function requireOnboardingRateLimit(
  admin: SupabaseClient,
  args: {
    keyHash: string;
    action: string;
    windowSeconds: number;
    maxRequests: number;
    inviteId?: string | null;
  }
) {
  const allowed = await consumeOnboardingRateLimit(admin, args);
  if (!allowed) throw new Error("ONBOARDING_RATE_LIMITED");
}

export function requestBodyTooLarge(headers: Headers, maxBytes: number) {
  const raw = headers.get("content-length");
  if (!raw) return false;
  const size = Number(raw);
  return Number.isFinite(size) && size > maxBytes;
}


export async function readJsonBodyLimited(request: Request, maxBytes: number) {
  if (requestBodyTooLarge(request.headers, maxBytes)) {
    throw new Error("ONBOARDING_BODY_TOO_LARGE");
  }

  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("ONBOARDING_BODY_TOO_LARGE");
    }
    chunks.push(value);
  }

  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("ONBOARDING_INVALID_JSON");
  }
}

export function detectAllowedDocumentMime(buffer: Uint8Array) {
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return "application/pdf";
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export function publicApiError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message === "ONBOARDING_RATE_LIMITED") {
    return { status: 429, error: "Too many requests. Please wait and try again." };
  }
  if (message === "ONBOARDING_SECURITY_UNAVAILABLE") {
    return { status: 503, error: "The onboarding service is temporarily unavailable." };
  }
  if (message === "ONBOARDING_BODY_TOO_LARGE") {
    return { status: 413, error: "The request is too large." };
  }
  if (message === "ONBOARDING_INVALID_JSON") {
    return { status: 400, error: "The request could not be read." };
  }
  return { status: 500, error: fallback };
}
