import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";

type InitPreviewUpload = {
  page_number: number;
  file_name?: string | null;
  content_type?: string | null;
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function toBool(value: unknown) {
  return String(value ?? "false").trim().toLowerCase() === "true" || value === true;
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
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
  if (!Array.isArray(value)) return [] as InitPreviewUpload[];

  const allowed = new Set(allowedPages);

  return value
    .map((item: any) => ({
      page_number: Number(item?.page_number),
      file_name: cleanString(item?.file_name || `page-${item?.page_number}.jpg`),
      content_type: cleanString(item?.content_type || "image/jpeg") || "image/jpeg",
    }))
    .filter((item) => Number.isFinite(item.page_number) && allowed.has(Math.trunc(item.page_number)))
    .map((item) => ({
      page_number: Math.trunc(item.page_number),
      file_name: item.file_name,
      content_type: item.content_type,
    }));
}

function extensionForContentType(contentType: string) {
  const value = contentType.toLowerCase();
  if (value.includes("png")) return "png";
  if (value.includes("webp")) return "webp";
  return "jpg";
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

    const { data: vehicle, error: vehicleError } = await admin
      .from("vehicles")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();

    if (vehicleError) {
      return NextResponse.json({ error: vehicleError.message }, { status: 400 });
    }

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    const body = await req.json();

    const title = cleanString(body?.title);
    const documentType = cleanString(body?.document_type) || "spec_sheet";
    const includeInPack = toBool(body?.include_in_pack);
    const appendixOrder = Number(body?.appendix_order || 10);
    const fileName = cleanString(body?.original_file_name);
    const mimeType = cleanString(body?.original_file_type) || "application/pdf";
    const fileSize = Number(body?.original_file_size || 0);
    const previewPageNumbers = normalisePageNumbers(body?.preview_page_numbers);
    const previewUploads = includeInPack
      ? normalisePreviewUploads(body?.preview_uploads, previewPageNumbers)
      : [];

    if (!fileName) {
      return NextResponse.json({ error: "Original PDF file name is required." }, { status: 400 });
    }

    const documentId = crypto.randomUUID();
    const storagePath = `vehicles/${params.id}/${Date.now()}-${safeName(fileName)}`;

    const { data: fileUpload, error: fileUploadError } = await admin.storage
      .from("asset-documents")
      .createSignedUploadUrl(storagePath);

    if (fileUploadError || !fileUpload?.token) {
      return NextResponse.json(
        { error: fileUploadError?.message || "Could not prepare PDF upload." },
        { status: 400 }
      );
    }

    const preparedPreviewUploads: Array<{
      bucket: string;
      path: string;
      token: string;
      page_number: number;
      file_name: string;
      content_type: string;
    }> = [];

    for (const preview of previewUploads) {
      const ext = extensionForContentType(preview.content_type || "image/jpeg");
      const previewPath = `vehicles/${params.id}/${documentId}/page-${preview.page_number}.${ext}`;

      const { data: previewUpload, error: previewUploadError } = await admin.storage
        .from("asset-doc-previews")
        .createSignedUploadUrl(previewPath);

      if (previewUploadError || !previewUpload?.token) {
        return NextResponse.json(
          {
            error:
              previewUploadError?.message ||
              `Could not prepare preview upload for page ${preview.page_number}.`,
          },
          { status: 400 }
        );
      }

      preparedPreviewUploads.push({
        bucket: "asset-doc-previews",
        path: previewPath,
        token: previewUpload.token,
        page_number: preview.page_number,
        file_name: preview.file_name || `page-${preview.page_number}.${ext}`,
        content_type: preview.content_type || "image/jpeg",
      });
    }

    return NextResponse.json({
      ok: true,
      upload: {
        document_id: documentId,
        title: title || fileName.replace(/\.pdf$/i, ""),
        document_type: documentType,
        include_in_pack: includeInPack,
        appendix_order: Number.isFinite(appendixOrder) ? appendixOrder : 10,
        original_file_name: fileName,
        original_file_type: mimeType,
        original_file_size: Number.isFinite(fileSize) ? fileSize : 0,
        preview_page_numbers: previewPageNumbers,
        storage_path: storagePath,
        file_upload: {
          bucket: "asset-documents",
          path: storagePath,
          token: fileUpload.token,
          content_type: mimeType,
          file_name: fileName,
        },
        preview_uploads: preparedPreviewUploads,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not prepare asset document upload." },
      { status: 400 }
    );
  }
}
