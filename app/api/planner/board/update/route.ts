import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function clean(value: any) {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await req.json();

    const allocationId = clean(body.allocation_id);
    const jobId = clean(body.job_id);

    const operatorId = clean(body.operator_id);
    const craneId = clean(body.equipment_id);
    const jobDate = clean(body.job_date);
    const startTime = clean(body.start_time);
    const endTime = clean(body.end_time);

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing job id" },
        { status: 400 }
      );
    }

    // ✅ If allocation exists → update allocation (THIS IS PRIMARY NOW)
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
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    } else {
      // ✅ fallback (legacy jobs without allocation)
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
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Update failed" },
      { status: 500 }
    );
  }
}
