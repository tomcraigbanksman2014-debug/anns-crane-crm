import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

type Payload = {
  equipment_id?: string | null;
};

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: { jobId: string } }
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

    const body = (await req.json().catch(() => ({}))) as Payload;
    const equipmentId = norm(body.equipment_id);

    const { error } = await supabase
      .from("jobs")
      .update({ equipment_id: equipmentId })
      .eq("id", params.jobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "update",
      entity_type: "planner_dispatch",
      entity_id: params.jobId,
      meta: {
        job_id: params.jobId,
        equipment_id: equipmentId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update dispatch." },
      { status: 400 }
    );
  }
}
