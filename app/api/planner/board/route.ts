import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeekMonday(base: Date) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function overlapsRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  rangeStart: string,
  rangeEnd: string
) {
  const start = String(startDate ?? "").trim();
  const end = String(endDate ?? startDate ?? "").trim();
  if (!start || !end) return false;
  return start <= rangeEnd && end >= rangeStart;
}

function num(value: any) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function lower(value: any) {
  return String(value ?? "").trim().toLowerCase();
}

function countBillableDays(startDate: string, endDate: string, excludeWeekends: boolean) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }

  let count = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    const isWeekend = day === 0 || day === 6;

    if (!excludeWeekends || !isWeekend) {
      count += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function effectiveJobPrice(job: any) {
  const mode = String(job?.price_mode ?? "full_job").trim().toLowerCase();
  const startDate = String(job?.start_date ?? job?.job_date ?? "").trim();
  const endDate = String(job?.end_date ?? job?.job_date ?? "").trim();
  const excludeWeekends = Boolean(job?.exclude_weekends);

  if (mode === "per_day") {
    const rate = num(job?.price_per_day);
    const days = startDate && endDate ? countBillableDays(startDate, endDate, excludeWeekends) : 1;
    return rate * Math.max(days, 1);
  }

  return num(job?.price);
}

function bankHolidaysEnglandAndWales2026() {
  return [
    { date: "2026-01-01", label: "New Year’s Day" },
    { date: "2026-04-03", label: "Good Friday" },
    { date: "2026-04-06", label: "Easter Monday" },
    { date: "2026-05-04", label: "Early May bank holiday" },
    { date: "2026-05-25", label: "Spring bank holiday" },
    { date: "2026-08-31", label: "Summer bank holiday" },
    { date: "2026-12-25", label: "Christmas Day" },
    { date: "2026-12-28", label: "Boxing Day (substitute day)" },
  ];
}

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const url = new URL(req.url);
    const dateParam = String(url.searchParams.get("date") ?? "").trim();

    const baseDate = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }

    const weekStart = startOfWeekMonday(baseDate);
    const weekEnd = addDays(weekStart, 6);

    const rangeStart = isoDate(weekStart);
    const rangeEnd = isoDate(weekEnd);

    const [
      { data: jobs, error: jobsError },
      { data: cranes, error: cranesError },
      { data: operators, error: operatorsError },
      { data: allocations, error: allocationsError },
    ] = await Promise.all([
      supabase
        .from("jobs")
        .select(`
          id,
          job_number,
          site_name,
          site_address,
          start_date,
          end_date,
          job_date,
          start_time,
          end_time,
          status,
          client_id,
          price,
          price_mode,
          price_per_day,
          exclude_weekends,
          clients:client_id (
            id,
            company_name
          )
        `)
        .eq("archived", false)
        .order("start_date", { ascending: true }),

      supabase
        .from("cranes")
        .select("id, name, reg_number, capacity, status, archived")
        .eq("archived", false)
        .order("name", { ascending: true }),

      supabase
        .from("operators")
        .select("id, full_name, status, archived")
        .eq("archived", false)
        .order("full_name", { ascending: true }),

      supabase
        .from("job_equipment")
        .select(`
          id,
          job_id,
          crane_id,
          operator_id,
          asset_type,
          item_name,
          start_date,
          end_date,
          start_time,
          end_time,
          agreed_sell_rate,
          supplier_cost,
          notes
        `)
        .eq("asset_type", "crane")
        .order("start_date", { ascending: true }),
    ]);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 400 });
    }
    if (cranesError) {
      return NextResponse.json({ error: cranesError.message }, { status: 400 });
    }
    if (operatorsError) {
      return NextResponse.json({ error: operatorsError.message }, { status: 400 });
    }
    if (allocationsError) {
      return NextResponse.json({ error: allocationsError.message }, { status: 400 });
    }

    const activeJobs = (jobs ?? []).filter((job: any) => lower(job.status) !== "cancelled");
    const activeAllocations = (allocations ?? []).filter((row: any) =>
      overlapsRange(row.start_date, row.end_date ?? row.start_date, rangeStart, rangeEnd)
    );

    const jobsInRange = activeJobs
      .filter((job: any) =>
        overlapsRange(
          job.start_date ?? job.job_date,
          job.end_date ?? job.start_date ?? job.job_date,
          rangeStart,
          rangeEnd
        )
      )
      .map((job: any) => ({
        ...job,
        effective_price: effectiveJobPrice(job),
      }));

    const craneRows = (cranes ?? []).map((crane: any) => {
      const craneAllocations = activeAllocations.filter((row: any) => row.crane_id === crane.id);

      const items = craneAllocations.map((row: any) => {
        const job = jobsInRange.find((j: any) => j.id === row.job_id);
        const operator = (operators ?? []).find((o: any) => o.id === row.operator_id) ?? null;
        const client = job?.clients && Array.isArray(job.clients) ? job.clients[0] : job?.clients ?? null;

        return {
          allocation_id: row.id,
          job_id: row.job_id,
          job_number: job?.job_number ?? null,
          site_name: job?.site_name ?? null,
          site_address: job?.site_address ?? null,
          client_name: client?.company_name ?? null,
          start_date: row.start_date ?? job?.start_date ?? job?.job_date ?? null,
          end_date: row.end_date ?? job?.end_date ?? job?.start_date ?? job?.job_date ?? null,
          start_time: row.start_time ?? job?.start_time ?? null,
          end_time: row.end_time ?? job?.end_time ?? null,
          status: job?.status ?? null,
          operator_name: operator?.full_name ?? null,
          agreed_sell_rate: num(row.agreed_sell_rate),
          job_price: num(job?.effective_price),
          price_mode: job?.price_mode ?? "full_job",
          price_per_day: num(job?.price_per_day),
          exclude_weekends: Boolean(job?.exclude_weekends),
          notes: row.notes ?? null,
        };
      });

      return {
        id: crane.id,
        name: crane.name,
        reg_number: crane.reg_number,
        capacity: crane.capacity,
        status: crane.status,
        items,
      };
    });

    const unallocatedJobs = jobsInRange
      .filter((job: any) => {
        const hasCraneAllocation = activeAllocations.some((row: any) => row.job_id === job.id);
        return !hasCraneAllocation;
      })
      .map((job: any) => {
        const client = job?.clients && Array.isArray(job.clients) ? job.clients[0] : job?.clients ?? null;

        return {
          job_id: job.id,
          job_number: job.job_number ?? null,
          site_name: job.site_name ?? null,
          site_address: job.site_address ?? null,
          client_name: client?.company_name ?? null,
          start_date: job.start_date ?? job.job_date ?? null,
          end_date: job.end_date ?? job.start_date ?? job.job_date ?? null,
          start_time: job.start_time ?? null,
          end_time: job.end_time ?? null,
          status: job.status ?? null,
          job_price: num(job.effective_price),
          price_mode: job.price_mode ?? "full_job",
          price_per_day: num(job.price_per_day),
          exclude_weekends: Boolean(job.exclude_weekends),
        };
      });

    return NextResponse.json({
      week_start: rangeStart,
      week_end: rangeEnd,
      bank_holidays: bankHolidaysEnglandAndWales2026().filter(
        (d) => d.date >= rangeStart && d.date <= rangeEnd
      ),
      cranes: craneRows,
      unallocated_jobs: unallocatedJobs,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load planner board." },
      { status: 400 }
    );
  }
}
