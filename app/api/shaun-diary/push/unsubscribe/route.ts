import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/apiAuth";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
export async function POST(req: Request) {
  const auth = await requireApiUser(); if (auth.response) return auth.response;
  const body = await req.json().catch(() => null); const endpoint = String(body?.endpoint ?? "");
  const admin = createSupabaseAdminClient();
  if (endpoint) await admin.from("shaun_diary_push_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() }).eq("endpoint", endpoint).eq("user_id", auth.user!.id);
  return NextResponse.json({ ok: true });
}
