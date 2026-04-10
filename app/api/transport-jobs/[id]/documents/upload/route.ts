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
      return NextResponse.redirect(
        new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent("Not signed in.")}`, req.url)
      );
    }

    const { data: transportJob, error: jobError } = await admin
      .from("transport_jobs")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();

    if (jobError) {
      return NextResponse.redirect(
        new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent(jobError.message)}`, req.url)
      );
    }

    if (!transportJob) {
      return NextResponse.redirect(
        new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent("Transport job not found.")}`, req.url)
      );
    }

    const formData = await req.formData();
    const rawDocumentType = String(formData.get("document_type") ?? "other").trim().toLowerCase();
    const documentType = ALLOWED_DOCUMENT_TYPES.has(rawDocumentType) ? rawDocumentType : "other";
    const shareWithOperator =
      String(formData.get("share_with_operator") ?? "false").trim().toLowerCase() === "true";

    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    const fallbackFile = formData.get("file");
    if (files.length === 0 && fallbackFile instanceof File) {
      files.push(fallbackFile);
    }

    if (files.length === 0) {
      return NextResponse.redirect(
        new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent("No file selected.")}`, req.url)
      );
    }

    const uploadedRows: Array<Record<string, any>> = [];
    const uploadedPaths: string[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${params.id}/${Date.now()}-${safeName}`;

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
        return NextResponse.redirect(
          new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent(uploadError.message)}`, req.url)
        );
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
      return NextResponse.redirect(
        new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent(insertError.message)}`, req.url)
      );
    }

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

    return NextResponse.redirect(
      new URL(
        `/transport-jobs/${params.id}?success=${encodeURIComponent(
          uploadedRows.length === 1 ? "Document uploaded." : `${uploadedRows.length} documents uploaded.`
        )}`,
        req.url
      )
    );
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent(e?.message ?? "Upload failed.")}`, req.url)
    );
  }
}
