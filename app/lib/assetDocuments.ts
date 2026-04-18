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
  title: string;
  description: string | null;
  image_url: string;
  document_type: string;
  page_number: number;
  appendix_order: number;
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

export async function getCraneAppendixAssetsForPack(craneId: string | null | undefined) {
  if (!craneId) return [];

  const admin = createSupabaseAdminClient();

  const { data: docs, error } = await admin
    .from("crane_documents")
    .select("id, title, document_type, appendix_order")
    .eq("crane_id", craneId)
    .eq("include_in_pack", true)
    .order("appendix_order", { ascending: true })
    .order("uploaded_at", { ascending: true });

  if (error || !docs || !docs.length) {
    return [];
  }

  const docMap = new Map<string, any>(docs.map((doc: any) => [String(doc.id), doc]));
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

  return previews
    .map((preview: any) => {
      const doc = docMap.get(String(preview.crane_document_id));
      if (!doc) return null;
      const signed = storageMap.get(String(preview.preview_storage_path ?? ""));
      if (!signed) return null;

      const pageNumber = Number(preview.page_number ?? 0) || 1;
      const order = Number(doc.appendix_order ?? 9999);

      return {
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

export async function getVehicleAppendixAssetsForPack(vehicleId: string | null | undefined) {
  if (!vehicleId) return [];

  const admin = createSupabaseAdminClient();

  const { data: docs, error } = await admin
    .from("vehicle_documents")
    .select("id, title, document_type, appendix_order")
    .eq("vehicle_id", vehicleId)
    .eq("include_in_pack", true)
    .order("appendix_order", { ascending: true })
    .order("uploaded_at", { ascending: true });

  if (error || !docs || !docs.length) {
    return [];
  }

  const docMap = new Map<string, any>(docs.map((doc: any) => [String(doc.id), doc]));
  const { data: previews } = await admin
    .from("asset_document_previews")
    .select("id, vehicle_document_id, page_number, title, preview_storage_path")
    .in("vehicle_document_id", docs.map((doc: any) => doc.id))
    .order("page_number", { ascending: true });

  if (!previews || !previews.length) {
    return [];
  }

  const storageMap = await signPaths(
    "asset-doc-previews",
    previews.map((preview: any) => String(preview.preview_storage_path ?? "")).filter(Boolean)
  );

  return previews
    .map((preview: any) => {
      const doc = docMap.get(String(preview.vehicle_document_id));
      if (!doc) return null;
      const signed = storageMap.get(String(preview.preview_storage_path ?? ""));
      if (!signed) return null;

      const pageNumber = Number(preview.page_number ?? 0) || 1;
      const order = Number(doc.appendix_order ?? 9999);

      return {
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
