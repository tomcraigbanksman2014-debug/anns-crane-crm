import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const formData = await req.formData();
    const file = formData.get("file");
    const documentType = String(formData.get("document_type") ?? "other").trim() || "other";
    const shareWithOperator =
      String(formData.get("share_with_operator") ?? "false").trim().toLowerCase() === "true";

    if (!(file instanceof File)) {
      return NextResponse.redirect(
        new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent("No file selected.")}`, req.url)
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${params.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("job-documents")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.redirect(
        new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent(uploadError.message)}`, req.url)
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
        uploaded_by: user?.id ?? null,
        share_with_operator: shareWithOperator,
      });

    if (insertError) {
      return NextResponse.redirect(
        new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent(insertError.message)}`, req.url)
      );
    }

    return NextResponse.redirect(
      new URL(`/transport-jobs/${params.id}?success=${encodeURIComponent("Document uploaded.")}`, req.url)
    );
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(`/transport-jobs/${params.id}?error=${encodeURIComponent(e?.message ?? "Upload failed.")}`, req.url)
    );
  }
}
