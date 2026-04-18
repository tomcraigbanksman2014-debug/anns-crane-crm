import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function parseBool(value: FormDataEntryValue | null) {
  return String(value ?? "false").trim().toLowerCase() === "true";
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function parsePageNumbers(value: string) {
  return String(value ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.trunc(item));
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

    const { data: crane, error: craneError } = await admin
      .from("cranes")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();

    if (craneError) {
      return NextResponse.json({ error: craneError.message }, { status: 400 });
    }

    if (!crane) {
      return NextResponse.json({ error: "Crane not found." }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const title = clean(formData.get("title"));
    const documentType = clean(formData.get("document_type")) || "spec_sheet";
    const includeInPack = parseBool(formData.get("include_in_pack"));
    const appendixOrder = Number(clean(formData.get("appendix_order")) || "10");
    const previewPageNumbers = parsePageNumbers(formData.get("preview_page_numbers"));
    const previewFiles = formData
      .getAll("preview_files")
      .filter((item): item is File => item instanceof File);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No PDF uploaded." }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are allowed." }, { status: 400 });
    }

    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `cranes/${params.id}/${Date.now()}-${safeName(file.name)}`;

    const { error: uploadError } = await admin.storage
      .from("asset-documents")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { data: document, error: insertError } = await admin
      .from("crane_documents")
      .insert({
        crane_id: params.id,
        title: title || file.name.replace(/\.pdf$/i, ""),
        document_type: documentType,
        file_url: storagePath,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        file_size_bytes: file.size,
        include_in_pack: includeInPack,
        appendix_order: Number.isFinite(appendixOrder) ? appendixOrder : 10,
        preview_page_numbers: previewPageNumbers,
        uploaded_by: user.id,
      })
      .select(
        "id, title, document_type, file_name, file_url, storage_path, uploaded_at, include_in_pack, appendix_order, preview_page_numbers"
      )
      .single();

    if (insertError || !document) {
      await admin.storage.from("asset-documents").remove([storagePath]);
      return NextResponse.json(
        { error: insertError?.message || "Could not save document metadata." },
        { status: 400 }
      );
    }

    const createdPreviewPaths: string[] = [];

    if (includeInPack && previewFiles.length) {
      for (let index = 0; index < previewFiles.length; index += 1) {
        const previewFile = previewFiles[index];
        const pageNumber = previewPageNumbers[index] ?? index + 1;
        const previewPath = `cranes/${params.id}/${document.id}/page-${pageNumber}.png`;

        const previewBuffer = Buffer.from(await previewFile.arrayBuffer());

        const { error: previewUploadError } = await admin.storage
          .from("asset-doc-previews")
          .upload(previewPath, previewBuffer, {
            contentType: previewFile.type || "image/png",
            upsert: false,
          });

        if (previewUploadError) {
          await admin.from("asset_document_previews").delete().eq("crane_document_id", document.id);
          await admin.from("crane_documents").delete().eq("id", document.id);
          await admin.storage.from("asset-documents").remove([storagePath]);
          if (createdPreviewPaths.length) {
            await admin.storage.from("asset-doc-previews").remove(createdPreviewPaths);
          }

          return NextResponse.json({ error: previewUploadError.message }, { status: 400 });
        }

        createdPreviewPaths.push(previewPath);

        const { error: previewInsertError } = await admin
          .from("asset_document_previews")
          .insert({
            crane_document_id: document.id,
            page_number: pageNumber,
            preview_storage_path: previewPath,
            preview_file_name: previewFile.name,
            title:
              previewFiles.length > 1
                ? `${String(document.title ?? "Document")} – page ${pageNumber}`
                : String(document.title ?? "Document"),
            appendix_order: Number.isFinite(appendixOrder) ? appendixOrder : 10,
          });

        if (previewInsertError) {
          await admin.from("asset_document_previews").delete().eq("crane_document_id", document.id);
          await admin.from("crane_documents").delete().eq("id", document.id);
          await admin.storage.from("asset-documents").remove([storagePath]);
          if (createdPreviewPaths.length) {
            await admin.storage.from("asset-doc-previews").remove(createdPreviewPaths);
          }

          return NextResponse.json({ error: previewInsertError.message }, { status: 400 });
        }
      }
    }

    let openUrl: string | null = null;
    if (document.storage_path) {
      const { data: signed } = await admin.storage
        .from("asset-documents")
        .createSignedUrl(String(document.storage_path), 60 * 60);

      openUrl = signed?.signedUrl ?? null;
    }

    return NextResponse.json({
      ok: true,
      document: {
        id: String(document.id),
        title: String(document.title ?? "Document"),
        document_type: String(document.document_type ?? "other"),
        file_name: document.file_name ? String(document.file_name) : null,
        file_url: document.file_url ? String(document.file_url) : null,
        storage_path: document.storage_path ? String(document.storage_path) : null,
        uploaded_at: document.uploaded_at ? String(document.uploaded_at) : null,
        include_in_pack: !!document.include_in_pack,
        appendix_order:
          document.appendix_order == null ? null : Number(document.appendix_order),
        preview_page_numbers: Array.isArray(document.preview_page_numbers)
          ? document.preview_page_numbers.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x))
          : [],
        preview_count: createdPreviewPaths.length,
        open_url: openUrl,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not upload document." },
      { status: 400 }
    );
  }
}
