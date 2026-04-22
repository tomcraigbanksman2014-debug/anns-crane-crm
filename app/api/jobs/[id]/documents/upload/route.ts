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
    const file = formData.get("file");
    const rawDocumentType = String(formData.get("document_type") ?? "other").trim().toLowerCase();
    const documentType = allowedTypes.has(rawDocumentType) ? rawDocumentType : "other";
    const shareWithOperator =
      String(formData.get("share_with_operator") ?? "false").trim().toLowerCase() === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${params.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await admin.storage
      .from("job-documents")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { error: insertError } = await admin.from("job_documents").insert([
      {
        job_id: params.id,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type || null,
        document_type: documentType,
        uploaded_by: user.id,
        share_with_operator: shareWithOperator,
      },
    ]);

    if (insertError) {
      await admin.storage.from("job-documents").remove([filePath]);
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
        file_name: file.name,
        file_path: filePath,
        document_type: documentType,
        share_with_operator: shareWithOperator,
      },
    });

    return NextResponse.json({ ok: true, file_path: filePath, document_type: documentType });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not upload file." },
      { status: 400 }
    );
  }
}
