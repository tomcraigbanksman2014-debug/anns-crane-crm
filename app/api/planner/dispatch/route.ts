import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

interface DispatchPayload {
  jobId: string;
  equipmentId: string;
  dispatchDate: string;
  startTime?: string | null;
  endTime?: string | null;
  operatorName?: string | null;
  notes?: string | null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as DispatchPayload;

    if (!body.jobId || !body.equipmentId || !body.dispatchDate) {
      return NextResponse.json(
        { error: "jobId, equipmentId and dispatchDate are required" },
        { status: 400 }
      );
    }

    const { data: existingDispatch } = await supabase
      .from("job_dispatches")
      .select("id")
      .eq("job_id", body.jobId)
      .maybeSingle();

    let result;

    if (existingDispatch) {
      result = await supabase
        .from("job_dispatches")
        .update({
          equipment_id: body.equipmentId,
          dispatch_date: body.dispatchDate,
          start_time: body.startTime ?? null,
          end_time: body.endTime ?? null,
          operator_name: body.operatorName ?? null,
          notes: body.notes ?? null,
          updated_by: user.id,
        })
        .eq("id", existingDispatch.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("job_dispatches")
        .insert({
          job_id: body.jobId,
          equipment_id: body.equipmentId,
          dispatch_date: body.dispatchDate,
          start_time: body.startTime ?? null,
          end_time: body.endTime ?? null,
          operator_name: body.operatorName ?? null,
          notes: body.notes ?? null,
          created_by: user.id,
          updated_by: user.id,
        })
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 }
      );
    }

    await logAuditEvent({
      action: existingDispatch ? "planner.dispatch.updated" : "planner.dispatch.created",
      entityType: "job_dispatch",
      entityId: result.data.id,
      meta: {
        jobId: body.jobId,
        equipmentId: body.equipmentId,
        dispatchDate: body.dispatchDate,
      },
    });

    return NextResponse.json({ success: true, dispatch: result.data });
  } catch (error) {
    console.error("Planner dispatch POST failed", error);
    return NextResponse.json(
      { error: "Failed to save dispatch" },
      { status: 500 }
    );
  }
}
