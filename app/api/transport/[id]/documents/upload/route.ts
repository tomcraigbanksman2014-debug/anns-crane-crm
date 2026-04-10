import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../../lib/audit";

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

function matchesOperatorLogin(authEmail: string, operator: any) {
  const email = String(authEmail ?? "").trim().toLowerCase();
  const username = email.includes("@") ? email.split("@")[0] : email;

  const operatorEmail = String(operator?.email ?? "").trim().toLowerCase();
  const operatorEmailUsername = operatorEmail.includes("@")
    ? operatorEmail.split("@")[0]
    : operatorEmail;
  const operatorName = String(operator?.full_name ?? "").trim().toLowerCase();

  return (
    (!!operatorEmail && operatorEmail === email) ||
    (!!operatorEmailUsername && operatorEmailUsername === username) ||
    (!!operatorName && operatorName === username)
  );
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

    const authEmail = String(user.email ?? "").trim().toLowerCase();

    const { data: operators, error: operatorsError } = await admin
      .from("operators")
      .select("id, full_name, email, status")
      .eq("status", "active");

    if (operatorsError) {
      return NextResponse.json({ error: operatorsError.message }, { status: 400 });
    }

    const operator =
      (operators ?? []).find((op: any) => matchesOperatorLogin(authEmail, op)) ?? null;

    if (!operator) {
      return NextResponse.json(
        { error: "No operator record linked to this login." },
        { status: 403 }
      );
    }

    const { data: job, error: jobError } = await admin
      .from("transport_jobs")
      .select("id, transport_number, operator_id")
      .eq("id", params.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Transport job not found." }, { status: 404 });
    }

    if (String(job.operator_id ?? "") !== String(operator.id)) {
      return NextResponse.json(
        { error: "This transport job is not assigned to you." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const documentType = String(formData.get("document_type") ?? "photo").trim() || "photo";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No document uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `transport-${params.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await admin.storage
      .from("job-documents")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { error: insertError } = await admin
      .from("transport_job_documents")
      .insert([
        {
          transport_job_id: params.id,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type || null,
          document_type: documentType,
          uploaded_by: user.id,
          share_with_operator: false,
        },
      ]);

    if (insertError) {
      await admin.storage.from("job-documents").remove([filePath]);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "operator_transport_document_uploaded",
      entity_type: "operator_transport_document",
      entity_id: params.id,
      meta: {
        transport_job_id: params.id,
        transport_number: job.transport_number ?? null,
        operator_id: operator.id,
        operator_name: operator.full_name ?? null,
        file_name: file.name,
        file_path: filePath,
        document_type: documentType,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not upload transport document." },
      { status: 400 }
    );
  }
}
