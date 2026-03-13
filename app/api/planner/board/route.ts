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

type PlannerItem = {
  id: string;
  allocation_id: string | null;
  job_id: string;
  job_number: string | null;
  job_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  site_name: string | null;
  site_address: string | null;
  operator_id: string | null;
  equipment_id: string | null;
  source_type: string | null;
  item_name: string | null;
  clients: any;
  operators: any;
  equipment: any;
};

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
      { data: allocations, error: allocationsError },
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
        .from("job_equipment")
        .select(`
          id,
          job_id,
          equipment_id,
          operator_id,
          source_type,
          item_name,
          start_date,
          end_date,
          start_time,
          end_time,
          jobs:job_id (
            id,
            job_number,
            job_date,
            start_time,
            end_time,
            status,
            site_name,
            site_address,
            clients:client_id (
              company_name
            )
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
        .gte("start_date", from)
        .lte("start_date", to)
        .order("start_date", { ascending: true })
        .order("start_time", { ascending: true })
        .order("created_at", { ascending: true }),

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

    if (allocationsError) {
      return NextResponse.json({ error: allocationsError.message }, { status: 400 });
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

    const allocationRows = allocations ?? [];
    const jobsRows = jobs ?? [];

    const jobsWithAllocations = new Set<string>(
      allocationRows.map((row: any) => String(row.job_id))
    );

    const allocationItems: PlannerItem[] = allocationRows.map((row: any) => {
      const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
      return {
        id: `alloc_${row.id}`,
        allocation_id: row.id,
        job_id: row.job_id,
        job_number: job?.job_number ?? null,
        job_date: row.start_date ?? job?.job_date ?? null,
        start_time: row.start_time ?? job?.start_time ?? null,
        end_time: row.end_time ?? job?.end_time ?? null,
        status: job?.status ?? null,
        site_name: job?.site_name ?? null,
        site_address: job?.site_address ?? null,
        operator_id: row.operator_id ?? null,
        equipment_id: row.equipment_id ?? null,
        source_type: row.source_type ?? null,
        item_name: row.item_name ?? null,
        clients: job?.clients ?? null,
        operators: row.operators ?? null,
        equipment: row.equipment ?? null,
      };
    });

    const legacyItems: PlannerItem[] = jobsRows
      .filter((job: any) => !jobsWithAllocations.has(String(job.id)))
      .map((job: any) => ({
        id: `job_${job.id}`,
        allocation_id: null,
        job_id: job.id,
        job_number: job.job_number ?? null,
        job_date: job.job_date ?? null,
        start_time: job.start_time ?? null,
        end_time: job.end_time ?? null,
        status: job.status ?? null,
        site_name: job.site_name ?? null,
        site_address: job.site_address ?? null,
        operator_id: job.operator_id ?? null,
        equipment_id: job.equipment_id ?? null,
        source_type: "owned",
        item_name: null,
        clients: job.clients ?? null,
        operators: job.operators ?? null,
        equipment: job.equipment ?? null,
      }));

    return NextResponse.json({
      week_start: from,
      week_end: to,
      days,
      items: [...allocationItems, ...legacyItems],
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
