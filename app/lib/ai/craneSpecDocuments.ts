import { createSupabaseAdminClient } from "../supabase/admin";

function flatten<T = any>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanId(value: unknown) {
  return String(value ?? "").trim();
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

function attachToCrane(crane: any, byCraneId: Map<string, any[]>) {
  if (!crane || typeof crane !== "object") return crane;
  const id = cleanId(crane.id);
  if (!id) return crane;
  crane.crane_documents = byCraneId.get(id) ?? [];
  return crane;
}

export async function attachCraneSpecDocumentsToJob(_supabase: any, job: any) {
  if (!job) return job;

  const supabase = createSupabaseAdminClient();

  const craneIds = collectCraneIds(job);
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

  if (Array.isArray(job.cranes)) {
    job.cranes = job.cranes.map((crane: any) => attachToCrane(crane, byCraneId));
  } else if (job.cranes) {
    job.cranes = attachToCrane(job.cranes, byCraneId);
  }

  if (job.crane) {
    job.crane = attachToCrane(job.crane, byCraneId);
  }

  if (Array.isArray(job.job_equipment)) {
    job.job_equipment = job.job_equipment.map((item: any) => {
      if (Array.isArray(item?.cranes)) {
        item.cranes = item.cranes.map((crane: any) => attachToCrane(crane, byCraneId));
      } else if (item?.cranes) {
        item.cranes = attachToCrane(item.cranes, byCraneId);
      }
      return item;
    });
  }

  return job;
}
