import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function startOfWeek(dateStr?: string | null) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
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

function num(value: any) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseDateOnly(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function dateRangeInclusive(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end || end < start) return [];

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function activeWorkingDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  excludeWeekends: boolean
) {
  const start = String(startDate ?? "").trim();
  const end = String(endDate ?? startDate ?? "").trim();

  if (!start || !end) return [];

  const allDates = dateRangeInclusive(start, end);

  if (!excludeWeekends) {
    return allDates;
  }

  return allDates.filter((value) => {
    const d = parseDateOnly(value);
    if (!d) return false;
    return !isWeekend(d);
  });
}

function overlapsWorkingWeek(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  weekStart: string,
  weekEnd: string,
  excludeWeekends: boolean
) {
  const workingDates = activeWorkingDates(startDate, endDate, excludeWeekends);
  return workingDates.some((date) => date >= weekStart && date <= weekEnd);
}

function countBillableDays(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  excludeWeekends: boolean
) {
  return activeWorkingDates(startDate, endDate, excludeWeekends).length;
}

function effectiveJobPrice(job: any) {
  const mode = String(job?.price_mode ?? "full_job").trim().toLowerCase();
  const startDate = job?.start_date ?? job?.job_date ?? null;
  const endDate = job?.end_date ?? startDate ?? null;
  const excludeWeekends = Boolean(job?.exclude_weekends);

  if (mode === "per_day") {
    const rate = num(job?.price_per_day);
    const days = countBillableDays(startDate, endDate, excludeWeekends);
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
          price,
          price_mode,
          price_per_day,
          exclude_weekends,
          clients:client_id (company_name),
          operators:operator_id (id, full_name),
          cranes:crane_id (id, name, reg_number)
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
          agreed_sell_rate,
          supplier_cost,
          notes,
          jobs:job_id (
            id,
            job_number,
            job_date,
            start_date,
            end_date,
            status,
            site_name,
            site_address,
            price,
            price_mode,
            price_per_day,
            exclude_weekends,
            clients:client_id (company_name)
          ),
          operators:operator_id (id, full_name),
          cranes:crane_id (id, name, reg_number)
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

      const dayIso = isoDate(d);
      const holiday = bankHolidaysEnglandAndWales2026().find((h) => h.date === dayIso);

      return {
        date: dayIso,
        label: d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        }),
        is_bank_holiday: Boolean(holiday),
        bank_holiday_label: holiday?.label ?? null,
      };
    });

    const allocationItems = (allocations ?? [])
      .map((row: any) => {
        const job = first(row.jobs);
        const startDate = row.start_date ?? job?.start_date ?? job?.job_date ?? null;
        const endDate = row.end_date ?? job?.end_date ?? startDate ?? null;
        const excludeWeekends = Boolean(job?.exclude_weekends);
        const workingDates = activeWorkingDates(startDate, endDate, excludeWeekends);

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
          equipment: row.cranes ?? null,
          agreed_sell_rate: num(row?.agreed_sell_rate),
          supplier_cost: num(row?.supplier_cost),
          price_mode: job?.price_mode ?? "full_job",
          price_per_day: num(job?.price_per_day),
          job_price: effectiveJobPrice(job),
          exclude_weekends: excludeWeekends,
          working_dates: workingDates,
          billable_days: countBillableDays(startDate, endDate, excludeWeekends),
          notes: row?.notes ?? null,
        };
      })
      .filter((item) =>
        overlapsWorkingWeek(item.start_date, item.end_date, from, to, Boolean(item.exclude_weekends))
      );

    const allocationJobIds = new Set(allocationItems.map((item) => item.job_id));

    const directJobItems = (jobs ?? [])
      .map((job: any) => {
        const startDate = job.start_date ?? job.job_date ?? null;
        const endDate = job.end_date ?? startDate ?? null;
        const excludeWeekends = Boolean(job?.exclude_weekends);
        const workingDates = activeWorkingDates(startDate, endDate, excludeWeekends);

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
          equipment: job.cranes ?? null,
          agreed_sell_rate: 0,
          supplier_cost: 0,
          price_mode: job?.price_mode ?? "full_job",
          price_per_day: num(job?.price_per_day),
          job_price: effectiveJobPrice(job),
          exclude_weekends: excludeWeekends,
          working_dates: workingDates,
          billable_days: countBillableDays(startDate, endDate, excludeWeekends),
          notes: null,
        };
      })
      .filter((item) =>
        overlapsWorkingWeek(item.start_date, item.end_date, from, to, Boolean(item.exclude_weekends))
      )
      .filter((item) => !allocationJobIds.has(item.job_id));

    return NextResponse.json({
      week_start: from,
      week_end: to,
      days,
      bank_holidays: bankHolidaysEnglandAndWales2026().filter((h) => h.date >= from && h.date <= to),
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
