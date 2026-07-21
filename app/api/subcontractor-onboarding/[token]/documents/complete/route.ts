import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import {
  cleanSubmissionValue,
  ONBOARDING_EDITABLE_STATUSES,
  readInviteFromToken,
  SUBCONTRACTOR_DOCUMENT_BUCKET,
} from "../../../../../lib/subcontractorOnboarding";
import {
  detectAllowedDocumentMime,
  getClientIp,
  hashOnboardingValue,
  MAX_ONBOARDING_DOCUMENTS,
  MAX_ONBOARDING_FILE_BYTES,
  MAX_ONBOARDING_TOTAL_BYTES,
  publicApiError,
  readJsonBodyLimited,
  requestBodyTooLarge,
  requireOnboardingRateLimit,
} from "../../../../../lib/subcontractorOnboardingSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_CATEGORIES = new Set([
  "driving_licence",
  "qualification",
  "insurance",
  "company_document",
  "other",
]);

function cleanDate(value: unknown) {
  const date = cleanSubmissionValue(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

async function rejectUpload(admin: any, intent: any, reason: string) {
  if (intent?.storage_path) {
    const { error } = await admin.storage
      .from(SUBCONTRACTOR_DOCUMENT_BUCKET)
      .remove([intent.storage_path]);
    if (error) console.error("Could not remove rejected onboarding upload", error.message);
  }
  if (intent?.id) {
    await admin
      .from("subcontractor_onboarding_upload_intents")
      .delete()
      .eq("id", intent.id);
  }
  console.warn("Rejected subcontractor onboarding upload", {
    intent_id: intent?.id,
    reason,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    if (requestBodyTooLarge(request.headers, 20 * 1024)) {
      return NextResponse.json({ error: "Upload completion request is too large." }, { status: 413 });
    }

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

    const ipHash = hashOnboardingValue("ip", getClientIp(request.headers));
    await requireOnboardingRateLimit(admin, {
      keyHash: ipHash,
      action: "upload_complete_ip_hour",
      windowSeconds: 60 * 60,
      maxRequests: 30,
      inviteId: resolved.invite.id,
    });
    await requireOnboardingRateLimit(admin, {
      keyHash: hashOnboardingValue("invite", resolved.invite.id),
      action: "upload_complete_invite_hour",
      windowSeconds: 60 * 60,
      maxRequests: 20,
      inviteId: resolved.invite.id,
    });

    const body = await readJsonBodyLimited(request, 20480);
    const intentId = cleanSubmissionValue(body?.upload_intent_id, 60);
    const storagePath = cleanSubmissionValue(body?.path, 500);

    if (!/^[0-9a-f-]{36}$/i.test(intentId)) {
      return NextResponse.json({ error: "Invalid upload session." }, { status: 400 });
    }

    const { data: intent, error: intentError } = await admin
      .from("subcontractor_onboarding_upload_intents")
      .select("*")
      .eq("id", intentId)
      .eq("invite_id", resolved.invite.id)
      .eq("storage_path", storagePath)
      .is("completed_at", null)
      .maybeSingle();

    if (intentError) throw intentError;
    if (!intent || new Date(intent.expires_at).getTime() <= Date.now()) {
      if (intent) await rejectUpload(admin, intent, "expired upload intent");
      return NextResponse.json({ error: "The upload session expired. Please upload the file again." }, { status: 410 });
    }

    if (!storagePath.startsWith(`${resolved.invite.id}/`) || storagePath.includes("..")) {
      await rejectUpload(admin, intent, "invalid storage path");
      return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
    }

    const { data: blob, error: downloadError } = await admin.storage
      .from(SUBCONTRACTOR_DOCUMENT_BUCKET)
      .download(storagePath);

    if (downloadError || !blob) {
      await rejectUpload(admin, intent, "uploaded object missing");
      return NextResponse.json({ error: "The uploaded file could not be verified." }, { status: 400 });
    }

    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const actualSize = bytes.byteLength;
    const detectedMime = detectAllowedDocumentMime(bytes);

    if (
      actualSize < 1 ||
      actualSize > MAX_ONBOARDING_FILE_BYTES ||
      actualSize !== Number(intent.declared_size_bytes) ||
      !detectedMime ||
      detectedMime !== String(intent.declared_mime_type || "").toLowerCase()
    ) {
      await rejectUpload(admin, intent, "file size or signature did not match declaration");
      return NextResponse.json(
        { error: "The uploaded file type or size could not be verified." },
        { status: 400 }
      );
    }

    const { data: existingDocuments, error: documentsError } = await admin
      .from("subcontractor_onboarding_documents")
      .select("size_bytes")
      .eq("invite_id", resolved.invite.id);
    if (documentsError) throw documentsError;

    const completedCount = existingDocuments?.length ?? 0;
    const completedBytes = (existingDocuments ?? []).reduce(
      (sum: number, row: any) => sum + Math.max(0, Number(row.size_bytes ?? 0)),
      0
    );

    if (
      completedCount >= MAX_ONBOARDING_DOCUMENTS ||
      completedBytes + actualSize > MAX_ONBOARDING_TOTAL_BYTES
    ) {
      await rejectUpload(admin, intent, "application document allowance exceeded");
      return NextResponse.json(
        { error: "This application has reached its document allowance." },
        { status: 400 }
      );
    }

    const categoryRaw = cleanSubmissionValue(body?.category, 100);
    const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : "other";
    const payload = {
      invite_id: resolved.invite.id,
      category,
      original_filename: String(intent.original_filename || "document").slice(0, 200),
      storage_bucket: SUBCONTRACTOR_DOCUMENT_BUCKET,
      storage_path: storagePath,
      mime_type: detectedMime,
      size_bytes: actualSize,
      qualification_name: cleanSubmissionValue(body?.qualification_name, 160) || null,
      issue_date: cleanDate(body?.issue_date),
      expiry_date: cleanDate(body?.expiry_date),
    };

    const { data, error } = await admin
      .from("subcontractor_onboarding_documents")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    const { error: completeIntentError } = await admin
      .from("subcontractor_onboarding_upload_intents")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", intent.id)
      .is("completed_at", null);
    if (completeIntentError) {
      console.error("Could not complete onboarding upload intent", completeIntentError.message);
    }

    await admin.from("subcontractor_onboarding_events").insert({
      invite_id: resolved.invite.id,
      event_type: "document_uploaded",
      actor_type: "subcontractor",
      detail: {
        document_id: data.id,
        category: data.category,
        filename: data.original_filename,
        detected_mime_type: detectedMime,
        size_bytes: actualSize,
        ip_hash: ipHash,
      },
    });

    return NextResponse.json({ success: true, document: data });
  } catch (error: any) {
    console.error("Public subcontractor upload completion failed", error);
    const response = publicApiError(error, "Could not record the uploaded document.");
    return NextResponse.json({ error: response.error }, { status: response.status });
  }
}
