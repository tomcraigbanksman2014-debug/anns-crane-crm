import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../../../../lib/supabase/admin";
import { buildExtractedCraneProfileJson } from "../../../../../../../lib/ai/specSheetProfiles";
import { writeAuditLog } from "../../../../../../../lib/audit";

type FinalizePreviewUpload = {
  page_number: number;
  preview_storage_path: string;
  preview_file_name?: string | null;
  content_type?: string | null;
};

const allowedTypes = new Set(["spec_sheet", "load_chart", "manual"]);

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function toBool(value: unknown) {
  return String(value ?? "false").trim().toLowerCase() === "true" || value === true;
}

function normalisePageNumbers(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
        .map((item) => Math.trunc(item))
    )
  ).sort((a, b) => a - b);
}

function normalisePreviewUploads(value: unknown, allowedPages: number[]) {
  if (!Array.isArray(value)) return [] as FinalizePreviewUpload[];

  const allowed = new Set(allowedPages);

  return value
    .map((item: any) => ({
      page_number: Number(item?.page_number),
      preview_storage_path: cleanString(item?.preview_storage_path),
      preview_file_name: cleanString(item?.preview_file_name || `page-${item?.page_number}`),
      content_type: cleanString(item?.content_type || "image/jpeg"),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.page_number) &&
        allowed.has(Math.trunc(item.page_number)) &&
        !!item.preview_storage_path
    )
    .map((item) => ({
      page_number: Math.trunc(item.page_number),
      preview_storage_path: item.preview_storage_path,
      preview_file_name: item.preview_file_name,
      content_type: item.content_type,
    }));
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const admin = createSupabaseAdminClient();

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

    const body = await req.json();

    const documentId = cleanString(body?.document_id);
    const title = cleanString(body?.title);
    const rawDocumentType = cleanString(body?.document_type) || "spec_sheet";
    const documentType = allowedTypes.has(rawDocumentType) ? rawDocumentType : "spec_sheet";
    const includeInPack = toBool(body?.include_in_pack);
    const appendixOrder = Number(body?.appendix_order || 50);
    const fileName = cleanString(body?.original_file_name);
    const mimeType = cleanString(body?.original_file_type) || "application/pdf";
    const fileSize = Number(body?.original_file_size || 0);
    const storagePath = cleanString(body?.storage_path);
    const previewPageNumbers = normalisePageNumbers(body?.preview_page_numbers);
    const previewUploads = includeInPack
      ? normalisePreviewUploads(body?.preview_uploads, previewPageNumbers)
      : [];
    const extractedText = cleanString(body?.extracted_text).slice(0, 60000);
    const resolvedTitle = title || fileName.replace(/\.pdf$/i, "") || "Lift plan crane specification";
    const extractedProfile = extractedText
      ? buildExtractedCraneProfileJson({
          crane: { name: resolvedTitle },
          text: extractedText,
          title: resolvedTitle,
        })
      : null;

    if (!documentId || !storagePath || !fileName) {
      return NextResponse.json(
        { error: "Document finalisation payload is incomplete." },
        { status: 400 }
      );
    }

    if (!storagePath.startsWith(`${params.id}/lift-plan-specs/`)) {
      return NextResponse.json({ error: "Invalid document storage path." }, { status: 400 });
    }

    const { data: document, error: insertError } = await admin
      .from("job_documents")
      .insert({
        id: documentId,
        job_id: params.id,
        title: resolvedTitle,
        document_type: documentType,
        file_name: fileName,
        file_path: storagePath,
        file_type: mimeType,
        file_size_bytes: Number.isFinite(fileSize) ? fileSize : null,
        uploaded_by: user.id,
        share_with_operator: false,
        include_in_lift_plan_pack: includeInPack,
        appendix_order: Number.isFinite(appendixOrder) ? appendixOrder : 50,
        preview_page_numbers: previewPageNumbers,
        extracted_text: extractedText || null,
        extracted_profile: extractedProfile,
        updated_at: new Date().toISOString(),
      })
      .select("id, title, document_type, file_name, file_path, file_type, created_at, include_in_lift_plan_pack, appendix_order, preview_page_numbers")
      .single();

    if (insertError || !document) {
      return NextResponse.json(
        { error: insertError?.message || "Could not save document metadata." },
        { status: 400 }
      );
    }

    if (previewUploads.length) {
      const previewRows = previewUploads.map((preview) => ({
        job_document_id: documentId,
        page_number: preview.page_number,
        preview_storage_path: preview.preview_storage_path,
        preview_file_name: preview.preview_file_name || `page-${preview.page_number}`,
        title:
          previewUploads.length > 1
            ? `${String(document.title ?? "Document")} – page ${preview.page_number}`
            : String(document.title ?? "Document"),
        appendix_order: Number.isFinite(appendixOrder) ? appendixOrder : 50,
      }));

      const { error: previewInsertError } = await admin
        .from("asset_document_previews")
        .insert(previewRows);

      if (previewInsertError) {
        await admin.from("job_documents").delete().eq("id", documentId);
        return NextResponse.json({ error: previewInsertError.message }, { status: 400 });
      }
    }

    const { data: signed } = await admin.storage
      .from("job-documents")
      .createSignedUrl(String(document.file_path), 60 * 60);

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "lift_plan_spec_sheet_uploaded",
      entity_type: "job_document",
      entity_id: String(document.id),
      meta: {
        job_id: params.id,
        document_type: documentType,
        include_in_lift_plan_pack: includeInPack,
        preview_page_numbers: previewPageNumbers,
      },
    });

    return NextResponse.json({
      ok: true,
      document: {
        id: String(document.id),
        title: String(document.title ?? "Document"),
        document_type: String(document.document_type ?? "other"),
        file_name: document.file_name ? String(document.file_name) : null,
        file_url: document.file_path ? String(document.file_path) : null,
        storage_path: document.file_path ? String(document.file_path) : null,
        uploaded_at: document.created_at ? String(document.created_at) : null,
        include_in_pack: !!document.include_in_lift_plan_pack,
        appendix_order:
          document.appendix_order == null ? null : Number(document.appendix_order),
        preview_page_numbers: Array.isArray(document.preview_page_numbers)
          ? document.preview_page_numbers
              .map((x: any) => Number(x))
              .filter((x: number) => Number.isFinite(x))
          : [],
        preview_count: previewUploads.length,
        open_url: signed?.signedUrl ?? null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not finalise lift plan spec sheet upload." },
      { status: 400 }
    );
  }
}
