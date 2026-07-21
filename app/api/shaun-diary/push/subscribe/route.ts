import { NextRequest, NextResponse } from "next/server";
import { requireOfficeUserApi } from "../../../../lib/routeGuards";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await requireOfficeUserApi(); if (auth.response) return auth.response;
  return NextResponse.json({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "" });
}
export async function POST(req: NextRequest) {
  const auth = await requireOfficeUserApi(); if (auth.response) return auth.response;
  const subscription = await req.json();
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("shaun_diary_push_subscriptions").upsert({ endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, user_id: auth.ctx?.user?.id || null, user_email: auth.ctx?.user?.email || null, active: true, updated_at: new Date().toISOString(), last_error: null }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
