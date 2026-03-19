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
    const startTime = clean(body.start_time);
    const endTime = clean(body.end_time);

    if (!jobId) {
      return NextResponse.json({ error: "Job id is required." }, { status: 400 });
    }

    if (allocationId) {
      const { error } = await supabase
        .from("job_equipment")
        .update({
          operator_id: operatorId,
          crane_id: craneId,
          start_date: jobDate,
          end_date: jobDate,
          start_time: startTime,
          end_time: endTime,
          updated_at: new Date().toISOString(),
        })
        .eq("id", allocationId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      const { error } = await supabase
        .from("jobs")
        .update({
          operator_id: operatorId,
          crane_id: craneId,
          job_date: jobDate,
          start_time: startTime,
          end_time: endTime,
          updated_at: new Date().toISOString(),
        })
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
