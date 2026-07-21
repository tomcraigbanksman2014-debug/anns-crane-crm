import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import {
  ONBOARDING_EDITABLE_STATUSES,
  readInviteFromToken,
  sanitizeFilename,
  SUBCONTRACTOR_DOCUMENT_BUCKET,
} from "../../../../../lib/subcontractorOnboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
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

    const body = await request.json();
    const filename = sanitizeFilename(String(body?.filename ?? "document"));
    const mimeType = String(body?.mime_type ?? "").toLowerCase();
    const sizeBytes = Number(body?.size_bytes ?? 0);

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: "Only PDF, JPG, PNG and WEBP files are accepted." }, { status: 400 });
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "The maximum file size is 10 MB." }, { status: 400 });
    }

    const { count } = await admin
      .from("subcontractor_onboarding_documents")
      .select("id", { count: "exact", head: true })
      .eq("invite_id", resolved.invite.id);

    if (Number(count ?? 0) >= 20) {
      return NextResponse.json({ error: "A maximum of 20 documents can be uploaded." }, { status: 400 });
    }

    const storagePath = `${resolved.invite.id}/${crypto.randomUUID()}-${filename}`;
    const { data, error } = await admin.storage
      .from(SUBCONTRACTOR_DOCUMENT_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.token) {
      throw new Error(error?.message || "Could not create a secure upload link.");
    }

    return NextResponse.json({
      bucket: SUBCONTRACTOR_DOCUMENT_BUCKET,
      path: storagePath,
      token: data.token,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not prepare the upload." }, { status: 500 });
  }
}
