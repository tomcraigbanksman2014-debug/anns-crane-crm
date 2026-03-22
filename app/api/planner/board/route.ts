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

function overlapsWeek(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  weekStart: string,
  weekEnd: string
) {
  const start = startDate ?? null;
  const end = endDate ?? startDate ?? null;
  if (!start || !end) return false;
  return start <= weekEnd && end >= weekStart;
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
      { data: allocations, error: allocationsError },
      { data: operators, error: operatorsError },
      { data: cranes, error: cranesError },
    ] = await Promise.all([
      supabase
        .from("jobs")
        .select(`
          id,
          job_number,
          job_date,
          start_date,
          end_date,
          start_time,
          end_time,
          status,
          site_name,
          site_address,
          operator_id,
          crane_id,
          clients:client_id (company_name),
          operators:operator_id (id, full_name),
          equipment:crane_id (id, name, reg_number)
        `)
        .not("status", "eq", "cancelled"),

      supabase
        .from("job_equipment")
        .select(`
          id,
          job_id,
          crane_id,
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
            start_date,
            end_date,
            status,
            site_name,
            site_address,
            clients:client_id (company_name)
          ),
          operators:operator_id (id, full_name),
          equipment:crane_id (id, name, reg_number)
        `)
        .eq("asset_type", "crane"),

      supabase.from("operators").select("id, full_name"),
      supabase.from("cranes").select("id, name, reg_number"),
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

    if (cranesError) {
      return NextResponse.json({ error: cranesError.message }, { status: 400 });
    }

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

    const allocationItems = (allocations ?? [])
      .map((row: any) => {
        const job = first(row.jobs);
        const startDate = row.start_date ?? job?.start_date ?? job?.job_date ?? null;
        const endDate = row.end_date ?? job?.end_date ?? startDate ?? null;

        return {
          id: "alloc_" + row.id,
          allocation_id: row.id,
          job_id: row.job_id,
          job_number: job?.job_number ?? null,
          job_date: startDate,
          start_date: startDate,
          end_date: endDate,
          start_time: row.start_time ?? null,
          end_time: row.end_time ?? null,
          status: job?.status ?? null,
          site_name: job?.site_name ?? null,
          site_address: job?.site_address ?? null,
          operator_id: row.operator_id ?? null,
          equipment_id: row.crane_id ?? null,
          source_type: row.source_type ?? null,
          item_name: row.item_name ?? null,
          clients: job?.clients ?? null,
          operators: row.operators ?? null,
          equipment: row.equipment ?? null,
        };
      })
      .filter((item) => overlapsWeek(item.start_date, item.end_date, from, to));

    const allocationJobIds = new Set(allocationItems.map((item) => item.job_id));

    const directJobItems = (jobs ?? [])
      .map((job: any) => {
        const startDate = job.start_date ?? job.job_date ?? null;
        const endDate = job.end_date ?? startDate ?? null;

        return {
          id: "job_" + job.id,
          allocation_id: null,
          job_id: job.id,
          job_number: job.job_number ?? null,
          job_date: startDate,
          start_date: startDate,
          end_date: endDate,
          start_time: job.start_time ?? null,
          end_time: job.end_time ?? null,
          status: job.status ?? null,
          site_name: job.site_name ?? null,
          site_address: job.site_address ?? null,
          operator_id: job.operator_id ?? null,
          equipment_id: job.crane_id ?? null,
          source_type: "owned",
          item_name: null,
          clients: job.clients ?? null,
          operators: job.operators ?? null,
          equipment: job.equipment ?? null,
        };
      })
      .filter((item) => overlapsWeek(item.start_date, item.end_date, from, to))
      .filter((item) => !allocationJobIds.has(item.job_id));

    return NextResponse.json({
      week_start: from,
      week_end: to,
      days,
      items: [...allocationItems, ...directJobItems],
      operators: operators ?? [],
      equipment:
        (cranes ?? []).map((row: any) => ({
          id: row.id,
          name: row.name ?? null,
          asset_number: row.reg_number ?? null,
        })) ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
