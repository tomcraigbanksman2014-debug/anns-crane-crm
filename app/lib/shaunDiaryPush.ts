import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

function configure() {
  const publicKey = String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = String(process.env.VAPID_SUBJECT ?? "mailto:info@annscranehire.co.uk").trim();
  if (!publicKey || !privateKey) throw new Error("VAPID keys are not configured.");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function sendPushToSubscription(subscription: any, payload: Record<string, unknown>) {
  configure();
  return webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    JSON.stringify(payload),
    { TTL: 3600, urgency: "high" }
  );
}

export async function sendPushToAll(admin: SupabaseClient, payload: Record<string, unknown>) {
  const { data, error } = await admin.from("shaun_diary_push_subscriptions").select("*").eq("enabled", true);
  if (error) throw new Error(error.message);
  const results = await Promise.allSettled((data ?? []).map(async (sub: any) => {
    try {
      await sendPushToSubscription(sub, payload);
      return { id: sub.id, ok: true };
    } catch (err: any) {
      const status = Number(err?.statusCode ?? 0);
      if (status === 404 || status === 410) {
        await admin.from("shaun_diary_push_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
      }
      throw err;
    }
  }));
  return results;
}
