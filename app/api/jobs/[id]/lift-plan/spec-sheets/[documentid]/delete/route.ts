import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../../../../lib/supabase/admin";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function POST(
  _req: Request,
  { params }: { params: { id: string; documentid: string } }
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

    const { data: doc, error: docError } = await admin
      .from("job_documents")
      .select("id, job_id, file_path, file_name, document_type")
      .eq("id", params.documentid)
      .eq("job_id", params.id)
      .maybeSingle();

    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 400 });
    }

    if (!doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const { data: previews } = await admin
      .from("asset_document_previews")
      .select("id, preview_storage_path")
      .eq("job_document_id", params.documentid);

    const previewPaths = (previews ?? [])
      .map((row: any) => String(row.preview_storage_path ?? ""))
      .filter(Boolean);

    if (previewPaths.length) {
      await admin.storage.from("asset-doc-previews").remove(previewPaths);
    }

    await admin
      .from("asset_document_previews")
      .delete()
      .eq("job_document_id", params.documentid);

    if (doc.file_path) {
      await admin.storage.from("job-documents").remove([String(doc.file_path)]);
    }

    const { error: deleteError } = await admin
      .from("job_documents")
      .delete()
      .eq("id", params.documentid)
      .eq("job_id", params.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "lift_plan_spec_sheet_deleted",
      entity_type: "job_document",
      entity_id: params.documentid,
      meta: {
        job_id: params.id,
        file_name: doc.file_name ?? null,
        document_type: doc.document_type ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not delete lift plan spec sheet." },
      { status: 400 }
    );
  }
}
