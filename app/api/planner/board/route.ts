import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function startOfDay(dateStr?: string | null) {
  const base = dateStr ? new Date(dateStr) : new Date();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(dateStr?: string | null) {
  const d = startOfDay(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    const from = startOfDay(date).toISOString().slice(0, 10);
    const to = endOfDay(date).toISOString().slice(0, 10);

    const [{ data: jobs, error: jobsError }, { data: operators, error: operatorsError }, { data: equipment, error: equipmentError }] =
      await Promise.all([
        supabase
          .from("jobs")
          .select(`
            id,
            job_number,
            job_date,
            start_time,
            end_time,
            status,
            site_name,
            site_address,
            operator_id,
            equipment_id,
            clients:client_id (
              company_name
            ),
            operators:operator_id (
              id,
              full_name,
              status
            ),
            equipment:equipment_id (
              id,
              name,
              asset_number,
              status
            )
          `)
          .gte("job_date", from)
          .lte("job_date", to)
          .order("start_time", { ascending: true }),

        supabase
          .from("operators")
          .select("id, full_name, status")
          .eq("status", "active")
          .order("full_name", { ascending: true }),

        supabase
          .from("equipment")
          .select("id, name, asset_number, status")
          .order("name", { ascending: true }),
      ]);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 400 });
    }

    if (operatorsError) {
      return NextResponse.json({ error: operatorsError.message }, { status: 400 });
    }

    if (equipmentError) {
      return NextResponse.json({ error: equipmentError.message }, { status: 400 });
    }

    const list = jobs ?? [];
    const unassigned = list.filter(
      (job: any) => !job.operator_id || !job.equipment_id
    );
    const assigned = list.filter(
      (job: any) => !!job.operator_id && !!job.equipment_id
    );

    return NextResponse.json({
      date: from,
      unassigned,
      assigned,
      operators: operators ?? [],
      equipment: equipment ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load planner board." },
      { status: 400 }
    );
  }
}
