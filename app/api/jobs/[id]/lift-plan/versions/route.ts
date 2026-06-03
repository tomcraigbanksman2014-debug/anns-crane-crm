import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";


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

async function safeSnapshotCurrent({ admin, liftPlan, user }: { admin: ReturnType<typeof getAdminClient>; liftPlan: any; user: any }) {
  if (!liftPlan?.id) return;
  try {
    await admin.from("lift_plan_versions").insert({
      lift_plan_id: liftPlan.id,
      job_id: liftPlan.job_id,
      snapshot_data: liftPlan,
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
      reason: "before_restore_previous_version",
    });
  } catch {
    // Do not block restore if version snapshot insert fails.
  }
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const admin = getAdminClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { data, error } = await admin
      .from("lift_plan_versions")
      .select("id, created_at, created_by_email, reason")
      .eq("job_id", params.id)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ versions: data ?? [] });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Could not load lift plan versions." }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const admin = getAdminClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const versionId = cleanUuid(body.version_id);
    if (!versionId) return NextResponse.json({ error: "Missing version id." }, { status: 400 });

    const [{ data: current, error: currentError }, { data: version, error: versionError }] = await Promise.all([
      supabase.from("lift_plans").select("*").eq("job_id", params.id).maybeSingle(),
      admin.from("lift_plan_versions").select("id, job_id, snapshot_data").eq("id", versionId).eq("job_id", params.id).maybeSingle(),
    ]);

    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
    if (versionError) return NextResponse.json({ error: versionError.message }, { status: 400 });
    if (!version?.snapshot_data) return NextResponse.json({ error: "Selected previous draft was not found." }, { status: 404 });
    if (current?.paperwork_locked) return NextResponse.json({ error: "Paperwork is locked. Unlock it before restoring a previous draft." }, { status: 403 });

    await safeSnapshotCurrent({ admin, liftPlan: current, user });

    const snapshot = { ...(version.snapshot_data as Record<string, any>) };
    delete snapshot.id;
    delete snapshot.created_at;
    snapshot.job_id = params.id;
    snapshot.updated_at = new Date().toISOString();
    snapshot.paperwork_locked = false;
    snapshot.finalised_at = null;

    let restoredId = current?.id ?? null;
    if (current?.id) {
      const { error: updateError } = await supabase
        .from("lift_plans")
        .update(snapshot)
        .eq("job_id", params.id);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
      restoredId = current.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("lift_plans")
        .insert({ ...snapshot, created_at: new Date().toISOString() })
        .select("id")
        .single();
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });
      restoredId = inserted?.id ?? null;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "lift_plan_version_restored",
      entity_type: "lift_plan",
      entity_id: restoredId,
      meta: { job_id: params.id, version_id: versionId },
    });

    return NextResponse.json({ ok: true, restored_id: restoredId });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Could not restore previous lift plan draft." }, { status: 400 });
  }
}
