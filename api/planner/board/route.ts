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

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
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
      { data: jobs },
      { data: allocations },
      { data: operators },
      { data: cranes },
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
          operator_id,
          crane_id,
          clients:client_id (company_name),
          operators:operator_id (id, full_name),
          cranes:crane_id (id, name, reg_number)
        `)
        .gte("job_date", from)
        .lte("job_date", to)
        .not("status", "eq", "cancelled"),

      supabase
        .from("job_equipment")
        .select(`
          id,
          job_id,
          crane_id,
          operator_id,
          start_date,
          start_time,
          end_time,
          jobs:job_id (
            id,
            job_number,
            job_date,
            status,
            site_name,
            clients:client_id (company_name)
          ),
          operators:operator_id (id, full_name),
          cranes:crane_id (id, name, reg_number)
        `)
        .eq("asset_type", "crane")
        .gte("start_date", from)
        .lte("start_date", to),

      supabase.from("operators").select("id, full_name"),
      supabase.from("cranes").select("id, name, reg_number"),
    ]);

    const days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return {
        date: isoDate(d),
        label: d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        }),
      };
    });

    const items = [
      ...(allocations ?? []).map((row: any) => {
        const job = first(row.jobs);
        return {
          id: "alloc_" + row.id,
          job_id: row.job_id,
          job_number: job?.job_number,
          job_date: row.start_date,
          start_time: row.start_time,
          end_time: row.end_time,
          operator_id: row.operator_id,
          crane_id: row.crane_id,
          clients: job?.clients,
          operators: row.operators,
          cranes: row.cranes,
        };
      }),

      ...(jobs ?? []).map((job: any) => ({
        id: "job_" + job.id,
        job_id: job.id,
        job_number: job.job_number,
        job_date: job.job_date,
        start_time: job.start_time,
        end_time: job.end_time,
        operator_id: job.operator_id,
        crane_id: job.crane_id,
        clients: job.clients,
        operators: job.operators,
        cranes: job.cranes,
      })),
    ];

    return NextResponse.json({
      days,
      items,
      operators: operators ?? [],
      equipment: cranes ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
