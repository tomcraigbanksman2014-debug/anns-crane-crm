import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type JobDocumentRow = {
  id: string;
  job_id: string;
  file_name: string | null;
  file_path: string | null;
  file_type: string | null;
};

type DownloadedObject = {
  data: Blob;
  path: string;
};

type StorageObject = {
  id?: string | null;
  name?: string | null;
  metadata?: Record<string, any> | null;
  updated_at?: string | null;
  created_at?: string | null;
  last_accessed_at?: string | null;
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

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function safeInlineFileName(value: unknown) {
  return cleanText(value || "document")
    .replace(/[\r\n"\\]/g, "_")
    .trim()
    .slice(0, 180) || "document";
}

function addUnique(list: string[], value: unknown) {
  const text = cleanText(value).split("?")[0].replace(/^\/+/, "");
  if (!text) return;
  if (!list.includes(text)) list.push(text);
}

function decodeMaybe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodePath(value: string) {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function safeFileName(name: unknown) {
  return cleanText(name || "document")
    .replace(/[/\\]/g, "_")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 140) || "document";
}

function stripStoragePrefix(value: string) {
  return value
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/(public|sign|authenticated)\/job-documents\//i, "")
    .replace(/^object\/(public|sign|authenticated)\/job-documents\//i, "")
    .replace(/^job-documents\//i, "")
    .trim();
}

function basename(path: string) {
  return cleanText(path).split("/").filter(Boolean).pop() ?? path;
}

function dirname(path: string) {
  return cleanText(path).split("/").filter(Boolean).slice(0, -1).join("/");
}

function extensionFromName(name: unknown) {
  const match = cleanText(name).toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return match?.[1] || "";
}

function baseWithoutExtension(name: unknown) {
  return basename(cleanText(name)).replace(/\.[a-z0-9]{1,10}$/i, "");
}

function pathVariants(path: string) {
  const decoded = decodeMaybe(stripStoragePrefix(path.split("?")[0]).replace(/^\/+/, ""));
  const variants: string[] = [];

  function add(value: unknown) {
    addUnique(variants, value);
  }

  add(decoded);
  add(stripStoragePrefix(path));
  add(encodePath(decoded));

  const folder = dirname(decoded);
  const base = basename(decoded);
  if (folder && base) {
    add(`${folder}/${base.replace(/_/g, " ")}`);
    add(`${folder}/${base.replace(/\s+/g, "_")}`);
    add(`${folder}/${base.replace(/_/g, "-")}`);
    add(`${folder}/${base.replace(/-/g, "_")}`);
  }

  return variants;
}

function storagePathCandidates(row: JobDocumentRow, jobId: string) {
  const candidates: string[] = [];
  const rawPath = cleanText(row.file_path);
  const fileName = cleanText(row.file_name);
  const cleanedFileName = safeFileName(fileName);

  function add(candidate: unknown) {
    const raw = cleanText(candidate);
    if (!raw) return;
    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        const markers = [
          "/storage/v1/object/public/job-documents/",
          "/storage/v1/object/sign/job-documents/",
          "/storage/v1/object/authenticated/job-documents/",
        ];
        for (const marker of markers) {
          const index = url.pathname.indexOf(marker);
          if (index >= 0) {
            for (const variant of pathVariants(url.pathname.slice(index + marker.length))) addUnique(candidates, variant);
          }
        }
        return;
      } catch {
        // Fall through to normal handling.
      }
    }

    for (const variant of pathVariants(raw)) addUnique(candidates, variant);
  }

  add(rawPath);

  if (fileName) {
    add(`${jobId}/${fileName}`);
    add(`${jobId}/${cleanedFileName}`);
    add(`${jobId}/${decodeMaybe(fileName)}`);
    add(`${jobId}/${decodeMaybe(cleanedFileName)}`);
  }

  return candidates;
}

function normaliseForMatch(value: unknown) {
  return decodeMaybe(cleanText(value))
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,10}$/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function relaxedForMatch(value: unknown) {
  return normaliseForMatch(value)
    .replace(/^(\d{10,17})+/, "")
    .replace(/whatsapp\d+image/g, "whatsappimage")
    .replace(/whatsappimage\d+/g, "whatsappimage")
    .replace(/image\d+/g, "image")
    .replace(/copy\d+/g, "copy");
}

function dateTimeKey(value: unknown) {
  const text = decodeMaybe(cleanText(value)).toLowerCase();
  const match = text.match(/(20\d{2})[-_ .]?(\d{2})[-_ .]?(\d{2}).*?(\d{1,2})[._:\- ](\d{2})[._:\- ](\d{2})/);
  if (!match) return "";
  const [, year, month, day, hour, minute, second] = match;
  return `${year}${month}${day}${hour.padStart(2, "0")}${minute}${second}`;
}

function wantedMatchKeys(row: JobDocumentRow, jobId: string) {
  const values = [
    row.file_name,
    safeFileName(row.file_name),
    decodeMaybe(cleanText(row.file_name)),
    ...storagePathCandidates(row, jobId).map(basename),
    ...storagePathCandidates(row, jobId).map((item) => baseWithoutExtension(item)),
  ].filter(Boolean);

  const normalised = new Set<string>();
  const relaxed = new Set<string>();
  const dateKeys = new Set<string>();

  for (const value of values) {
    const norm = normaliseForMatch(value);
    const rel = relaxedForMatch(value);
    const dt = dateTimeKey(value);
    if (norm) normalised.add(norm);
    if (rel) relaxed.add(rel);
    if (dt) dateKeys.add(dt);
  }

  return {
    normalised: Array.from(normalised),
    relaxed: Array.from(relaxed),
    dateKeys: Array.from(dateKeys),
    wantsWhatsApp: values.some((value) => /whatsapp/i.test(cleanText(value))),
  };
}

function objectLooksLikeFolder(object: StorageObject) {
  if (!object?.name) return false;
  // Supabase Storage folder entries normally have no id/metadata, while real
  // files normally have both. Keep this deliberately permissive.
  return !object.id && !object.metadata;
}

function scoreObjectName(objectName: unknown, row: JobDocumentRow, jobId: string) {
  const keys = wantedMatchKeys(row, jobId);
  const objectBase = basename(cleanText(objectName));
  const objectNorm = normaliseForMatch(objectBase);
  const objectRelaxed = relaxedForMatch(objectBase);
  const objectDateKey = dateTimeKey(objectBase);
  let score = 0;

  for (const wanted of keys.normalised) {
    if (!wanted) continue;
    if (objectNorm === wanted) score = Math.max(score, 100);
    else if (objectNorm.endsWith(wanted) || wanted.endsWith(objectNorm)) score = Math.max(score, 92);
    else if (objectNorm.includes(wanted) || wanted.includes(objectNorm)) score = Math.max(score, 84);
  }

  for (const wanted of keys.relaxed) {
    if (!wanted) continue;
    if (objectRelaxed === wanted) score = Math.max(score, 96);
    else if (objectRelaxed.endsWith(wanted) || wanted.endsWith(objectRelaxed)) score = Math.max(score, 88);
    else if (objectRelaxed.includes(wanted) || wanted.includes(objectRelaxed)) score = Math.max(score, 78);
  }

  if (objectDateKey && keys.dateKeys.includes(objectDateKey)) {
    score = Math.max(score, keys.wantsWhatsApp && /whatsapp/i.test(objectBase) ? 90 : 76);
  }

  return score;
}

function contentTypeFromName(name: unknown, fallback?: unknown) {
  const lower = cleanText(name).toLowerCase();
  const fallbackType = cleanText(fallback).toLowerCase();

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || fallbackType === "image/jpg") return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (fallbackType.startsWith("image/")) return fallbackType === "image/jpg" ? "image/jpeg" : fallbackType;
  if (fallbackType) return fallbackType;
  return "application/octet-stream";
}

async function tryDownload(admin: any, paths: string[]): Promise<DownloadedObject | null> {
  for (const path of paths) {
    const candidate = cleanText(path).replace(/^\/+/, "");
    if (!candidate) continue;
    const { data, error } = await admin.storage.from("job-documents").download(candidate);
    if (!error && data && data.size > 0) {
      return { data, path: candidate };
    }
  }
  return null;
}

async function listStorageFolder(admin: any, folder: string) {
  const cleanedFolder = cleanText(folder).replace(/^\/+|\/+$/g, "");
  const { data, error } = await admin.storage.from("job-documents").list(cleanedFolder, {
    limit: 1000,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (error || !data) return [] as StorageObject[];
  return data as StorageObject[];
}

async function findBestMatchInFolder(admin: any, folder: string, row: JobDocumentRow, jobId: string) {
  const objects = await listStorageFolder(admin, folder);
  if (!objects.length) return null;

  let best: { object: StorageObject; score: number } | null = null;
  for (const object of objects) {
    if (!object?.name || objectLooksLikeFolder(object)) continue;
    const score = scoreObjectName(object.name, row, jobId);
    if (score > (best?.score ?? 0)) best = { object, score };
  }

  if (best && best.score >= 76 && best.object.name) {
    const fullPath = folder ? `${folder.replace(/\/+$/, "")}/${best.object.name}` : best.object.name;
    const downloaded = await tryDownload(admin, [fullPath]);
    if (downloaded) return downloaded;
  }

  return null;
}

async function findByFolderFuzzyMatch(admin: any, row: JobDocumentRow, jobId: string) {
  const folders = Array.from(new Set([
    jobId,
    ...storagePathCandidates(row, jobId).map(dirname).filter(Boolean),
  ]));

  for (const folder of folders) {
    const matched = await findBestMatchInFolder(admin, folder, row, jobId);
    if (matched) return matched;
  }

  return null;
}

async function findByWholeBucketFallback(admin: any, row: JobDocumentRow, jobId: string) {
  // Last-resort recovery for older records where the DB row is attached to the
  // correct job but the storage object was saved under a different top-level
  // folder or with a slightly different WhatsApp filename.
  const rootObjects = await listStorageFolder(admin, "");
  const rootFolders = rootObjects
    .filter(objectLooksLikeFolder)
    .map((object) => cleanText(object.name))
    .filter(Boolean);

  // Prefer the actual job folder first, then scan other folders. This bucket is
  // small on the live system; keep a hard cap so this route cannot run away.
  const folders = Array.from(new Set([jobId, ...storagePathCandidates(row, jobId).map(dirname), ...rootFolders]))
    .map((folder) => folder.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .slice(0, 250);

  for (const folder of folders) {
    const matched = await findBestMatchInFolder(admin, folder, row, jobId);
    if (matched) return matched;
  }

  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string; documentId: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: { "cache-control": "no-store" } });
    }

    const admin = getAdminClient();
    const { data: doc, error: docError } = await admin
      .from("job_documents")
      .select("id, job_id, file_name, file_path, file_type")
      .eq("id", params.documentId)
      .eq("job_id", params.id)
      .maybeSingle();

    if (docError || !doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404, headers: { "cache-control": "no-store" } });
    }

    const row = doc as JobDocumentRow;
    const direct = await tryDownload(admin, storagePathCandidates(row, params.id));
    const resolved = direct
      ?? await findByFolderFuzzyMatch(admin, row, params.id)
      ?? await findByWholeBucketFallback(admin, row, params.id);

    if (resolved?.data) {
      const contentType = contentTypeFromName(row.file_name || resolved.path, row.file_type || resolved.data.type);
      return new Response(resolved.data, {
        headers: {
          "content-type": contentType,
          "cache-control": "no-store, max-age=0",
          "content-disposition": `inline; filename="${safeInlineFileName(row.file_name)}"`,
          "x-annscrane-preview-path": resolved.path,
        },
      });
    }

    const rawPath = cleanText(row.file_path);
    if (/^https?:\/\//i.test(rawPath)) {
      return NextResponse.redirect(rawPath, { status: 302, headers: { "cache-control": "no-store" } });
    }

    return NextResponse.json(
      {
        error: "Could not load document preview. The database row exists, but the matching file was not found in Supabase Storage.",
        file_name: row.file_name,
        file_path: row.file_path,
        checked_folder: params.id,
      },
      { status: 404, headers: { "cache-control": "no-store" } }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Could not load document preview." },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }
}
