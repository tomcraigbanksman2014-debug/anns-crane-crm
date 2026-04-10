import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/apiAuth";

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

export async function POST(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

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
    const plannerGroup = clean(body.planner_group);

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
      const allocationPayload: Record<string, any> = {
        operator_id: operatorId,
        crane_id: craneId,
        updated_at: new Date().toISOString(),
      };

      if (startDate) allocationPayload.start_date = startDate;
      if (endDate) allocationPayload.end_date = endDate;
      if (startTime !== null) allocationPayload.start_time = startTime;
      if (endTime !== null) allocationPayload.end_time = endTime;

      if (craneId) {
        allocationPayload.asset_type = "crane";
      } else if (plannerGroup === "labour_only") {
        allocationPayload.asset_type = "other";
      }

      const { error: allocationError } = await supabase
        .from("job_equipment")
        .update(allocationPayload)
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
      if (endDate) jobPayload.end_date = endDate;
      if (status) jobPayload.status = status;

      const { error: jobError } = await supabase
        .from("jobs")
        .update(jobPayload)
        .eq("id", jobId);

      if (jobError) {
        return NextResponse.json({ error: jobError.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    const jobPayload: Record<string, any> = {
      operator_id: operatorId,
      crane_id: craneId,
      updated_at: new Date().toISOString(),
    };

    if (jobDate) jobPayload.job_date = jobDate;
    if (startDate) {
      jobPayload.start_date = startDate;
      jobPayload.job_date = startDate;
    }
    if (endDate) jobPayload.end_date = endDate;
    if (startTime !== null) jobPayload.start_time = startTime;
    if (endTime !== null) jobPayload.end_time = endTime;
    if (status) jobPayload.status = status;

    const { error: jobError } = await supabase
      .from("jobs")
      .update(jobPayload)
      .eq("id", jobId);

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update planner item." },
      { status: 400 }
    );
  }
}
