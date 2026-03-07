import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey);
}

export async function writeAuditLog(input: {
  actor_user_id?: string | null;
  actor_username?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  meta?: Record<string, any> | null;
}) {
  try {
    const admin = getServiceClient();
    if (!admin) return;

    await admin.from("audit_log").insert([
      {
        actor_user_id: input.actor_user_id ?? null,
        actor_username: input.actor_username ?? null,
        action: input.action,
        entity_type: input.entity_type,
        entity_id: input.entity_id ?? null,
        meta: input.meta ?? null,
      },
    ]);
  } catch {
    // intentionally swallow audit failures
  }
}
