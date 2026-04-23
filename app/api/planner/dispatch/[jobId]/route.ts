import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";
import { assertOperatorAvailable } from "../../../../lib/staffAvailability";

type Payload = {
  equipment_id?: string | null;
  operator_id?: string | null;
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

    const payload = {
      equipment_id:
        body.equipment_id !== undefined ? norm(body.equipment_id) : undefined,
      operator_id:
        body.operator_id !== undefined ? norm(body.operator_id) : undefined,
    };

    const updateData: Record<string, string | null> = {};

    if (payload.equipment_id !== undefined) {
      updateData.equipment_id = payload.equipment_id;
    }

    if (payload.operator_id !== undefined) {
      updateData.operator_id = payload.operator_id;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    if (payload.operator_id) {
      const { data: existingJob, error: existingJobError } = await supabase
        .from("jobs")
        .select("id, start_date, end_date, job_date, start_time, end_time")
        .eq("id", params.jobId)
        .single();

      if (existingJobError || !existingJob) {
        return NextResponse.json({ error: "Job not found." }, { status: 404 });
      }

      await assertOperatorAvailable(supabase, {
        operatorId: payload.operator_id,
        startDate: existingJob.start_date ?? existingJob.job_date,
        endDate: existingJob.end_date ?? existingJob.start_date ?? existingJob.job_date,
        startTime: existingJob.start_time,
        endTime: existingJob.end_time,
      });
    }

    const { error } = await supabase
      .from("jobs")
      .update(updateData)
      .eq("id", params.jobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "planner_dispatch_updated",
      entity_type: "planner_dispatch",
      entity_id: params.jobId,
      meta: {
        job_id: params.jobId,
        ...updateData,
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
