import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabase/admin";

type AuditChange = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
};

export type JobStatusAuditInput = {
  recordType: "crane" | "transport";
  recordId: string;
  recordReference?: string | null;
  actorUserId?: string | null;
  actorUsername?: string | null;
  source?: string | null;
  changes: AuditChange[];
  meta?: Record<string, any> | null;
  adminClient?: SupabaseClient<any, any, any> | null;
};

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function valuesDiffer(oldValue: unknown, newValue: unknown) {
  return cleanText(oldValue) !== cleanText(newValue);
}

export async function writeJobStatusAudit(input: JobStatusAuditInput) {
  const rows = input.changes
    .filter((change) => change.field && valuesDiffer(change.oldValue, change.newValue))
    .map((change) => ({
      record_type: input.recordType,
      record_id: input.recordId,
      record_reference: input.recordReference ?? null,
      field_changed: change.field,
      old_value: cleanText(change.oldValue),
      new_value: cleanText(change.newValue),
      actor_user_id: input.actorUserId ?? null,
      actor_username: input.actorUsername ?? null,
      source: input.source ?? null,
      meta: input.meta ?? {},
    }));

  if (!rows.length) return;

  try {
    const admin = input.adminClient ?? createSupabaseAdminClient();
    await admin.from("job_status_audit_log").insert(rows);
  } catch {
    // Audit failures should never block production job updates.
  }
}
