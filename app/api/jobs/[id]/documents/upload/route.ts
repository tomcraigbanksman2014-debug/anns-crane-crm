import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

const allowedTypes = new Set([
  "rams",
  "lift_plan",
  "site_drawing",
  "photo",
  "delivery_note",
  "other",
]);

const uploadFieldNames = [
  "files",
  "file",
  "documents",
  "document",
  "attachments",
  "attachment",
  "uploads",
  "upload",
];

type UploadCandidate = {
  file: File;
  order: number;
  fieldName: string;
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

function isUploadedFile(entry: FormDataEntryValue): entry is File {
  if (!entry || typeof entry !== "object") return false;
  const candidate = entry as any;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.size === "number" &&
    candidate.size > 0 &&
    typeof candidate.arrayBuffer === "function"
  );
}

function safeFileName(name: string) {
  const cleaned = String(name || "document")
    .replace(/[/\\]/g, "_")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 140);

  return cleaned || "document";
}

function extensionFromName(name: string) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return match?.[1] || "";
}

function contentTypeForFile(file: File) {
  const rawType = String((file as any).type || "").trim();
  if (rawType) return rawType;

  const ext = extensionFromName(file.name);
  const byExt: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    heic: "image/heic",
    heif: "image/heif",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    txt: "text/plain",
    rtf: "application/rtf",
    dwg: "application/acad",
    dxf: "application/dxf",
  };

  return byExt[ext] || "application/octet-stream";
}

function parseOrders(formData: FormData) {
  return formData
    .getAll("file_order")
    .map((value) => Number(String(value ?? "").trim()))
    .map((value, index) => (Number.isFinite(value) && value > 0 ? value : index + 1));
}

function extractUploadCandidates(formData: FormData): UploadCandidate[] {
  const candidates: UploadCandidate[] = [];
  const seen = new Set<string>();
  const orders = parseOrders(formData);

  function addFile(entry: FormDataEntryValue, index: number, fieldName: string) {
    if (!isUploadedFile(entry)) return;
    const file = entry as File;
    const key = `${fieldName}:${file.name}:${file.size}:${index}`;
    const duplicateKey = `${file.name}:${file.size}:${index}`;
    if (seen.has(key) || seen.has(duplicateKey)) return;
    seen.add(key);
    seen.add(duplicateKey);
    candidates.push({
      file,
      order: orders[index] ?? candidates.length + 1,
      fieldName,
    });
  }

  for (const fieldName of uploadFieldNames) {
    const entries = formData.getAll(fieldName);
    entries.forEach((entry, index) => addFile(entry, index, fieldName));
  }

  if (candidates.length === 0) {
    let index = 0;
    for (const [fieldName, entry] of formData.entries()) {
      if (isUploadedFile(entry)) {
        addFile(entry, index, fieldName);
        index += 1;
      }
    }
  }

  return candidates.sort((a, b) => a.order - b.order);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const uploadedPaths: string[] = [];

  try {
    const supabase = createSupabaseServerClient();
    const admin = getAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: job, error: jobError } = await admin
      .from("jobs")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const formData = await req.formData();
    const rawDocumentType = String(formData.get("document_type") ?? "other").trim().toLowerCase();
    const documentType = allowedTypes.has(rawDocumentType) ? rawDocumentType : "other";
    const shareWithOperator =
      String(formData.get("share_with_operator") ?? "false").trim().toLowerCase() === "true";

    const candidates = extractUploadCandidates(formData);

    if (candidates.length === 0) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const uploadedRows: Array<Record<string, any>> = [];
    const uploadStartedAt = Date.now();

    for (let uploadIndex = 0; uploadIndex < candidates.length; uploadIndex += 1) {
      const { file, order } = candidates[uploadIndex];
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const cleanedName = safeFileName(file.name);
      const uniquePart = `${Date.now()}-${uploadIndex + 1}-${Math.random().toString(36).slice(2, 8)}`;
      const filePath = `${params.id}/${uniquePart}-${cleanedName}`;
      const contentType = contentTypeForFile(file);

      const { error: uploadError } = await admin.storage
        .from("job-documents")
        .upload(filePath, buffer, {
          contentType,
          upsert: false,
        });

      if (uploadError) {
        if (uploadedPaths.length > 0) {
          await admin.storage.from("job-documents").remove(uploadedPaths);
        }
        return NextResponse.json({ error: uploadError.message }, { status: 400 });
      }

      uploadedPaths.push(filePath);
      uploadedRows.push({
        job_id: params.id,
        file_name: file.name || cleanedName,
        file_path: filePath,
        file_type: contentType,
        document_type: documentType,
        uploaded_by: user.id,
        share_with_operator: shareWithOperator,
        created_at: new Date(uploadStartedAt + (order - 1) * 1000).toISOString(),
      });
    }

    const { error: insertError } = await admin.from("job_documents").insert(uploadedRows);

    if (insertError) {
      if (uploadedPaths.length > 0) {
        await admin.storage.from("job-documents").remove(uploadedPaths);
      }
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    try {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "job_document_uploaded",
        entity_type: "job_document",
        entity_id: params.id,
        meta: {
          job_id: params.id,
          document_type: documentType,
          share_with_operator: shareWithOperator,
          count: uploadedRows.length,
          files: uploadedRows.map((row) => ({
            file_name: row.file_name,
            file_path: row.file_path,
            file_type: row.file_type,
          })),
        },
      });
    } catch (auditError) {
      console.error("Could not write job document upload audit log", auditError);
    }

    return NextResponse.json({
      ok: true,
      count: uploadedRows.length,
      files: uploadedRows.map((row) => ({
        file_name: row.file_name,
        file_path: row.file_path,
        file_type: row.file_type,
        document_type: row.document_type,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not upload file." },
      { status: 400 }
    );
  }
}
