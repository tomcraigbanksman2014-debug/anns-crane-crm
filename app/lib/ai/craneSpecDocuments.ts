import { createSupabaseAdminClient } from "../supabase/admin";

function flatten<T = any>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanId(value: unknown) {
  return String(value ?? "").trim();
}

function normaliseCraneIdentity(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[öø]/g, "o")
    .replace(/[ä]/g, "a")
    .replace(/[ü]/g, "u")
    .replace(/[éè]/g, "e")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function craneFamilyKey(...values: unknown[]) {
  const text = normaliseCraneIdentity(values.filter(Boolean).join(" "));
  if (!text) return "";
  if (text.includes("ak46") || text.includes("ak466000") || (text.includes("bocker") && text.includes("46")) || (text.includes("boecker") && text.includes("46"))) return "ak46";
  if (text.includes("gmk40801") || text.includes("gmk4080") || (text.includes("grove") && text.includes("4080"))) return "gmk4080";
  if (text.includes("spx532") || (text.includes("jekko") && text.includes("532")) || text === "jekko") return "spx532";
  if (text.includes("hk40") || (text.includes("tadano") && text.includes("40")) || (text.includes("faun") && text.includes("40"))) return "hk40";
  if (text.includes("mtk35") || (text.includes("marchetti") && text.includes("35"))) return "mtk35";
  return text;
}

function collectCraneIdentityValues(job: any) {
  const values: unknown[] = [];
  for (const crane of flatten(job?.cranes)) values.push((crane as any)?.name, (crane as any)?.make, (crane as any)?.model, (crane as any)?.capacity);
  if (job?.crane) values.push(job.crane?.name, job.crane?.make, job.crane?.model, job.crane?.capacity);
  for (const item of flatten(job?.job_equipment)) {
    values.push((item as any)?.item_name, (item as any)?.asset_type, (item as any)?.source_type);
    for (const crane of flatten((item as any)?.cranes)) values.push((crane as any)?.name, (crane as any)?.make, (crane as any)?.model, (crane as any)?.capacity);
  }
  return values;
}

function collectCraneIds(job: any) {
  const ids = new Set<string>();

  for (const crane of flatten(job?.cranes)) {
    const id = cleanId((crane as any)?.id);
    if (id) ids.add(id);
  }

  const direct = cleanId(job?.crane_id ?? job?.crane?.id);
  if (direct) ids.add(direct);

  for (const item of flatten(job?.job_equipment)) {
    const rowId = cleanId((item as any)?.crane_id);
    if (rowId) ids.add(rowId);
    for (const crane of flatten((item as any)?.cranes)) {
      const nestedId = cleanId((crane as any)?.id);
      if (nestedId) ids.add(nestedId);
    }
  }

  return Array.from(ids);
}


async function resolveCraneIdsByNameFallback(supabase: any, job: any, existingIds: string[]) {
  const ids = new Set(existingIds.map(cleanId).filter(Boolean));
  const wantedFamily = craneFamilyKey(...collectCraneIdentityValues(job));
  const wantedRaw = normaliseCraneIdentity(collectCraneIdentityValues(job).filter(Boolean).join(" "));
  if (!wantedFamily && !wantedRaw) return Array.from(ids);

  const { data: cranes } = await supabase
    .from("cranes")
    .select("id, name, make, model, capacity, reg_number")
    .limit(250);

  for (const crane of (cranes as any[]) ?? []) {
    const candidateFamily = craneFamilyKey(crane?.name, crane?.make, crane?.model, crane?.capacity, crane?.reg_number);
    const candidateRaw = normaliseCraneIdentity([crane?.name, crane?.make, crane?.model, crane?.capacity, crane?.reg_number].filter(Boolean).join(" "));
    if (!candidateRaw) continue;
    if (wantedFamily && candidateFamily && candidateFamily === wantedFamily) ids.add(cleanId(crane?.id));
    else if (wantedRaw && (candidateRaw.includes(wantedRaw) || wantedRaw.includes(candidateRaw))) ids.add(cleanId(crane?.id));
  }

  return Array.from(ids).filter(Boolean);
}

