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

function cleanUuid(value: unknown) {
  const s = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
    ? s
    : null;
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; archiveId: string } }
) {
  try {
    const archiveId = cleanUuid(params.archiveId);
    if (!archiveId) return NextResponse.json({ error: "Invalid archive id." }, { status: 400 });

    const supabase = createSupabaseServerClient();
    const admin = getAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: archive, error: archiveError } = await admin
      .from("lift_plan_pdf_archives")
      .select("id, job_id, file_name, file_path")
      .eq("id", archiveId)
      .eq("job_id", params.id)
      .maybeSingle();

    if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 400 });
    if (!archive) return NextResponse.json({ error: "Archived PDF not found." }, { status: 404 });

    const filePath = String(archive.file_path ?? "").trim();
    if (filePath) {
      await admin.storage.from("job-documents").remove([filePath]);
    }

    const { error: deleteError } = await admin
      .from("lift_plan_pdf_archives")
      .delete()
      .eq("id", archiveId)
      .eq("job_id", params.id);

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "lift_plan_pdf_archive_deleted",
      entity_type: "lift_plan_pdf_archive",
      entity_id: archiveId,
      meta: {
        job_id: params.id,
        file_name: archive.file_name ?? null,
        file_path: filePath || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Could not delete archived PDF." },
      { status: 400 }
    );
  }
}

export async function POST(
  req: Request,
  context: { params: { id: string; archiveId: string } }
) {
  return DELETE(req, context);
}
