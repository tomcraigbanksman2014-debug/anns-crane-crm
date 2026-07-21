import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

type Payload = {
  job_id?: string | null;
  equipment_id?: string | null;
};

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Payload;

    const jobId = norm(body.job_id);
    const equipmentId = norm(body.equipment_id);

    if (!jobId) {
      return NextResponse.json({ error: "Job is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("jobs")
      .update({ equipment_id: equipmentId })
      .eq("id", jobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "update",
      entity_type: "planner_dispatch",
      entity_id: jobId,
      meta: {
        job_id: jobId,
        equipment_id: equipmentId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not dispatch job." },
      { status: 400 }
    );
  }
}