function attachToCrane(crane: any, byCraneId: Map<string, any[]>, byFamily: Map<string, any[]>) {
  if (!crane || typeof crane !== "object") return crane;
  const id = cleanId(crane.id);
  const family = craneFamilyKey(crane?.name, crane?.make, crane?.model, crane?.capacity);
  crane.crane_documents = (id ? byCraneId.get(id) : null) ?? (family ? byFamily.get(family) : null) ?? [];
  return crane;
}


async function loadJobLiftPlanSpecDocuments(supabase: any, jobId: string) {
  if (!jobId) return [];

  const preferred = await supabase
    .from("job_documents")
    .select("id, title, document_type, extracted_text, extracted_profile, created_at")
    .eq("job_id", jobId)
    .in("document_type", ["spec_sheet", "load_chart", "manual"])
    .order("created_at", { ascending: false });

  if (!preferred.error && preferred.data) {
    return preferred.data as any[];
  }

  return [];
}

export async function attachCraneSpecDocumentsToJob(_supabase: any, job: any) {
  if (!job) return job;

  const supabase = createSupabaseAdminClient();

  const jobId = cleanId(job?.id);
  job.job_lift_plan_spec_documents = jobId ? await loadJobLiftPlanSpecDocuments(supabase, jobId) : [];

  const craneIds = await resolveCraneIdsByNameFallback(supabase, job, collectCraneIds(job));
  if (!craneIds.length) return job;

  let docs: any[] = [];

  // Preferred query: includes columns added by sql/crane_spec_sheet_extraction.sql.
  const preferred = await supabase
    .from("crane_documents")
    .select("id, crane_id, title, document_type, extracted_text, extracted_profile, uploaded_at")
    .in("crane_id", craneIds)
    .in("document_type", ["spec_sheet", "load_chart", "manual"])
    .order("uploaded_at", { ascending: false });

  if (!preferred.error && preferred.data) {
    docs = preferred.data as any[];
  } else {
    // Fallback keeps older deployments alive if the SQL has not been run yet.
    const fallback = await supabase
      .from("crane_documents")
      .select("id, crane_id, title, document_type, uploaded_at")
      .in("crane_id", craneIds)
      .in("document_type", ["spec_sheet", "load_chart", "manual"])
      .order("uploaded_at", { ascending: false });
    docs = !fallback.error && fallback.data ? (fallback.data as any[]) : [];
  }

  const byCraneId = new Map<string, any[]>();
  for (const doc of docs) {
    const key = cleanId(doc?.crane_id);
    if (!key) continue;
    const list = byCraneId.get(key) ?? [];
    list.push(doc);
    byCraneId.set(key, list);
  }

  const byFamily = new Map<string, any[]>();
  if (docs.length) {
    const { data: craneRows } = await supabase
      .from("cranes")
      .select("id, name, make, model, capacity, reg_number")
      .in("id", Array.from(byCraneId.keys()));

    for (const row of (craneRows as any[]) ?? []) {
      const family = craneFamilyKey(row?.name, row?.make, row?.model, row?.capacity, row?.reg_number);
      const list = byCraneId.get(cleanId(row?.id)) ?? [];
      if (!family || !list.length) continue;
      byFamily.set(family, [...(byFamily.get(family) ?? []), ...list]);
    }
  }

  if (Array.isArray(job.cranes)) {
    job.cranes = job.cranes.map((crane: any) => attachToCrane(crane, byCraneId, byFamily));
  } else if (job.cranes) {
    job.cranes = attachToCrane(job.cranes, byCraneId, byFamily);
  }

  if (job.crane) {
    job.crane = attachToCrane(job.crane, byCraneId, byFamily);
  }

  if (Array.isArray(job.job_equipment)) {
    job.job_equipment = job.job_equipment.map((item: any) => {
      if (Array.isArray(item?.cranes)) {
        item.cranes = item.cranes.map((crane: any) => attachToCrane(crane, byCraneId, byFamily));
      } else if (item?.cranes) {
        item.cranes = attachToCrane(item.cranes, byCraneId, byFamily);
      }
      return item;
    });
  }

  return job;
}
