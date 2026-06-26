import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase/server";
import { createSupabaseAdminClient } from "./supabase/admin";
import { isMasterAdminEmail } from "./admin";

export type MasterCallTranscriptContext = {
  user: any;
  admin: ReturnType<typeof createSupabaseAdminClient>;
};

export async function requireMasterCallTranscriptUser(): Promise<
  | { ok: true; user: any; admin: ReturnType<typeof createSupabaseAdminClient> }
  | { ok: false; response: NextResponse }
> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }

  if (!isMasterAdminEmail(user.email)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Call transcriber is only available to Tom." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    user,
    admin: createSupabaseAdminClient(),
  };
}

export function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

export function phoneDigits(value: unknown) {
  return String(value ?? "").replace(/\D+/g, "").trim();
}

export function lastTenPhoneDigits(value: unknown) {
  const digits = phoneDigits(value);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function phoneLooksSame(a: unknown, b: unknown) {
  const aa = lastTenPhoneDigits(a);
  const bb = lastTenPhoneDigits(b);
  return aa.length >= 7 && bb.length >= 7 && aa === bb;
}

export function safeArrayOfText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normaliseCompany(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/limited/g, "ltd")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function companyLooksSame(a: unknown, b: unknown) {
  const aa = normaliseCompany(a);
  const bb = normaliseCompany(b);
  if (!aa || !bb) return false;
  return aa === bb || aa.includes(bb) || bb.includes(aa);
}
