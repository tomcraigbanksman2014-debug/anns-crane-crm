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
  return typeof File !== "undefined" && entry instanceof File && entry.size > 0;
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
  if (file.type) return file.type;

  const ext = extensionFromName(file.name);
  const byExt: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
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
  const seen = new Set<File>();
  const orders = parseOrders(formData);

  function addFile(entry: FormDataEntryValue, index: number, fieldName: string) {
    if (!isUploadedFile(entry) || seen.has(entry)) return;
    seen.add(entry);
    candidates.push({
      file: entry,
      order: orders[index] ?? candidates.length + 1,
      fieldName,
    });
  }

  for (const fieldName of uploadFieldNames) {
    const entries = formData.getAll(fieldName);
    entries.forEach((entry, index) => addFile(entry, index, fieldName));
  }

  // Fallback for older/newer forms that may post files using a different field name.
  // This keeps the route tolerant instead of rejecting a valid FormData upload.
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
        // Only clean up files uploaded during this failed attempt. Existing documents already attached
        // to the job are never removed by this upload route.
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
        // Keep multi-file drawings/photos/documents in the order chosen in the upload form.
        // Supabase default timestamps can be identical for bulk inserts, so add one second per selected file.
        created_at: new Date(uploadStartedAt + (order - 1) * 1000).toISOString(),
      });
    }

    const { error: insertError } = await admin.from("job_documents").insert(uploadedRows);

    if (insertError) {
      // Clean only the storage objects created in this failed request. Do not touch older job documents.
      if (uploadedPaths.length > 0) {
        await admin.storage.from("job-documents").remove(uploadedPaths);
      }
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    // The upload itself has succeeded by this point. Audit logging must not make the
    // user see a failed upload message when the documents are already attached.
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
