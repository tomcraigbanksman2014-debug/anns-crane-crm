import {
  buildCraneAppendixFacts,
  buildVehicleAppendixFacts,
  detectAssetAppendixPreset,
  selectCraneBundleTitlesForContext,
  selectVehicleBundleTitlesForContext,
  type AppendixSelectionFacts,
  type CraneAppendixSelectionContext,
  type VehicleAppendixSelectionContext,
} from "./assetAppendixPresets";
import { createSupabaseAdminClient } from "./supabase/admin";

export type AssetDocumentManagerItem = {
  id: string;
  title: string;
  document_type: string;
  file_name: string | null;
  file_url: string | null;
  storage_path: string | null;
  uploaded_at: string | null;
  include_in_pack: boolean;
  appendix_order: number | null;
  preview_page_numbers: number[];
  preview_count: number;
  open_url: string | null;
};

export type PackAppendixAssetItem = {
  key?: string;
  title: string;
  description: string | null;
  image_url: string;
  document_type: string;
  page_number: number;
  appendix_order: number;
  source_type?: "crane" | "vehicle" | "job" | null;
  source_document_id?: string | null;
};

type RuleRow = {
  id: string;
  rule_name: string;
  priority: number;
  match_criteria: Record<string, any> | null;
};

function normaliseNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.trunc(item));
}

function documentTypeLabel(value: string | null | undefined) {
  const key = String(value ?? "").trim().toLowerCase();

  switch (key) {
    case "spec_sheet":
      return "Specification sheet";
    case "load_chart":
      return "Load chart";
    case "manual":
      return "Manual";
    case "inspection":
      return "Inspection";
    case "loler":
      return "LOLER";
    case "insurance":
      return "Insurance";
    case "service":
      return "Service";
    default:
      return key || "Document";
  }
}

async function signPaths(bucket: string, paths: string[]) {
  const admin = createSupabaseAdminClient();
  const valid = paths.filter(Boolean);
  if (!valid.length) return new Map<string, string>();

  const { data, error } = await admin.storage.from(bucket).createSignedUrls(valid, 60 * 60);

  if (error || !data) {
    return new Map<string, string>();
  }

  const map = new Map<string, string>();
  data.forEach((item, index) => {
    if (item?.signedUrl) {
      map.set(valid[index], item.signedUrl);
    }
  });
  return map;
}

