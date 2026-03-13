import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function clean(value: unknown) {
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

    const allocation_id = clean(body.allocation_id);
    const job_id = clean(body.job_id);
    const operator_id = clean(body.operator_id);
    const equipment_id = clean(body.equipment_id);
    const job_date = clean(body.job_date);
    const status = clean(body.status);

    if (!job_id) {
      return NextResponse.json({ error: "Job id is required." }, { status: 400 });
    }

    if (allocation_id) {
      const allocationUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (operator_id !== null) allocationUpdate.operator_id = operator_id;
      if (equipment_id !== null) allocationUpdate.equipment_id = equipment_id;
      if (job_date !== null) {
        allocationUpdate.start_date = job_date;
        allocationUpdate.end_date = job_date;
      }

      const { error: allocationError } = await supabase
        .from("job_equipment")
        .update(allocationUpdate)
        .eq("id", allocation_id);

      if (allocationError) {
        return NextResponse.json({ error: allocationError.message }, { status: 400 });
      }

      if (status !== null) {
        const { error: statusError } = await supabase
          .from("jobs")
          .update({
            status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);

        if (statusError) {
          return NextResponse.json({ error: statusError.message }, { status: 400 });
        }
      }

      const { data: allRows, error: rowsError } = await supabase
        .from("job_equipment")
        .select("id, equipment_id, operator_id, source_type, agreed_cost, start_date")
        .eq("job_id", job_id)
        .order("created_at", { ascending: true });

      if (rowsError) {
        return NextResponse.json({ error: rowsError.message }, { status: 400 });
      }

      const rows = allRows ?? [];
      const firstRow = rows[0] ?? null;
      const earliestDate =
        rows
          .map((r: any) => r.start_date)
          .filter(Boolean)
          .sort()[0] ?? null;

      const crossHireTotal = rows
        .filter((r: any) => r.source_type === "cross_hire")
        .reduce((sum: number, r: any) => sum + Number(r.agreed_cost ?? 0), 0);

      const jobUpdate: Record<string, any> = {
        equipment_id: firstRow?.equipment_id ?? null,
        operator_id: firstRow?.operator_id ?? null,
        main_operator_id: firstRow?.operator_id ?? null,
        equipment_count: rows.length,
        cross_hire_cost_total: crossHireTotal,
        updated_at: new Date().toISOString(),
      };

      if (earliestDate) {
        jobUpdate.job_date = earliestDate;
      }

      const { error: jobUpdateError } = await supabase
        .from("jobs")
        .update(jobUpdate)
        .eq("id", job_id);

      if (jobUpdateError) {
        return NextResponse.json({ error: jobUpdateError.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    const legacyUpdate: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (operator_id !== null) legacyUpdate.operator_id = operator_id;
    if (equipment_id !== null) legacyUpdate.equipment_id = equipment_id;
    if (job_date !== null) legacyUpdate.job_date = job_date;
    if (status !== null) legacyUpdate.status = status;

    const { error: legacyError } = await supabase
      .from("jobs")
      .update(legacyUpdate)
      .eq("id", job_id);

    if (legacyError) {
      return NextResponse.json({ error: legacyError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update planner job." },
      { status: 400 }
    );
  }
}
