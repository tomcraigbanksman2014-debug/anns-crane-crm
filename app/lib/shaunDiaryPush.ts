import webpush from "web-push";
import { createSupabaseAdminClient } from "./supabase/admin";

function configure() {
  const subject = process.env.VAPID_SUBJECT || "mailto:info@annscranehire.co.uk";
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("Push notification VAPID keys are not configured.");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function sendShaunPush(input: { title: string; body: string; url?: string; tag?: string }) {
  configure();
  const admin = createSupabaseAdminClient();
  const { data: subscriptions, error } = await admin.from("shaun_diary_push_subscriptions").select("*").eq("active", true);
  if (error) throw new Error(error.message);
  const payload = JSON.stringify({ title: input.title, body: input.body, url: input.url || "/shaun-diary", tag: input.tag || "shaun-diary" });
  let sent = 0;
  for (const row of subscriptions || []) {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
      sent += 1;
      await admin.from("shaun_diary_push_subscriptions").update({ last_used_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0);
      await admin.from("shaun_diary_push_subscriptions").update({ active: statusCode === 404 || statusCode === 410 ? false : true, last_error: String(error?.message || "Push failed").slice(0, 500) }).eq("id", row.id);
    }
  }
  return sent;
}
