import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

const allowedTypes = new Set([
  "rams",
  "site_drawing",
  "photo",
  "delivery_note",
  "collection_note",
  "pod",
  "other",
]);

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();

  const formData = await req.formData();
  const file = formData.get("file");
  const rawDocumentType = String(formData.get("document_type") ?? "other").trim();
  const documentType = allowedTypes.has(rawDocumentType) ? rawDocumentType : "other";

  if (!(file instanceof File)) {
    return NextResponse.redirect(
      new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent("No file selected.")}`, req.url)
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(
      new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent("You must be signed in.")}`, req.url)
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `transport-jobs/${params.id}/${Date.now()}-${safeName}`;

  const { error: storageError } = await supabase.storage
    .from("job-documents")
    .upload(filePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (storageError) {
    return NextResponse.redirect(
      new URL(
        `/transport-jobs/${params.id}?error=${encodeURIComponent(storageError.message)}`,
        req.url
      )
    );
  }

  const { error: insertError } = await supabase
    .from("transport_job_documents")
    .insert({
      transport_job_id: params.id,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type || null,
      document_type: documentType,
      uploaded_by: user.id,
    });

  if (insertError) {
    await supabase.storage.from("job-documents").remove([filePath]);

    return NextResponse.redirect(
      new URL(
        `/transport-jobs/${params.id}?error=${encodeURIComponent(insertError.message)}`,
        req.url
      )
    );
  }

  return NextResponse.redirect(
    new URL(
      `/transport-jobs/${params.id}?success=${encodeURIComponent("Document uploaded.")}`,
      req.url
    )
  );
}
