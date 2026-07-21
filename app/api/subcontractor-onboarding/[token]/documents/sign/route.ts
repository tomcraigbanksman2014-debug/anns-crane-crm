import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import {
  ONBOARDING_EDITABLE_STATUSES,
  readInviteFromToken,
  sanitizeFilename,
  SUBCONTRACTOR_DOCUMENT_BUCKET,
} from "../../../../../lib/subcontractorOnboarding";
import {
  getClientIp,
  hashOnboardingValue,
  MAX_ONBOARDING_DOCUMENTS,
  MAX_ONBOARDING_FILE_BYTES,
  MAX_ONBOARDING_TOTAL_BYTES,
  publicApiError,
  readJsonBodyLimited,
  requestBodyTooLarge,
  requireOnboardingRateLimit,
  UPLOAD_INTENT_TTL_MINUTES,
} from "../../../../../lib/subcontractorOnboardingSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

async function cleanupExpiredIntents(admin: any, inviteId: string) {
  const now = new Date().toISOString();
  const { data: stale, error } = await admin
    .from("subcontractor_onboarding_upload_intents")
    .select("id, storage_path")
    .eq("invite_id", inviteId)
    .is("completed_at", null)
    .lt("expires_at", now)
    .limit(20);

  if (error) throw error;
  if (!stale?.length) return;

  const paths = stale.map((row: any) => row.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: removeError } = await admin.storage
      .from(SUBCONTRACTOR_DOCUMENT_BUCKET)
      .remove(paths);
    if (removeError) {
      console.error("Could not remove expired onboarding uploads", removeError.message);
    }
  }

  const { error: deleteError } = await admin
    .from("subcontractor_onboarding_upload_intents")
    .delete()
    .in("id", stale.map((row: any) => row.id));
  if (deleteError) throw deleteError;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    if (requestBodyTooLarge(request.headers, 16 * 1024)) {
      return NextResponse.json({ error: "Upload request is too large." }, { status: 413 });
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
      action: "upload_sign_ip_hour",
      windowSeconds: 60 * 60,
      maxRequests: 30,
      inviteId: resolved.invite.id,
    });
    await requireOnboardingRateLimit(admin, {
      keyHash: hashOnboardingValue("invite", resolved.invite.id),
      action: "upload_sign_invite_hour",
      windowSeconds: 60 * 60,
      maxRequests: 20,
      inviteId: resolved.invite.id,
    });

    const body = await readJsonBodyLimited(request, 16384);
    const filename = sanitizeFilename(String(body?.filename ?? "document"));
    const mimeType = String(body?.mime_type ?? "").toLowerCase();
    const sizeBytes = Number(body?.size_bytes ?? 0);

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: "Only PDF, JPG, PNG and WEBP files are accepted." }, { status: 400 });
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_ONBOARDING_FILE_BYTES) {
      return NextResponse.json({ error: "The maximum file size is 5 MB." }, { status: 400 });
    }

    await cleanupExpiredIntents(admin, resolved.invite.id);

    const now = new Date().toISOString();
    const [{ data: documents, error: documentsError }, { data: activeIntents, error: intentsError }] =
      await Promise.all([
        admin
          .from("subcontractor_onboarding_documents")
          .select("size_bytes")
          .eq("invite_id", resolved.invite.id),
        admin
          .from("subcontractor_onboarding_upload_intents")
          .select("declared_size_bytes")
          .eq("invite_id", resolved.invite.id)
          .is("completed_at", null)
          .gt("expires_at", now),
      ]);

    if (documentsError || intentsError) throw documentsError || intentsError;

    const completedCount = documents?.length ?? 0;
    const pendingCount = activeIntents?.length ?? 0;
    const completedBytes = (documents ?? []).reduce(
      (sum: number, row: any) => sum + Math.max(0, Number(row.size_bytes ?? 0)),
      0
    );
    const pendingBytes = (activeIntents ?? []).reduce(
      (sum: number, row: any) => sum + Math.max(0, Number(row.declared_size_bytes ?? 0)),
      0
    );

    if (completedCount + pendingCount >= MAX_ONBOARDING_DOCUMENTS) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_ONBOARDING_DOCUMENTS} documents can be uploaded.` },
        { status: 400 }
      );
    }
    if (completedBytes + pendingBytes + sizeBytes > MAX_ONBOARDING_TOTAL_BYTES) {
      return NextResponse.json(
        { error: "The total document allowance for this application is 40 MB." },
        { status: 400 }
      );
    }

    const intentId = crypto.randomUUID();
    const storagePath = `${resolved.invite.id}/${intentId}-${filename}`;
    const expiresAt = new Date(
      Date.now() + UPLOAD_INTENT_TTL_MINUTES * 60 * 1000
    ).toISOString();

    const { error: intentError } = await admin
      .from("subcontractor_onboarding_upload_intents")
      .insert({
        id: intentId,
        invite_id: resolved.invite.id,
        storage_path: storagePath,
        original_filename: filename,
        declared_mime_type: mimeType,
        declared_size_bytes: sizeBytes,
        request_ip_hash: ipHash,
        expires_at: expiresAt,
      });
    if (intentError) throw intentError;

    const { data, error } = await admin.storage
      .from(SUBCONTRACTOR_DOCUMENT_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.token) {
      await admin
        .from("subcontractor_onboarding_upload_intents")
        .delete()
        .eq("id", intentId);
      throw error || new Error("Could not create upload token");
    }

    return NextResponse.json({
      bucket: SUBCONTRACTOR_DOCUMENT_BUCKET,
      path: storagePath,
      token: data.token,
      upload_intent_id: intentId,
      expires_at: expiresAt,
    });
  } catch (error: any) {
    console.error("Public subcontractor upload signing failed", error);
    const response = publicApiError(error, "Could not prepare the upload.");
    return NextResponse.json({ error: response.error }, { status: response.status });
  }
}
