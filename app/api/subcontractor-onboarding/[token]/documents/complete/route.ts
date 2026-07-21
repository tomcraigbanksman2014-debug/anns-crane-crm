import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import {
  cleanSubmissionValue,
  ONBOARDING_EDITABLE_STATUSES,
  readInviteFromToken,
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
const ALLOWED_CATEGORIES = new Set([
  "driving_licence",
  "qualification",
  "insurance",
  "company_document",
  "other",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function cleanDate(value: unknown) {
  const date = cleanSubmissionValue(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

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
    const storagePath = cleanSubmissionValue(body?.path, 500);
    if (!storagePath.startsWith(`${resolved.invite.id}/`) || storagePath.includes("..")) {
      return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
    }

    const mimeType = cleanSubmissionValue(body?.mime_type, 100).toLowerCase();
    const sizeBytes = Number(body?.size_bytes ?? 0);
    const categoryRaw = cleanSubmissionValue(body?.category, 100);
    const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : "other";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: "Only PDF, JPG, PNG and WEBP files are accepted." }, { status: 400 });
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "The maximum file size is 10 MB." }, { status: 400 });
    }

    const pathParts = storagePath.split("/");
    const storedName = pathParts.pop() || "";
    const storedFolder = pathParts.join("/");
    const { data: storedFiles, error: listError } = await admin.storage
      .from(SUBCONTRACTOR_DOCUMENT_BUCKET)
      .list(storedFolder, { search: storedName, limit: 5 });
    if (listError || !(storedFiles || []).some((item) => item.name === storedName)) {
      return NextResponse.json({ error: "The uploaded file could not be verified." }, { status: 400 });
    }

    const payload = {
      invite_id: resolved.invite.id,
      category,
      original_filename: cleanSubmissionValue(body?.original_filename, 200) || "document",
      storage_bucket: SUBCONTRACTOR_DOCUMENT_BUCKET,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      qualification_name: cleanSubmissionValue(body?.qualification_name, 160) || null,
      issue_date: cleanDate(body?.issue_date),
      expiry_date: cleanDate(body?.expiry_date),
    };

    const { data, error } = await admin
      .from("subcontractor_onboarding_documents")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await admin.from("subcontractor_onboarding_events").insert({
      invite_id: resolved.invite.id,
      event_type: "document_uploaded",
      actor_type: "subcontractor",
      detail: { document_id: data.id, category: data.category, filename: data.original_filename },
    });

    return NextResponse.json({ success: true, document: data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not record the uploaded document." }, { status: 500 });
  }
}
