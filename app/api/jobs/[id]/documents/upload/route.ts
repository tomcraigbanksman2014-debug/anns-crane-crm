import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

const allowedTypes = new Set([
  "rams",
  "lift_plan",
  "site_drawing",
  "photo",
  "delivery_note",
  "other",
]);

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const admin = getAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: job, error: jobError } = await admin
      .from("jobs")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const formData = await req.formData();
    const rawDocumentType = String(formData.get("document_type") ?? "other").trim().toLowerCase();
    const documentType = allowedTypes.has(rawDocumentType) ? rawDocumentType : "other";
    const shareWithOperator =
      String(formData.get("share_with_operator") ?? "false").trim().toLowerCase() === "true";

    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    const fallbackFile = formData.get("file");
    if (files.length === 0 && fallbackFile instanceof File && fallbackFile.size > 0) {
      files.push(fallbackFile);
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const uploadedRows: Array<Record<string, any>> = [];
    const uploadedPaths: string[] = [];

    const uploadStartedAt = Date.now();

    for (let uploadIndex = 0; uploadIndex < files.length; uploadIndex += 1) {
      const file = files[uploadIndex];
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const filePath = `${params.id}/${uniquePart}-${safeName}`;

      const { error: uploadError } = await admin.storage
        .from("job-documents")
        .upload(filePath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        if (uploadedPaths.length > 0) {
          await admin.storage.from("job-documents").remove(uploadedPaths);
        }
        return NextResponse.json({ error: uploadError.message }, { status: 400 });
      }

      uploadedPaths.push(filePath);
      uploadedRows.push({
        job_id: params.id,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type || null,
        document_type: documentType,
        uploaded_by: user.id,
        share_with_operator: shareWithOperator,
        // Keep multi-file site drawings/photos in the order chosen in the upload form.
        // Supabase default timestamps can be identical for bulk inserts, so add one
        // second per selected file and the lift-plan appendix can safely order by created_at.
        created_at: new Date(uploadStartedAt + uploadIndex * 1000).toISOString(),
      });
    }

    const { error: insertError } = await admin.from("job_documents").insert(uploadedRows);

    if (insertError) {
      if (uploadedPaths.length > 0) {
        await admin.storage.from("job-documents").remove(uploadedPaths);
      }
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "job_document_uploaded",
      entity_type: "job_document",
      entity_id: params.id,
      meta: {
        job_id: params.id,
        document_type: documentType,
        share_with_operator: shareWithOperator,
        files: uploadedRows.map((row) => ({
          file_name: row.file_name,
          file_path: row.file_path,
          file_type: row.file_type,
        })),
      },
    });

    return NextResponse.json({
      ok: true,
      count: uploadedRows.length,
      files: uploadedRows.map((row) => ({
        file_name: row.file_name,
        file_path: row.file_path,
        document_type: row.document_type,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not upload file." },
      { status: 400 }
    );
  }
}
