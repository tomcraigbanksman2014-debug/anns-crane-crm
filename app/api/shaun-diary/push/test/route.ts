import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/apiAuth";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { sendPushToAll } from "../../../../lib/shaunDiaryPush";
export async function POST() {
  const auth = await requireApiUser(); if (auth.response) return auth.response;
  try {
    const admin = createSupabaseAdminClient();
    await sendPushToAll(admin, { title: "AnnS CRM — Shaun's Diary", body: "Notifications are working on this device.", url: "/shaun-diary", tag: "shaun-diary-test" });
    return NextResponse.json({ ok: true });
  } catch (err: any) { return NextResponse.json({ error: err.message || "Could not send test notification." }, { status: 500 }); }
}
