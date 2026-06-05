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

function storagePathCandidates(row: JobDocumentRow, jobId: string) {
  const candidates: string[] = [];
  const rawPath = cleanText(row.file_path);
  const fileName = cleanText(row.file_name);
  const cleanedFileName = safeFileName(fileName);

  function add(candidate: unknown) {
    const raw = cleanText(candidate);
    if (!raw) return;
    const stripped = stripStoragePrefix(raw.split("?")[0]);
    if (!stripped || /^https?:\/\//i.test(stripped)) return;

    const decoded = decodeMaybe(stripped);
    addUnique(candidates, decoded);
    addUnique(candidates, stripped);

    // Some old rows accidentally stored an already encoded path. Supabase storage
    // object names are normally decoded, but keep both forms as fallbacks.
    const encodedParts = decoded.split("/").map((part) => encodeURIComponent(part)).join("/");
    addUnique(candidates, encodedParts);
  }

  if (/^https?:\/\//i.test(rawPath)) {
    try {
      const url = new URL(rawPath);
      add(url.pathname);
      const markers = [
        "/storage/v1/object/public/job-documents/",
        "/storage/v1/object/sign/job-documents/",
        "/storage/v1/object/authenticated/job-documents/",
      ];
      for (const marker of markers) {
        const index = url.pathname.indexOf(marker);
        if (index >= 0) add(url.pathname.slice(index + marker.length));
      }
    } catch {
      add(rawPath);
    }
  } else {
    add(rawPath);
  }

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

function basename(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
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

async function tryDownload(admin: any, paths: string[]) {
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

async function findByFolderFuzzyMatch(admin: any, row: JobDocumentRow, jobId: string) {
  const fileName = cleanText(row.file_name);
  const wantedNames = [
    fileName,
    safeFileName(fileName),
    decodeMaybe(fileName),
    decodeMaybe(safeFileName(fileName)),
    ...storagePathCandidates(row, jobId).map(basename),
  ]
    .map(normaliseForMatch)
    .filter(Boolean);

  if (!wantedNames.length) return null;

  const folders = Array.from(new Set([
    jobId,
    ...storagePathCandidates(row, jobId).map((path) => path.split("/").slice(0, -1).join("/")).filter(Boolean),
  ]));

  for (const folder of folders) {
    const { data: objects, error } = await admin.storage.from("job-documents").list(folder, { limit: 1000, offset: 0 });
    if (error || !objects?.length) continue;

    const match = objects.find((object: any) => {
      const objectName = normaliseForMatch(object?.name);
      if (!objectName) return false;
      return wantedNames.some((wanted) => objectName === wanted || objectName.endsWith(wanted) || objectName.includes(wanted));
    });

    if (match?.name) {
      const fullPath = `${folder.replace(/\/+$/, "")}/${match.name}`;
      const downloaded = await tryDownload(admin, [fullPath]);
      if (downloaded) return downloaded;
    }
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
    const resolved = direct ?? await findByFolderFuzzyMatch(admin, row, params.id);

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
      { error: "Could not load document preview.", file_name: row.file_name, file_path: row.file_path },
      { status: 404, headers: { "cache-control": "no-store" } }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Could not load document preview." },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }
}
