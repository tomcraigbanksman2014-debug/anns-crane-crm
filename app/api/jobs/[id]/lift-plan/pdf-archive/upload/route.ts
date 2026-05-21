import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../../lib/audit";

const allowedStatuses = new Set(["previous_draft", "approved_copy", "superseded", "client_copy", "other"]);

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

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function safeFileName(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();
  return cleaned || "lift-plan-pack.pdf";
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
      .select("id, job_number")
      .eq("id", params.id)
      .maybeSingle();

    if (jobError) return NextResponse.json({ error: jobError.message }, { status: 400 });
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file");
    const title = cleanText(formData.get("title"), "Previous lift plan pack");
    const rawStatus = cleanText(formData.get("archive_status"), "previous_draft").toLowerCase();
    const archiveStatus = allowedStatuses.has(rawStatus) ? rawStatus : "previous_draft";
    const notes = cleanText(formData.get("notes"), "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No PDF uploaded." }, { status: 400 });
    }

    const isPdf = (file.type || "").toLowerCase().includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json({ error: "Please upload a PDF lift plan pack." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = safeFileName(file.name);
    const storagePath = `${params.id}/lift-plan-archive/${Date.now()}-${fileName.replace(/\s+/g, "_")}`;

    const { error: uploadError } = await admin.storage
      .from("job-documents")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { data: archive, error: insertError } = await admin
      .from("lift_plan_pdf_archives")
      .insert({
        job_id: params.id,
        title,
        archive_status: archiveStatus,
        notes: notes || null,
        file_name: file.name,
        file_path: storagePath,
        file_type: file.type || "application/pdf",
        file_size_bytes: file.size || buffer.length,
        uploaded_by: user.id,
        uploaded_by_email: user.email ?? null,
      })
      .select("id, title, archive_status, notes, file_name, file_path, file_type, file_size_bytes, uploaded_by_email, created_at")
      .single();

    if (insertError) {
      await admin.storage.from("job-documents").remove([storagePath]);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "lift_plan_pdf_archived",
      entity_type: "lift_plan_pdf_archive",
      entity_id: archive?.id ?? params.id,
      meta: {
        job_id: params.id,
        job_number: job.job_number ?? null,
        file_name: file.name,
        file_path: storagePath,
        archive_status: archiveStatus,
      },
    });

    const { data: signedData } = await admin.storage
      .from("job-documents")
      .createSignedUrl(storagePath, 60 * 60);

    return NextResponse.json({
      ok: true,
      archive_id: archive?.id ?? null,
      archive: archive
        ? {
            id: String(archive.id ?? ""),
            title: archive.title ? String(archive.title) : "Previous lift plan pack",
            archive_status: archive.archive_status ? String(archive.archive_status) : "previous_draft",
            notes: archive.notes ? String(archive.notes) : null,
            file_name: archive.file_name ? String(archive.file_name) : file.name,
            file_size_bytes: Number(archive.file_size_bytes ?? file.size ?? buffer.length) || null,
            uploaded_by_email: archive.uploaded_by_email ? String(archive.uploaded_by_email) : user.email ?? null,
            created_at: archive.created_at ? String(archive.created_at) : new Date().toISOString(),
            signed_url: signedData?.signedUrl ?? null,
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Could not archive previous lift plan PDF." },
      { status: 400 }
    );
  }
}
