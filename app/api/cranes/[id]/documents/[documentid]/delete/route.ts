import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../../../../lib/supabase/admin";

export async function POST(
  _req: Request,
  { params }: { params: { id: string; documentId: string } }
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
      .from("crane_documents")
      .select("id, crane_id, storage_path")
      .eq("id", params.documentId)
      .eq("crane_id", params.id)
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
      .eq("crane_document_id", params.documentId);

    const previewPaths = (previews ?? [])
      .map((row: any) => String(row.preview_storage_path ?? ""))
      .filter(Boolean);

    await admin.from("asset_document_previews").delete().eq("crane_document_id", params.documentId);
    const { error: deleteError } = await admin.from("crane_documents").delete().eq("id", params.documentId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    if (doc.storage_path) {
      await admin.storage.from("asset-documents").remove([String(doc.storage_path)]);
    }

    if (previewPaths.length) {
      await admin.storage.from("asset-doc-previews").remove(previewPaths);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not delete document." }, { status: 400 });
  }
}
