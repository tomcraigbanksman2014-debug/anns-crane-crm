import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

function cleanText(value: unknown) {
  const s = String(value ?? "").trim();
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

    const body = await req.json().catch(() => ({}));

    const jobId = cleanText(body.job_id);
    const operatorId = cleanText(body.operator_id);
    const equipmentId = cleanText(body.equipment_id);
    const jobDate = cleanText(body.job_date);
    const status = cleanText(body.status);

    if (!jobId) {
      return NextResponse.json({ error: "Job id is required." }, { status: 400 });
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.hasOwnProperty("operator_id")) updateData.operator_id = operatorId;
    if (body.hasOwnProperty("equipment_id")) updateData.equipment_id = equipmentId;
    if (body.hasOwnProperty("job_date")) updateData.job_date = jobDate;
    if (body.hasOwnProperty("status")) updateData.status = status;

    const { error } = await supabase
      .from("jobs")
      .update(updateData)
      .eq("id", jobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "planner_update",
      entity_type: "job",
      entity_id: jobId,
      meta: updateData,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update planner job." },
      { status: 400 }
    );
  }
}
