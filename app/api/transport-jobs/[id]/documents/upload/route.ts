import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

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
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const rawDocumentType = String(formData.get("document_type") ?? "other").trim();
    const documentType = allowedTypes.has(rawDocumentType) ? rawDocumentType : "other";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `transport-jobs/${params.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("job-documents")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { error: insertError } = await supabase
      .from("transport_job_documents")
      .insert([
        {
          transport_job_id: params.id,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type || null,
          document_type: documentType,
          uploaded_by: user.id,
        },
      ]);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "transport_job_document_uploaded",
      entity_type: "transport_job_document",
      entity_id: params.id,
      meta: {
        transport_job_id: params.id,
        file_name: file.name,
        file_path: filePath,
        document_type: documentType,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not upload document." },
      { status: 400 }
    );
  }
}
