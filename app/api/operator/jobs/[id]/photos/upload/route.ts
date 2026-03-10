import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const authEmail = String(user.email ?? "").trim().toLowerCase();
    const authUsername = authEmail.includes("@")
      ? authEmail.split("@")[0]
      : authEmail;

    const { data: operators, error: operatorsError } = await supabase
      .from("operators")
      .select("id, full_name, email, status")
      .eq("status", "active");

    if (operatorsError) {
      return NextResponse.json({ error: operatorsError.message }, { status: 400 });
    }

    const operator =
      (operators ?? []).find((op: any) => {
        const operatorEmail = String(op.email ?? "").trim().toLowerCase();
        const operatorName = String(op.full_name ?? "").trim().toLowerCase();

        return (
          operatorEmail === authEmail ||
          operatorName === authUsername ||
          (!!authUsername && operatorEmail.startsWith(`${authUsername}@`))
        );
      }) ?? null;

    if (!operator) {
      return NextResponse.json(
        { error: "No operator record linked to this login." },
        { status: 403 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, operator_id, job_number")
      .eq("id", params.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    if (job.operator_id !== operator.id) {
      return NextResponse.json(
        { error: "This job is not assigned to you." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No photo uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${params.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("job-documents")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { error: insertError } = await supabase
      .from("job_documents")
      .insert([
        {
          job_id: params.id,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type || null,
          document_type: "photo",
          uploaded_by: user.id,
        },
      ]);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "create",
      entity_type: "operator_photo_upload",
      entity_id: params.id,
      meta: {
        job_id: params.id,
        job_number: job.job_number ?? null,
        operator_id: operator.id,
        operator_name: operator.full_name ?? null,
        file_name: file.name,
        file_path: filePath,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not upload photo." },
      { status: 400 }
    );
  }
}
