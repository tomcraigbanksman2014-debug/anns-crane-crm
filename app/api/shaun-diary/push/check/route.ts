import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { sendShaunPush } from "../../../../lib/shaunDiaryPush";
export const dynamic = "force-dynamic";
function authorised(req: NextRequest) { const secret = process.env.SHAUN_DIARY_CRON_SECRET; return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`); }
export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const admin = createSupabaseAdminClient(); const now = new Date(); const future = new Date(now.getTime() + 24*60*60*1000);
  const { data: entries, error } = await admin.from("shaun_diary_entries").select("*").gte("start_at", now.toISOString()).lte("start_at", future.toISOString()).not("reminder_minutes", "is", null).order("start_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let sent = 0;
  for (const entry of entries || []) {
    const reminderAt = new Date(new Date(entry.start_at).getTime() - Number(entry.reminder_minutes || 0)*60000);
    if (reminderAt > now || now.getTime() - reminderAt.getTime() > 10*60000) continue;
    const key = `entry_reminder:${entry.id}:${entry.start_at}`;
    const { data: existing } = await admin.from("shaun_diary_push_log").select("id").eq("notification_key", key).maybeSingle();
    if (existing) continue;
    const time = new Date(entry.start_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    const count = await sendShaunPush({ title: "AnnS CRM — Shaun's Diary", body: `${entry.title} at ${time}${entry.location ? ` — ${entry.location}` : ""}`, url: "/shaun-diary", tag: `diary-${entry.id}` });
    await admin.from("shaun_diary_push_log").insert({ notification_key: key, entry_id: entry.id, notification_type: "entry_reminder", devices_sent: count }); sent += count;
  }
  return NextResponse.json({ ok: true, devices_sent: sent });
}
