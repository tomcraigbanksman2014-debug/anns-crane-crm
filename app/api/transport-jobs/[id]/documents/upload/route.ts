import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

const ALLOWED_DOCUMENT_TYPES = new Set([
  "rams",
  "site_drawing",
  "photo",
  "delivery_note",
  "collection_note",
  "pod",
  "movement_order",
  "movement_order_request",
  "route_plan",
  "permit",
  "escort_confirmation",
  "authority_notice",
  "bridge_notice",
  "police_notice",
  "dimension_sheet",
  "drawing",
  "weight_sheet",
  "vehicle_configuration",
  "other",
]);

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

function redirectBack(req: Request, transportJobId: string, params: { error?: string; success?: string }) {
  const url = new URL(`/transport-jobs/${transportJobId}`, req.url);

  if (params.error) {
    url.searchParams.set("error", params.error);
  }

  if (params.success) {
    url.searchParams.set("success", params.success);
  }

  // Important for form POST uploads: use 303 so the browser follows the redirect with a GET.
  // A 307/308 can re-POST to /transport-jobs/[id], which causes the 500 screen even though the file has uploaded.
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const admin = getAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return redirectBack(req, params.id, { error: "Not signed in." });
    }

    const { data: transportJob, error: jobError } = await admin
      .from("transport_jobs")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();

    if (jobError) {
      return redirectBack(req, params.id, { error: jobError.message });
    }

    if (!transportJob) {
      return redirectBack(req, params.id, { error: "Transport job not found." });
    }

    const formData = await req.formData();
    const rawDocumentType = String(formData.get("document_type") ?? "other").trim().toLowerCase();
    const documentType = ALLOWED_DOCUMENT_TYPES.has(rawDocumentType) ? rawDocumentType : "other";
    const shareWithOperator =
      String(formData.get("share_with_operator") ?? "false").trim().toLowerCase() === "true";

    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    const fallbackFile = formData.get("file");
    if (files.length === 0 && fallbackFile instanceof File && fallbackFile.size > 0) {
      files.push(fallbackFile);
    }

    if (files.length === 0) {
      return redirectBack(req, params.id, { error: "No file selected." });
    }

    const uploadedRows: Array<Record<string, any>> = [];
    const uploadedPaths: string[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const filePath = `${params.id}/${uniquePart}-${safeName}`;

      const { error: uploadError } = await admin.storage
        .from("job-documents")
        .upload(filePath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        if (uploadedPaths.length > 0) {
          await admin.storage.from("job-documents").remove(uploadedPaths);
        }
        return redirectBack(req, params.id, { error: uploadError.message });
      }

      uploadedPaths.push(filePath);
      uploadedRows.push({
        transport_job_id: params.id,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type || null,
        document_type: documentType,
        uploaded_by: user.id,
        share_with_operator: shareWithOperator,
      });
    }

    const { error: insertError } = await admin
      .from("transport_job_documents")
      .insert(uploadedRows);

    if (insertError) {
      if (uploadedPaths.length > 0) {
        await admin.storage.from("job-documents").remove(uploadedPaths);
      }
      return redirectBack(req, params.id, { error: insertError.message });
    }

    try {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "transport_job_document_uploaded",
        entity_type: "transport_job_document",
        entity_id: params.id,
        meta: {
          transport_job_id: params.id,
          document_type: documentType,
          share_with_operator: shareWithOperator,
          files: uploadedRows.map((row) => ({
            file_name: row.file_name,
            file_path: row.file_path,
            file_type: row.file_type,
          })),
        },
      });
    } catch (auditError) {
      console.error("Transport document uploaded but audit log failed", auditError);
    }

    return redirectBack(req, params.id, {
      success: uploadedRows.length === 1 ? "Document uploaded." : `${uploadedRows.length} documents uploaded.`,
    });
  } catch (e: any) {
    return redirectBack(req, params.id, { error: e?.message ?? "Upload failed." });
  }
}
