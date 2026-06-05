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

function safeInlineFileName(value: unknown) {
  return String(value ?? "document")
    .replace(/[\r\n"\\]/g, "_")
    .trim()
    .slice(0, 180) || "document";
}

function storagePathCandidates(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return [] as string[];

  const candidates: string[] = [];

  function add(candidate: string) {
    const withoutQuery = String(candidate ?? "").trim().split("?")[0];
    const cleaned = withoutQuery
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/+/g, "")
      .replace(/^storage\/v1\/object\/(public|sign|authenticated)\/job-documents\//i, "")
      .replace(/^object\/(public|sign|authenticated)\/job-documents\//i, "")
      .replace(/^job-documents\//i, "")
      .trim();

    if (!cleaned || /^https?:\/\//i.test(cleaned)) return;

    // Prefer the decoded storage object path. Supabase public/signed URLs encode
    // spaces and brackets in the URL, but the storage object path normally uses
    // the decoded filename. Keep the encoded form as a fallback for older rows.
    try {
      const decoded = decodeURIComponent(cleaned);
      if (decoded && !candidates.includes(decoded)) candidates.push(decoded);
    } catch {
      // Ignore malformed encoding and keep the cleaned value below.
    }

    if (!candidates.includes(cleaned)) candidates.push(cleaned);
  }

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
          add(url.pathname.slice(index + marker.length));
        }
      }
    } catch {
      // Fall through to raw path handling below.
    }
  }

  add(raw);
  return candidates;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string; documentId: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const admin = getAdminClient();
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
    const candidates = storagePathCandidates(row.file_path);

    for (const candidate of candidates) {
      const { data, error } = await admin.storage.from("job-documents").download(candidate);
      if (!error && data) {
        const contentType = row.file_type || data.type || "application/octet-stream";
        return new Response(data, {
          headers: {
            "content-type": contentType,
            "cache-control": "private, max-age=300",
            "content-disposition": `inline; filename="${safeInlineFileName(row.file_name)}"`,
          },
        });
      }
    }

    // Final fallback for historic rows that stored a complete public URL and no
    // longer match the storage object path parser above.
    const rawPath = String(row.file_path ?? "").trim();
    if (/^https?:\/\//i.test(rawPath)) {
      return NextResponse.redirect(rawPath, { status: 302 });
    }

    return NextResponse.json({ error: "Could not load document preview." }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Could not load document preview." },
      { status: 400 }
    );
  }
}
