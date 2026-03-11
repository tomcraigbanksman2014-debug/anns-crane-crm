import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

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
      { data: operators, error: operatorsError },
      { data: equipment, error: equipmentError },
    ] = await Promise.all([
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
        .order("job_date", { ascending: true })
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
      operators: operators ?? [],
      equipment: equipment ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load weekly planner." },
      { status: 400 }
    );
  }
}
