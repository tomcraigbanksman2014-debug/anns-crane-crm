import { createSupabaseServerClient } from "./supabase/server";

export type CustomerActivityRollup = {
  client_id: string;
  last_activity_date: string | null;
  crm_job_count: number;
  crm_transport_job_count: number;
  crm_quote_count: number;
  crm_correspondence_count: number;
  imported_history_count: number;
};

type SupabaseClientLike = ReturnType<typeof createSupabaseServerClient>;

function cleanId(value: unknown) {
  return String(value ?? "").trim();
}

function asDateString(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function maxDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function defaultRollup(clientId: string): CustomerActivityRollup {
  return {
    client_id: clientId,
    last_activity_date: null,
    crm_job_count: 0,
    crm_transport_job_count: 0,
    crm_quote_count: 0,
    crm_correspondence_count: 0,
    imported_history_count: 0,
  };
}

function upsertRollup(map: Map<string, CustomerActivityRollup>, clientId: string) {
  const existing = map.get(clientId);
  if (existing) return existing;
  const created = defaultRollup(clientId);
  map.set(clientId, created);
  return created;
}

function isMissingViewError(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("customer_activity_rollup") || message.includes("does not exist") || message.includes("relation") || message.includes("schema cache");
}

async function loadFromView(
  supabase: SupabaseClientLike,
  clientIds: string[]
): Promise<Map<string, CustomerActivityRollup>> {
  const map = new Map<string, CustomerActivityRollup>();
  if (!clientIds.length) return map;

  const { data, error } = await supabase
    .from("customer_activity_rollup")
    .select(
      "client_id, last_activity_date, crm_job_count, crm_transport_job_count, crm_quote_count, crm_correspondence_count, imported_history_count"
    )
    .in("client_id", clientIds);

  if (error) {
    throw error;
  }

  for (const row of data ?? []) {
    const clientId = cleanId((row as any).client_id);
    if (!clientId) continue;
    map.set(clientId, {
      client_id: clientId,
      last_activity_date: asDateString((row as any).last_activity_date),
      crm_job_count: Number((row as any).crm_job_count ?? 0) || 0,
      crm_transport_job_count: Number((row as any).crm_transport_job_count ?? 0) || 0,
      crm_quote_count: Number((row as any).crm_quote_count ?? 0) || 0,
      crm_correspondence_count: Number((row as any).crm_correspondence_count ?? 0) || 0,
      imported_history_count: Number((row as any).imported_history_count ?? 0) || 0,
    });
  }

  return map;
}

async function loadFallback(
  supabase: SupabaseClientLike,
  clientIds: string[]
): Promise<Map<string, CustomerActivityRollup>> {
  const map = new Map<string, CustomerActivityRollup>();
  if (!clientIds.length) return map;

  for (const clientId of clientIds) {
    if (clientId) map.set(clientId, defaultRollup(clientId));
  }

  const chunkSize = 100;
  for (let start = 0; start < clientIds.length; start += chunkSize) {
    const chunk = clientIds.slice(start, start + chunkSize);

    const [jobsRes, transportRes, quotesRes, corrRes, importedRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("client_id, updated_at, created_at")
        .in("client_id", chunk)
        .eq("archived", false),
      supabase
        .from("transport_jobs")
        .select("client_id, updated_at, created_at")
        .in("client_id", chunk)
        .eq("archived", false),
      supabase
        .from("quotes")
        .select("client_id, created_at")
        .in("client_id", chunk)
        .eq("archived", false),
      supabase
        .from("customer_correspondence")
        .select("client_id, created_at")
        .in("client_id", chunk),
      supabase
        .from("imported_job_history")
        .select("matched_client_id, created_at, job_date")
        .in("matched_client_id", chunk),
    ]);

    if (jobsRes.error) throw jobsRes.error;
    if (transportRes.error) throw transportRes.error;
    if (quotesRes.error) throw quotesRes.error;
    if (corrRes.error) throw corrRes.error;
    if (importedRes.error) throw importedRes.error;

    for (const row of jobsRes.data ?? []) {
      const clientId = cleanId((row as any).client_id);
      if (!clientId) continue;
      const entry = upsertRollup(map, clientId);
      entry.crm_job_count += 1;
      entry.last_activity_date = maxDate(entry.last_activity_date, asDateString((row as any).updated_at) ?? asDateString((row as any).created_at));
    }

    for (const row of transportRes.data ?? []) {
      const clientId = cleanId((row as any).client_id);
      if (!clientId) continue;
      const entry = upsertRollup(map, clientId);
      entry.crm_transport_job_count += 1;
      entry.last_activity_date = maxDate(entry.last_activity_date, asDateString((row as any).updated_at) ?? asDateString((row as any).created_at));
    }

    for (const row of quotesRes.data ?? []) {
      const clientId = cleanId((row as any).client_id);
      if (!clientId) continue;
      const entry = upsertRollup(map, clientId);
      entry.crm_quote_count += 1;
      entry.last_activity_date = maxDate(entry.last_activity_date, asDateString((row as any).created_at));
    }

    for (const row of corrRes.data ?? []) {
      const clientId = cleanId((row as any).client_id);
      if (!clientId) continue;
      const entry = upsertRollup(map, clientId);
      entry.crm_correspondence_count += 1;
      entry.last_activity_date = maxDate(entry.last_activity_date, asDateString((row as any).created_at));
    }

    for (const row of importedRes.data ?? []) {
      const clientId = cleanId((row as any).matched_client_id);
      if (!clientId) continue;
      const entry = upsertRollup(map, clientId);
      entry.imported_history_count += 1;
      entry.last_activity_date = maxDate(entry.last_activity_date, asDateString((row as any).job_date) ?? asDateString((row as any).created_at));
    }
  }

  return map;
}

export async function getCustomerActivityRollups(
  supabase: SupabaseClientLike,
  clientIds: string[]
): Promise<Map<string, CustomerActivityRollup>> {
  const uniqueIds = Array.from(new Set(clientIds.map(cleanId).filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  try {
    return await loadFromView(supabase, uniqueIds);
  } catch (error) {
    if (!isMissingViewError(error)) {
      throw error;
    }
  }

  return loadFallback(supabase, uniqueIds);
}
