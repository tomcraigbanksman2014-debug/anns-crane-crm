import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await req.json().catch(() => ({}));

    const allocationId = clean(body.allocation_id);
    const jobId = clean(body.job_id);

    const operatorId = body.operator_id === "" ? null : clean(body.operator_id);
    const craneId = body.equipment_id === "" ? null : clean(body.equipment_id);
    const jobDate = clean(body.job_date);
    const startDate = clean(body.start_date) ?? jobDate;
    const endDate = clean(body.end_date) ?? startDate;
    const startTime = clean(body.start_time);
    const endTime = clean(body.end_time);
    const status = clean(body.status);

    if (!jobId) {
      return NextResponse.json({ error: "Job id is required." }, { status: 400 });
    }

    if (startDate && endDate && endDate < startDate) {
      return NextResponse.json(
        { error: "Job end date cannot be earlier than job start date." },
        { status: 400 }
      );
    }

    if (allocationId) {
      const updatePayload: Record<string, any> = {
        operator_id: operatorId,
        crane_id: craneId,
        updated_at: new Date().toISOString(),
      };

      if (startDate) updatePayload.start_date = startDate;
      if (endDate) updatePayload.end_date = endDate;
      if (startTime !== null) updatePayload.start_time = startTime;
      if (endTime !== null) updatePayload.end_time = endTime;

      const { error: allocationError } = await supabase
        .from("job_equipment")
        .update(updatePayload)
        .eq("id", allocationId);

      if (allocationError) {
        return NextResponse.json({ error: allocationError.message }, { status: 400 });
      }

      const jobPayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (startDate) {
        jobPayload.job_date = startDate;
        jobPayload.start_date = startDate;
      }

      if (endDate) {
        jobPayload.end_date = endDate;
      }

      if (status) {
        jobPayload.status = status;
      }

      const { error: jobError } = await supabase
        .from("jobs")
        .update(jobPayload)
        .eq("id", jobId);

      if (jobError) {
        return NextResponse.json({ error: jobError.message }, { status: 400 });
      }
    } else {
      const updatePayload: Record<string, any> = {
        operator_id: operatorId,
        crane_id: craneId,
        updated_at: new Date().toISOString(),
      };

      if (jobDate) updatePayload.job_date = jobDate;
      if (startDate) updatePayload.start_date = startDate;
      if (endDate) updatePayload.end_date = endDate;
      if (startTime !== null) updatePayload.start_time = startTime;
      if (endTime !== null) updatePayload.end_time = endTime;
      if (status) updatePayload.status = status;

      const { error } = await supabase
        .from("jobs")
        .update(updatePayload)
        .eq("id", jobId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update planner item." },
      { status: 400 }
    );
  }
}
