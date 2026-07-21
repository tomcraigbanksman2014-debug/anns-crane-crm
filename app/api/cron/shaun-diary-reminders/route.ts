import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { sendPushToSubscription } from "../../../lib/shaunDiaryPush";

function authorised(req: Request) {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const admin = createSupabaseAdminClient(); const now = new Date(); const windowEnd = new Date(now.getTime() + 6 * 60 * 1000);
  const { data: entries, error } = await admin.from("shaun_diary_entries").select("*").gte("start_at", now.toISOString()).lte("start_at", new Date(now.getTime() + 7 * 86400000).toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: subs } = await admin.from("shaun_diary_push_subscriptions").select("*").eq("enabled", true);
  let sent = 0;
  for (const entry of entries ?? []) {
    const scheduled = new Date(new Date(entry.start_at).getTime() - Number(entry.reminder_minutes ?? 60) * 60000);
    if (scheduled < new Date(now.getTime() - 5 * 60000) || scheduled > windowEnd) continue;
    for (const sub of subs ?? []) {
      const { data: prior } = await admin.from("shaun_diary_notification_log").select("id").eq("entry_id", entry.id).eq("subscription_id", sub.id).eq("notification_type", "entry_reminder").eq("scheduled_for", scheduled.toISOString()).maybeSingle();
      if (prior) continue;
      try {
        const mins = Math.max(0, Math.round((new Date(entry.start_at).getTime() - now.getTime()) / 60000));
        await sendPushToSubscription(sub, { title: "AnnS CRM — Shaun's Diary", body: `${entry.title} starts in ${mins} minutes${entry.location ? ` — ${entry.location}` : ""}`, url: "/shaun-diary", tag: `shaun-diary-${entry.id}` });
        await admin.from("shaun_diary_notification_log").insert({ entry_id: entry.id, subscription_id: sub.id, notification_type: "entry_reminder", scheduled_for: scheduled.toISOString(), success: true }); sent++;
      } catch (err: any) {
        await admin.from("shaun_diary_notification_log").insert({ entry_id: entry.id, subscription_id: sub.id, notification_type: "entry_reminder", scheduled_for: scheduled.toISOString(), success: false, error_message: String(err?.message ?? err).slice(0, 1000) });
      }
    }
  }
  return NextResponse.json({ ok: true, sent });
}
