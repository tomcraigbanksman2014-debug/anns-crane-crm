import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import {
  ONBOARDING_EDITABLE_STATUSES,
  readInviteFromToken,
} from "../../../../../lib/subcontractorOnboarding";
import {
  getClientIp,
  hashOnboardingValue,
  publicApiError,
  requireOnboardingRateLimit,
} from "../../../../../lib/subcontractorOnboardingSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { token: string; documentId: string } }
) {
  try {
    const admin = createSupabaseAdminClient();
    const resolved = await readInviteFromToken(admin, params.token);
    if (!resolved.invite) {
      return NextResponse.json(
        { error: "This secure link is invalid or expired." },
        { status: resolved.error === "expired" ? 410 : 404 }
      );
    }
    if (!ONBOARDING_EDITABLE_STATUSES.has(resolved.invite.status)) {
      return NextResponse.json({ error: "This form is no longer editable." }, { status: 409 });
    }
    if (!/^[0-9a-f-]{36}$/i.test(params.documentId)) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const ipHash = hashOnboardingValue("ip", getClientIp(request.headers));
    await requireOnboardingRateLimit(admin, {
      keyHash: ipHash,
      action: "document_delete_ip_hour",
      windowSeconds: 60 * 60,
      maxRequests: 20,
      inviteId: resolved.invite.id,
    });
    await requireOnboardingRateLimit(admin, {
      keyHash: hashOnboardingValue("invite", resolved.invite.id),
      action: "document_delete_invite_hour",
      windowSeconds: 60 * 60,
      maxRequests: 20,
      inviteId: resolved.invite.id,
    });

    const { data: document, error } = await admin
      .from("subcontractor_onboarding_documents")
      .select("*")
      .eq("id", params.documentId)
      .eq("invite_id", resolved.invite.id)
      .maybeSingle();

    if (error) throw error;
    if (!document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const { error: storageError } = await admin.storage
      .from(document.storage_bucket)
      .remove([document.storage_path]);
    if (storageError) throw storageError;

    const { error: deleteError } = await admin
      .from("subcontractor_onboarding_documents")
      .delete()
      .eq("id", document.id)
      .eq("invite_id", resolved.invite.id);

    if (deleteError) throw deleteError;

    await admin
      .from("subcontractor_onboarding_upload_intents")
      .delete()
      .eq("invite_id", resolved.invite.id)
      .eq("storage_path", document.storage_path);

    await admin.from("subcontractor_onboarding_events").insert({
      invite_id: resolved.invite.id,
      event_type: "document_removed",
      actor_type: "subcontractor",
      detail: {
        document_id: document.id,
        filename: document.original_filename,
        ip_hash: ipHash,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Public subcontractor document deletion failed", error);
    const response = publicApiError(error, "Could not remove the document.");
    return NextResponse.json({ error: response.error }, { status: response.status });
  }
}
