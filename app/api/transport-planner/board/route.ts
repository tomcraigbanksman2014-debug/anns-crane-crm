import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function startOfWeek(dateStr?: string | null) {
  const base = dateStr ? new Date(dateStr) : new Date();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);

  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfWeek(dateStr?: string | null) {
  const d = startOfWeek(dateStr);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    const weekStart = startOfWeek(date);
    const weekEnd = endOfWeek(date);

    const from = isoDate(weekStart);
    const to = isoDate(weekEnd);

    const [
      { data: jobs, error: jobsError },
      { data: vehicles, error: vehiclesError },
    ] = await Promise.all([
      supabase
        .from("transport_jobs")
        .select(`
          id,
          transport_number,
          transport_date,
          collection_time,
          delivery_time,
          status,
          job_type,
          collection_address,
          delivery_address,
          load_description,
          vehicle_id,
          operator_id,
          linked_job_id,
          clients:client_id (
            company_name
          ),
          vehicles:vehicle_id (
            id,
            name,
            reg_number
          ),
          operators:operator_id (
            id,
            full_name
          ),
          jobs:linked_job_id (
            id,
            job_number,
            site_name
          )
        `)
        .gte("transport_date", from)
        .lte("transport_date", to)
        .order("transport_date", { ascending: true })
        .order("collection_time", { ascending: true }),

      supabase
        .from("vehicles")
        .select("id, name, reg_number, status")
        .eq("status", "active")
        .order("name", { ascending: true }),
    ]);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 400 });
    }

    if (vehiclesError) {
      return NextResponse.json({ error: vehiclesError.message }, { status: 400 });
    }

    const days = Array.from({ length: 7 }).map((_, index) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + index);
      return {
        date: isoDate(d),
        label: d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        }),
      };
    });

    return NextResponse.json({
      week_start: from,
      week_end: to,
      days,
      jobs: jobs ?? [],
      vehicles: vehicles ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load transport planner." },
      { status: 400 }
    );
  }
}
