import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/apiAuth";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export async function POST(req: Request) {
  const auth = await requireApiUser(); if (auth.response) return auth.response;
  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint ?? ""); const p256dh = String(body?.keys?.p256dh ?? ""); const keyAuth = String(body?.keys?.auth ?? "");
  if (!endpoint || !p256dh || !keyAuth) return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("shaun_diary_push_subscriptions").upsert({ user_id: auth.user!.id, user_email: auth.user!.email ?? null, endpoint, p256dh, auth: keyAuth, user_agent: req.headers.get("user-agent"), enabled: true, updated_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