function normaliseTitle(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

type CraneAppendixLookupContext = CraneAppendixSelectionContext & {
  craneName?: string | null;
  craneMake?: string | null;
  craneModel?: string | null;
  craneCapacity?: string | null;
};

function contextCraneFamily(context?: CraneAppendixLookupContext | null) {
  return craneFamilyKey(context?.craneName, context?.craneMake, context?.craneModel, context?.craneCapacity);
}

async function resolveCraneIdsForAppendix(
  initialCraneId: string | null | undefined,
  context?: CraneAppendixLookupContext | null
) {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  add(initialCraneId);

  const wantedFamily = contextCraneFamily(context);
  const wantedRaw = normaliseCraneIdentity([context?.craneName, context?.craneMake, context?.craneModel, context?.craneCapacity].filter(Boolean).join(" "));
  if (!wantedFamily && !wantedRaw) return ids;

  const admin = createSupabaseAdminClient();
  const { data: cranes } = await admin
    .from("cranes")
    .select("id, name, make, model, capacity, reg_number")
    .limit(250);

  for (const crane of (cranes as any[]) ?? []) {
    const candidateFamily = craneFamilyKey(crane?.name, crane?.make, crane?.model, crane?.capacity, crane?.reg_number);
    const candidateRaw = normaliseCraneIdentity([crane?.name, crane?.make, crane?.model, crane?.capacity, crane?.reg_number].filter(Boolean).join(" "));
    if (!candidateRaw) continue;

    if (wantedFamily && candidateFamily && wantedFamily === candidateFamily) {
      add(crane?.id);
      continue;
    }

    if (wantedRaw && (candidateRaw.includes(wantedRaw) || wantedRaw.includes(candidateRaw))) {
      add(crane?.id);
    }
  }

  return ids;
}

function filterDocsByTitles<T extends { title?: string | null }>(docs: T[], titles: string[] | null) {
  if (!titles || !titles.length) return docs;
  const wanted = new Set(titles.map((title) => normaliseTitle(title)));
  const matched = docs.filter((doc) => wanted.has(normaliseTitle(doc.title)));
  return matched.length ? matched : docs;
}

function criterionMatches(expected: any, actual: any): boolean {
  if (Array.isArray(expected)) {
    return expected.some((item) => criterionMatches(item, actual));
  }

  if (expected === null || expected === undefined) {
    return true;
  }

  if (typeof expected === "boolean") {
    return Boolean(actual) === expected;
  }

  if (typeof expected === "number") {
    return Number(actual) === expected;
  }

  return String(actual ?? "").trim().toLowerCase() === String(expected).trim().toLowerCase();
}

function matchesCriteria(criteria: Record<string, any> | null | undefined, facts: AppendixSelectionFacts) {
  const entries = Object.entries(criteria ?? {});
  if (!entries.length) return true;

  for (const [key, expected] of entries) {
    const actual = (facts as any)[key];
    if (!criterionMatches(expected, actual)) return false;
  }

  return true;
}

function buildAppendixItemsFromRows({
  previews,
  docs,
  storageMap,
  ruleOrder,
}: {
  previews: any[];
  docs: any[];
  storageMap: Map<string, string>;
  ruleOrder?: Map<string, number>;
}) {
  const docMap = new Map<string, any>(docs.map((doc: any) => [String(doc.id), doc]));

  return previews
    .map((preview: any) => {
      const sourceDocumentId = String(preview.crane_document_id ?? preview.vehicle_document_id ?? preview.job_document_id ?? "");
      const doc = docMap.get(sourceDocumentId);
      if (!doc) return null;
      const signed = storageMap.get(String(preview.preview_storage_path ?? ""));
      if (!signed) return null;

      const pageNumber = Number(preview.page_number ?? 0) || 1;
      const order = ruleOrder?.get(String(preview.id)) ?? Number(doc.appendix_order ?? 9999);
      const sourceType = preview.job_document_id ? "job" : preview.crane_document_id ? "crane" : preview.vehicle_document_id ? "vehicle" : null;
      const key = `${sourceType ?? "preview"}:${String(preview.id ?? `${sourceDocumentId}:${pageNumber}`)}`;

      return {
        key,
        source_type: sourceType,
        source_document_id: sourceDocumentId,
        title:
          String(preview.title ?? "").trim() ||
          `${String(doc.title ?? "Document")}${pageNumber > 1 ? ` – page ${pageNumber}` : ""}`,
        description: `${documentTypeLabel(doc.document_type)} • PDF page ${pageNumber}`,
        image_url: signed,
        document_type: String(doc.document_type ?? "other"),
        page_number: pageNumber,
        appendix_order: order,
      } satisfies PackAppendixAssetItem;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.appendix_order - b.appendix_order || a.page_number - b.page_number);
}

async function getCraneRuleAppendixAssets(craneId: string, context?: CraneAppendixSelectionContext | null) {
  const admin = createSupabaseAdminClient();
  const facts = buildCraneAppendixFacts(context ?? null);

  const { data: rules, error: rulesError } = await admin
    .from("asset_appendix_rules")
    .select("id, rule_name, priority, match_criteria")
    .eq("asset_type", "crane")
    .eq("crane_id", craneId)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (rulesError || !rules?.length) return [];

  const matchedRules = (rules as any[])
    .filter((rule) => matchesCriteria(rule.match_criteria, facts))
    .map((rule) => ({
      id: String(rule.id),
      rule_name: String(rule.rule_name ?? ""),
      priority: Number(rule.priority ?? 100),
      match_criteria: (rule.match_criteria ?? {}) as Record<string, any>,
    })) as RuleRow[];

  if (!matchedRules.length) return [];

  const rulePriority = new Map<string, number>(matchedRules.map((rule) => [rule.id, rule.priority]));

  const { data: rulePages, error: rulePagesError } = await admin
    .from("asset_appendix_rule_pages")
    .select("rule_id, preview_id, appendix_order")
    .in("rule_id", matchedRules.map((rule) => rule.id));

  if (rulePagesError || !rulePages?.length) return [];

  const previewOrder = new Map<string, number>();
  const previewIds: string[] = [];

  (rulePages as any[])
    .sort((a, b) => {
      const pa = rulePriority.get(String(a.rule_id)) ?? 9999;
      const pb = rulePriority.get(String(b.rule_id)) ?? 9999;
      return pa - pb || Number(a.appendix_order ?? 9999) - Number(b.appendix_order ?? 9999);
    })
    .forEach((row) => {
      const previewId = String(row.preview_id ?? "");
      if (!previewId || previewOrder.has(previewId)) return;
      previewIds.push(previewId);
      previewOrder.set(previewId, Number(row.appendix_order ?? 9999));
    });

  if (!previewIds.length) return [];

  const { data: previews, error: previewsError } = await admin
    .from("asset_document_previews")
    .select("id, crane_document_id, page_number, title, preview_storage_path")
    .in("id", previewIds);

  if (previewsError || !previews?.length) return [];

  const docIds = Array.from(new Set(previews.map((row: any) => String(row.crane_document_id ?? "")).filter(Boolean)));
  const { data: docs } = await admin
    .from("crane_documents")
    .select("id, title, document_type, appendix_order")
    .in("id", docIds);

  const storageMap = await signPaths(
    "asset-doc-previews",
    previews.map((preview: any) => String(preview.preview_storage_path ?? "")).filter(Boolean)
  );

  return buildAppendixItemsFromRows({ previews, docs: docs ?? [], storageMap, ruleOrder: previewOrder });
}

async function getVehicleRuleAppendixAssets(vehicleId: string, context?: VehicleAppendixSelectionContext | null) {
  const admin = createSupabaseAdminClient();
  const facts = buildVehicleAppendixFacts(context ?? null);

  const { data: rules, error: rulesError } = await admin
    .from("asset_appendix_rules")
    .select("id, rule_name, priority, match_criteria")
    .eq("asset_type", "vehicle")
    .eq("vehicle_id", vehicleId)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (rulesError || !rules?.length) return [];

  const matchedRules = (rules as any[])
    .filter((rule) => matchesCriteria(rule.match_criteria, facts))
    .map((rule) => ({
      id: String(rule.id),
      rule_name: String(rule.rule_name ?? ""),
      priority: Number(rule.priority ?? 100),
      match_criteria: (rule.match_criteria ?? {}) as Record<string, any>,
    })) as RuleRow[];

  if (!matchedRules.length) return [];

  const rulePriority = new Map<string, number>(matchedRules.map((rule) => [rule.id, rule.priority]));

  const { data: rulePages, error: rulePagesError } = await admin
    .from("asset_appendix_rule_pages")
    .select("rule_id, preview_id, appendix_order")
    .in("rule_id", matchedRules.map((rule) => rule.id));

  if (rulePagesError || !rulePages?.length) return [];

  const previewOrder = new Map<string, number>();
  const previewIds: string[] = [];

  (rulePages as any[])
    .sort((a, b) => {
      const pa = rulePriority.get(String(a.rule_id)) ?? 9999;
      const pb = rulePriority.get(String(b.rule_id)) ?? 9999;
      return pa - pb || Number(a.appendix_order ?? 9999) - Number(b.appendix_order ?? 9999);
    })
    .forEach((row) => {
      const previewId = String(row.preview_id ?? "");
      if (!previewId || previewOrder.has(previewId)) return;
      previewIds.push(previewId);
      previewOrder.set(previewId, Number(row.appendix_order ?? 9999));
    });

  if (!previewIds.length) return [];

  const { data: previews, error: previewsError } = await admin
    .from("asset_document_previews")
    .select("id, vehicle_document_id, page_number, title, preview_storage_path")
    .in("id", previewIds);

  if (previewsError || !previews?.length) return [];

  const docIds = Array.from(new Set(previews.map((row: any) => String(row.vehicle_document_id ?? "")).filter(Boolean)));
  const { data: docs } = await admin
    .from("vehicle_documents")
    .select("id, title, document_type, appendix_order")
    .in("id", docIds);

  const storageMap = await signPaths(
    "asset-doc-previews",
    previews.map((preview: any) => String(preview.preview_storage_path ?? "")).filter(Boolean)
  );

  return buildAppendixItemsFromRows({ previews, docs: docs ?? [], storageMap, ruleOrder: previewOrder });
}

export async function getCraneDocumentsForManager(craneId: string) {
  const admin = createSupabaseAdminClient();

  const { data: docs, error } = await admin
    .from("crane_documents")
    .select("id, title, document_type, file_name, file_url, storage_path, uploaded_at, include_in_pack, appendix_order, preview_page_numbers")
    .eq("crane_id", craneId)
    .order("uploaded_at", { ascending: false });

  if (error || !docs) {
    return [];
  }

  const docIds = docs.map((doc: any) => doc.id).filter(Boolean);
  const previewCounts = new Map<string, number>();

  if (docIds.length) {
    const { data: previews } = await admin
      .from("asset_document_previews")
      .select("id, crane_document_id")
      .in("crane_document_id", docIds);

    (previews ?? []).forEach((row: any) => {
      const key = String(row.crane_document_id ?? "");
      previewCounts.set(key, (previewCounts.get(key) ?? 0) + 1);
    });
  }

  const storageMap = await signPaths(
    "asset-documents",
    docs.map((doc: any) => String(doc.storage_path ?? "")).filter(Boolean)
  );

  return docs.map((doc: any) => ({
    id: String(doc.id),
    title: String(doc.title ?? "Document"),
    document_type: String(doc.document_type ?? "other"),
    file_name: doc.file_name ? String(doc.file_name) : null,
    file_url: doc.file_url ? String(doc.file_url) : null,
    storage_path: doc.storage_path ? String(doc.storage_path) : null,
    uploaded_at: doc.uploaded_at ? String(doc.uploaded_at) : null,
    include_in_pack: !!doc.include_in_pack,
    appendix_order: doc.appendix_order == null ? null : Number(doc.appendix_order),
    preview_page_numbers: normaliseNumberArray(doc.preview_page_numbers),
    preview_count: previewCounts.get(String(doc.id)) ?? 0,
    open_url:
      doc.storage_path && storageMap.get(String(doc.storage_path))
        ? storageMap.get(String(doc.storage_path))!
        : doc.file_url
        ? String(doc.file_url)
        : null,
  })) satisfies AssetDocumentManagerItem[];
}

export async function getVehicleDocumentsForManager(vehicleId: string) {
  const admin = createSupabaseAdminClient();

  const { data: docs, error } = await admin
    .from("vehicle_documents")
    .select("id, title, document_type, file_name, file_url, storage_path, uploaded_at, include_in_pack, appendix_order, preview_page_numbers")
    .eq("vehicle_id", vehicleId)
    .order("uploaded_at", { ascending: false });

  if (error || !docs) {
    return [];
  }

  const docIds = docs.map((doc: any) => doc.id).filter(Boolean);
  const previewCounts = new Map<string, number>();

  if (docIds.length) {
    const { data: previews } = await admin
      .from("asset_document_previews")
      .select("id, vehicle_document_id")
      .in("vehicle_document_id", docIds);

    (previews ?? []).forEach((row: any) => {
      const key = String(row.vehicle_document_id ?? "");
      previewCounts.set(key, (previewCounts.get(key) ?? 0) + 1);
    });
  }

  const storageMap = await signPaths(
    "asset-documents",
    docs.map((doc: any) => String(doc.storage_path ?? "")).filter(Boolean)
  );

  return docs.map((doc: any) => ({
    id: String(doc.id),
    title: String(doc.title ?? "Document"),
    document_type: String(doc.document_type ?? "other"),
    file_name: doc.file_name ? String(doc.file_name) : null,
    file_url: doc.file_url ? String(doc.file_url) : null,
    storage_path: doc.storage_path ? String(doc.storage_path) : null,
    uploaded_at: doc.uploaded_at ? String(doc.uploaded_at) : null,
    include_in_pack: !!doc.include_in_pack,
    appendix_order: doc.appendix_order == null ? null : Number(doc.appendix_order),
    preview_page_numbers: normaliseNumberArray(doc.preview_page_numbers),
    preview_count: previewCounts.get(String(doc.id)) ?? 0,
    open_url:
      doc.storage_path && storageMap.get(String(doc.storage_path))
        ? storageMap.get(String(doc.storage_path))!
        : doc.file_url
        ? String(doc.file_url)
        : null,
  })) satisfies AssetDocumentManagerItem[];
}


function dedupeAppendixAssets(items: PackAppendixAssetItem[]) {
  const seen = new Set<string>();
  const out: PackAppendixAssetItem[] = [];
  for (const item of items) {
    const key = [
      item.source_type ?? "",
      item.source_document_id ?? "",
      item.page_number ?? "",
      normaliseTitle(item.title),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function getCraneAppendixAssetsForPack(
  craneId: string | null | undefined,
  context?: CraneAppendixLookupContext | null
) {
  const craneIds = await resolveCraneIdsForAppendix(craneId, context);
  if (!craneIds.length) return [];

  const admin = createSupabaseAdminClient();

  async function loadDocs(requireIncludeInPack: boolean) {
    let query = admin
      .from("crane_documents")
      .select("id, crane_id, title, document_type, appendix_order, include_in_pack, uploaded_at")
      .in("crane_id", craneIds)
      .in("document_type", ["spec_sheet", "load_chart", "manual"]);

    if (requireIncludeInPack) {
      query = query.eq("include_in_pack", true);
    }

    const { data, error } = await query
      .order("appendix_order", { ascending: true })
      .order("uploaded_at", { ascending: true });

    if (error || !data?.length) return [] as any[];
    return data as any[];
  }

  // Normal route: documents deliberately marked for the lift pack.
  let docs = await loadDocs(true);

  // Safety fallback: if crane naming/record tidying means the selected crane spec pages are not being found,
  // still show generated preview pages from the matched crane spec/load-chart/manual documents. The selector
  // remains the control for what is actually printed.
  if (!docs.length) {
    docs = await loadDocs(false);
  }

  if (!docs.length) return [];

  const { data: previews } = await admin
    .from("asset_document_previews")
    .select("id, crane_document_id, page_number, title, preview_storage_path")
    .in("crane_document_id", docs.map((doc: any) => doc.id))
    .order("page_number", { ascending: true });

  if (!previews || !previews.length) {
    return [];
  }

  const storageMap = await signPaths(
    "asset-doc-previews",
    previews.map((preview: any) => String(preview.preview_storage_path ?? "")).filter(Boolean)
  );

  const allAssets = buildAppendixItemsFromRows({ previews, docs, storageMap });

  // Keep rule-selected pages first if rules exist, but append all remaining generated pages.
  // This prevents a rename such as "BOCKER AK 46/6000" / "Böcker AK46" or "HK40 Tadano Faun"
  // from hiding the crane's own spec sheet pages on the lift plan screen.
  const ruleAssets = await Promise.all(craneIds.map((id) => getCraneRuleAppendixAssets(id, context)));
  const orderedRuleAssets = ruleAssets.flat();
  if (!orderedRuleAssets.length) return allAssets;

  const usedKeys = new Set(orderedRuleAssets.map((asset) => asset.key).filter(Boolean));
  const merged = [
    ...orderedRuleAssets,
    ...allAssets.filter((asset) => !usedKeys.has(asset.key ?? "")),
  ];

  return dedupeAppendixAssets(merged).sort(
    (a, b) =>
      a.appendix_order - b.appendix_order ||
      a.page_number - b.page_number ||
      String(a.title).localeCompare(String(b.title))
  );
}

export async function getJobSpecDocumentsForManager(jobId: string) {
  const admin = createSupabaseAdminClient();

  const { data: docs, error } = await admin
    .from("job_documents")
    .select("id, title, document_type, file_name, file_path, file_type, created_at, include_in_lift_plan_pack, appendix_order, preview_page_numbers")
    .eq("job_id", jobId)
    .in("document_type", ["spec_sheet", "load_chart", "manual"])
    .order("created_at", { ascending: false });

  if (error || !docs) {
    return [];
  }

  const docIds = docs.map((doc: any) => doc.id).filter(Boolean);
  const previewCounts = new Map<string, number>();

  if (docIds.length) {
    const { data: previews } = await admin
      .from("asset_document_previews")
      .select("id, job_document_id")
      .in("job_document_id", docIds);

    (previews ?? []).forEach((row: any) => {
      const key = String(row.job_document_id ?? "");
      previewCounts.set(key, (previewCounts.get(key) ?? 0) + 1);
    });
  }

  const storageMap = await signPaths(
    "job-documents",
    docs.map((doc: any) => String(doc.file_path ?? "")).filter(Boolean)
  );

  return docs.map((doc: any) => ({
    id: String(doc.id),
    title: String(doc.title ?? doc.file_name ?? "Document"),
    document_type: String(doc.document_type ?? "other"),
    file_name: doc.file_name ? String(doc.file_name) : null,
    file_url: doc.file_path ? String(doc.file_path) : null,
    storage_path: doc.file_path ? String(doc.file_path) : null,
    uploaded_at: doc.created_at ? String(doc.created_at) : null,
    include_in_pack: !!doc.include_in_lift_plan_pack,
    appendix_order: doc.appendix_order == null ? null : Number(doc.appendix_order),
    preview_page_numbers: normaliseNumberArray(doc.preview_page_numbers),
    preview_count: previewCounts.get(String(doc.id)) ?? 0,
    open_url:
      doc.file_path && storageMap.get(String(doc.file_path))
        ? storageMap.get(String(doc.file_path))!
        : null,
  })) satisfies AssetDocumentManagerItem[];
}

export async function getJobSpecAppendixAssetsForPack(jobId: string | null | undefined) {
  if (!jobId) return [];
  const admin = createSupabaseAdminClient();

  const { data: docs, error } = await admin
    .from("job_documents")
    .select("id, title, document_type, appendix_order")
    .eq("job_id", jobId)
    .in("document_type", ["spec_sheet", "load_chart", "manual"])
    .eq("include_in_lift_plan_pack", true)
    .order("appendix_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !docs || !docs.length) {
    return [];
  }

  const { data: previews } = await admin
    .from("asset_document_previews")
    .select("id, job_document_id, page_number, title, preview_storage_path")
    .in("job_document_id", docs.map((doc: any) => doc.id))
    .order("page_number", { ascending: true });

  if (!previews || !previews.length) {
    return [];
  }

  const storageMap = await signPaths(
    "asset-doc-previews",
    previews.map((preview: any) => String(preview.preview_storage_path ?? "")).filter(Boolean)
  );

  return buildAppendixItemsFromRows({ previews, docs, storageMap });
}

export async function getVehicleAppendixAssetsForPack(
  vehicleId: string | null | undefined,
  context?: VehicleAppendixSelectionContext | null
) {
  if (!vehicleId) return [];

  const ruleAssets = await getVehicleRuleAppendixAssets(vehicleId, context);
  if (ruleAssets.length) return ruleAssets;

  const admin = createSupabaseAdminClient();

  const [{ data: vehicle }, { data: docs, error }] = await Promise.all([
    admin.from("vehicles").select("name, vehicle_type, trailer_type, capacity").eq("id", vehicleId).maybeSingle(),
    admin
      .from("vehicle_documents")
      .select("id, title, document_type, appendix_order")
      .eq("vehicle_id", vehicleId)
      .eq("include_in_pack", true)
      .order("appendix_order", { ascending: true })
      .order("uploaded_at", { ascending: true }),
  ]);

  if (error || !docs || !docs.length) {
    return [];
  }

  const profile = vehicle
    ? { name: vehicle.name, make: vehicle.vehicle_type, model: vehicle.trailer_type, vehicleType: vehicle.vehicle_type, capacity: vehicle.capacity }
    : null;
  const preset = detectAssetAppendixPreset("vehicle", profile);
  const chosenDocs = filterDocsByTitles(
    docs,
    preset ? selectVehicleBundleTitlesForContext(profile, context ?? null) : null
  );

  const { data: previews } = await admin
    .from("asset_document_previews")
    .select("id, vehicle_document_id, page_number, title, preview_storage_path")
    .in("vehicle_document_id", chosenDocs.map((doc: any) => doc.id))
    .order("page_number", { ascending: true });

  if (!previews || !previews.length) {
    return [];
  }

  const storageMap = await signPaths(
    "asset-doc-previews",
    previews.map((preview: any) => String(preview.preview_storage_path ?? "")).filter(Boolean)
  );

  return buildAppendixItemsFromRows({ previews, docs: chosenDocs, storageMap });
}
