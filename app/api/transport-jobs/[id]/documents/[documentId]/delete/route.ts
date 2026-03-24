import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(
  req: Request,
  { params }: { params: { id: string; documentId: string } }
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

    const { data: doc, error: docError } = await supabase
      .from("transport_job_documents")
      .select("id, transport_job_id, file_name, file_path, document_type")
      .eq("id", params.documentId)
      .eq("transport_job_id", params.id)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const { error: storageError } = await supabase.storage
      .from("job-documents")
      .remove([doc.file_path]);

    if (storageError) {
      return NextResponse.json({ error: storageError.message }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from("transport_job_documents")
      .delete()
      .eq("id", params.documentId)
      .eq("transport_job_id", params.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "transport_job_document_deleted",
      entity_type: "transport_job_document",
      entity_id: params.documentId,
      meta: {
        transport_job_id: params.id,
        file_name: doc.file_name,
        file_path: doc.file_path,
        document_type: doc.document_type,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not delete document." },
      { status: 400 }
    );
  }
}
