import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type JobDocumentRow = {
  id: string;
  job_id: string;
  file_name: string | null;
  file_path: string | null;
  file_type: string | null;
};

type DownloadResult = {
  data: Blob;
  path: string;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function safeInlineFileName(value: unknown) {
  return String(value ?? "document")
    .replace(/[\r\n"\\]/g, "_")
    .trim()
    .slice(0, 180) || "document";
}

function safeFileName(value: unknown) {
  return String(value ?? "")
    .replace(/[/\\]/g, "_")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}


function contentTypeFromName(value: unknown) {
  const name = String(value ?? "").toLowerCase().split("?")[0];
  if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".jfif") || name.endsWith(".pjpeg") || name.endsWith(".pjp")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "";
}

function normaliseStoredContentType(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "application/octet-stream" || raw === "binary/octet-stream") return "";
  if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
  return raw;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function normaliseForMatch(value: unknown) {
  const raw = String(value ?? "").trim();
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  return decoded
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,10}$/i, "")
    .replace(/^\d{10,}-\d+-[a-z0-9]+[-_]/i, "")
    .replace(/^\d{10,}[-_]/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function extractStoragePathFromUrl(value: string) {
  try {
    const url = new URL(value);
    const decodedPath = decodeURIComponent(url.pathname);
    const pathsToCheck = [url.pathname, decodedPath];
    const markers = [
      "/storage/v1/object/public/job-documents/",
      "/storage/v1/object/sign/job-documents/",
      "/storage/v1/object/authenticated/job-documents/",
      "/object/public/job-documents/",
      "/object/sign/job-documents/",
      "/object/authenticated/job-documents/",
    ];

    for (const pathToCheck of pathsToCheck) {
      for (const marker of markers) {
        const index = pathToCheck.indexOf(marker);
        if (index >= 0) {
          return pathToCheck.slice(index + marker.length);
        }
      }
    }
  } catch {
    // Not a valid URL. The caller will handle it as a raw storage path.
  }

  return "";
}

function storagePathCandidates(row: JobDocumentRow) {
  const rawPath = String(row.file_path ?? "").trim();
  const rawName = String(row.file_name ?? "").trim();
  const jobId = String(row.job_id ?? "").trim();
  const candidates: string[] = [];

  function add(candidate: unknown) {
    const raw = String(candidate ?? "").trim();
    if (!raw) return;

    const withoutQuery = raw.split("?")[0].trim();
    const fromUrl = /^https?:\/\//i.test(withoutQuery) ? extractStoragePathFromUrl(withoutQuery) : "";
    const source = fromUrl || withoutQuery;

    const stripped = source
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/+/, "")
      .replace(/^storage\/v1\/object\/(public|sign|authenticated)\/job-documents\//i, "")
      .replace(/^object\/(public|sign|authenticated)\/job-documents\//i, "")
      .replace(/^job-documents\//i, "")
      .trim();

    if (!stripped || /^https?:\/\//i.test(stripped)) return;

    candidates.push(stripped);
    try {
      candidates.push(decodeURIComponent(stripped));
    } catch {
      // Keep stripped path only.
    }

    try {
      candidates.push(stripped.split("/").map((part) => encodeURIComponent(part)).join("/"));
    } catch {
      // Keep stripped path only.
    }
  }

  add(rawPath);

  if (rawName && jobId) {
    add(`${jobId}/${rawName}`);
    add(`${jobId}/${safeFileName(rawName)}`);
  }

  return unique(candidates);
}

async function tryDownload(admin: SupabaseClient, candidates: string[]) {
  for (const candidate of unique(candidates)) {
    const { data, error } = await admin.storage.from("job-documents").download(candidate);
    if (!error && data) {
      return { data, path: candidate } as DownloadResult;
    }
  }

  return null;
}

async function findByListing(admin: SupabaseClient, row: JobDocumentRow) {
  const jobId = String(row.job_id ?? "").trim();
  const fileName = String(row.file_name ?? "").trim();
  if (!jobId || !fileName) return null;

  const target = normaliseForMatch(fileName);
  const safeTarget = normaliseForMatch(safeFileName(fileName));
  if (!target && !safeTarget) return null;

  const { data: files, error } = await admin.storage.from("job-documents").list(jobId, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error || !files?.length) return null;

  const possible = files
    .filter((file: any) => file && !file.id?.endsWith("/"))
    .map((file: any) => String(file.name ?? "").trim())
    .filter(Boolean);

  const matches = possible.filter((name) => {
    const candidate = normaliseForMatch(name);
    if (!candidate) return false;
    return (
      candidate === target ||
      candidate === safeTarget ||
      candidate.endsWith(target) ||
      candidate.endsWith(safeTarget) ||
      target.endsWith(candidate) ||
      safeTarget.endsWith(candidate)
    );
  });

  return tryDownload(admin, matches.map((name) => `${jobId}/${name}`));
}

async function fetchHistoricPublicUrl(rawPath: string) {
  if (!/^https?:\/\//i.test(rawPath)) return null;

  try {
    const response = await fetch(rawPath, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.blob();
    return { data, contentType: response.headers.get("content-type") || data.type || null };
  } catch {
    return null;
  }
}

function responseForFile(row: JobDocumentRow, data: Blob, contentTypeOverride?: string | null) {
  // Some older WhatsApp/site-photo uploads were saved with file_type as
  // application/octet-stream even though the filename is .jpg/.jpeg. Chrome will
  // then treat the <img> preview as a broken file. For preview responses, infer
  // an image MIME type from the stored filename/path before falling back to the
  // database MIME value.
  const inferredFromName = contentTypeFromName(row.file_name) || contentTypeFromName(row.file_path);
  const contentType =
    normaliseStoredContentType(contentTypeOverride) ||
    inferredFromName ||
    normaliseStoredContentType(row.file_type) ||
    normaliseStoredContentType(data.type) ||
    "application/octet-stream";

  return new Response(data, {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store, max-age=0",
      "content-disposition": `inline; filename="${safeInlineFileName(row.file_name)}"`,
      "x-robots-tag": "noindex",
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string; documentId: string } }
) {
  try {
    const admin = getAdminClient();

    // Job documents are already stored in the public job-documents bucket in this
    // CRM. Do not make the thumbnail depend on Supabase auth cookies: browsers can
    // request <img> tags without the same auth context as the page, which caused
    // valid uploaded appendix images to show as broken thumbnails.
    try {
      const supabase = createSupabaseServerClient();
      await supabase.auth.getUser();
    } catch {
      // Preview still uses the service-role lookup below. This route requires the
      // job id and document id and returns only the matching job document.
    }

    const { data: doc, error: docError } = await admin
      .from("job_documents")
      .select("id, job_id, file_name, file_path, file_type")
      .eq("id", params.documentId)
      .eq("job_id", params.id)
      .maybeSingle();

    if (docError || !doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const row = doc as JobDocumentRow;

    const directDownload = await tryDownload(admin, storagePathCandidates(row));
    if (directDownload) {
      return responseForFile(row, directDownload.data);
    }

    const listedDownload = await findByListing(admin, row);
    if (listedDownload) {
      return responseForFile(row, listedDownload.data);
    }

    const rawPath = String(row.file_path ?? "").trim();
    const historicPublicUrl = await fetchHistoricPublicUrl(rawPath);
    if (historicPublicUrl) {
      return responseForFile(row, historicPublicUrl.data, historicPublicUrl.contentType);
    }

    return NextResponse.json({ error: "Could not load document preview." }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Could not load document preview." },
      { status: 400 }
    );
  }
}
