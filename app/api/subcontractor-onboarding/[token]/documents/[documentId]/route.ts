import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import {
  ONBOARDING_EDITABLE_STATUSES,
  readInviteFromToken,
} from "../../../../../lib/subcontractorOnboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: { token: string; documentId: string } }
) {
  try {
    const admin = createSupabaseAdminClient();
    const resolved = await readInviteFromToken(admin, params.token);
    if (!resolved.invite) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.error === "expired" ? 410 : 404 });
    }
    if (!ONBOARDING_EDITABLE_STATUSES.has(resolved.invite.status)) {
      return NextResponse.json({ error: "This form is no longer editable." }, { status: 409 });
    }

    const { data: document, error } = await admin
      .from("subcontractor_onboarding_documents")
      .select("*")
      .eq("id", params.documentId)
      .eq("invite_id", resolved.invite.id)
      .maybeSingle();

    if (error || !document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    await admin.storage.from(document.storage_bucket).remove([document.storage_path]);
    const { error: deleteError } = await admin
      .from("subcontractor_onboarding_documents")
      .delete()
      .eq("id", document.id)
      .eq("invite_id", resolved.invite.id);

    if (deleteError) throw new Error(deleteError.message);

    await admin.from("subcontractor_onboarding_events").insert({
      invite_id: resolved.invite.id,
      event_type: "document_removed",
      actor_type: "subcontractor",
      detail: { document_id: document.id, filename: document.original_filename },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not remove the document." }, { status: 500 });
  }
}
