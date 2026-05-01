import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { getEnglandWalesBankHolidays } from "../../../lib/bankHolidays";
import { countWorkingDaysInclusive } from "../../../lib/workingDays";

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

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function dateOnlyFromTimestamp(value: string | null | undefined) {
  const text = clean(value);
  if (!text) return null;
  return text.slice(0, 10);
}

function timeOnlyFromTimestamp(value: string | null | undefined) {
  const text = clean(value);
  if (!text || !text.includes("T")) return null;
  return text.slice(11, 16);
}

function normaliseJobStart(job: any) {
  return clean(job?.start_date) ?? clean(job?.job_date);
}

function normaliseJobEnd(job: any) {
  return clean(job?.end_date) ?? clean(job?.start_date) ?? clean(job?.job_date);
}

function isVisibleStatus(status: string | null | undefined) {
  const raw = String(status ?? "").trim().toLowerCase();
  return raw !== "cancelled" && raw !== "late_cancelled" && raw !== "draft";
}

function overlapsWeek(startDate: string | null | undefined, endDate: string | null | undefined, weekStart: string, weekEnd: string) {
  const start = clean(startDate);
  const end = clean(endDate) ?? start;
  if (!start || !end) return false;
  return start <= weekEnd && end >= weekStart;
}

function statusSortValue(status: string | null | undefined) {
  const raw = String(status ?? "").trim().toLowerCase();
  if (raw === "holiday") return 1;
  if (raw === "training") return 2;
  if (raw === "sick") return 3;
  if (raw === "day_off") return 4;
  if (raw === "unavailable") return 5;
  if (raw === "other") return 6;
  if (raw === "available") return 7;
  return 8;
}

function normaliseAvailabilityEntry(entry: any) {
  const startDate = clean(entry?.start_date);
  const endDate = clean(entry?.end_date) ?? startDate;
  const status = clean(entry?.status);
  return {
    ...entry,
    start_date: startDate,
    end_date: endDate,
    working_day_count: status === "holiday" ? countWorkingDaysInclusive(startDate, endDate) : null,
  };
}

function normaliseCraneJob(job: any) {
  return {
    id: job.id,
    job_number: job.job_number,
    site_name: job.site_name,
    start_date: normaliseJobStart(job),
    end_date: normaliseJobEnd(job),
    job_date: clean(job.job_date),
    status: job.status,
    allocation_source: "jobs",
  };
}

function normaliseTransportJob(job: any) {
  return {
    id: job.id,
    transport_number: job.transport_number,
    collection_address: job.collection_address,
    delivery_address: job.delivery_address,
    transport_date: clean(job.transport_date),
    delivery_date: clean(job.delivery_date) ?? clean(job.transport_date),
    status: job.status,
    allocation_source: "transport_jobs",
  };
}

export async function GET(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    const weekStartDate = startOfWeek(date);
    const weekEndDate = endOfWeek(date);
    const weekStart = isoDate(weekStartDate);
    const weekEnd = isoDate(weekEndDate);

    const bankHolidaySeed =
      weekEndDate.getFullYear() === weekStartDate.getFullYear()
        ? getEnglandWalesBankHolidays(weekStartDate.getFullYear())
        : [
            ...getEnglandWalesBankHolidays(weekStartDate.getFullYear()),
            ...getEnglandWalesBankHolidays(weekEndDate.getFullYear()),
          ];

    const [
      operatorsRes,
      entriesRes,
      directJobsRes,
      jobAllocationsRes,
      transportJobsRes,
    ] = await Promise.all([
      supabase
        .from("operators")
        .select("id, full_name, email, phone, status, archived")
        .eq("archived", false)
        .order("full_name", { ascending: true }),

      supabase
        .from("operator_availability")
        .select("id, operator_id, start_date, end_date, start_time, end_time, status, notes, blocks_assignment, working_day_count, created_at, updated_at")
        .lte("start_date", weekEnd)
        .or(`end_date.gte.${weekStart},end_date.is.null`)
        .order("start_date", { ascending: true }),

      supabase
        .from("jobs")
        .select("id, operator_id, job_number, site_name, start_date, end_date, job_date, status, archived")
        .eq("archived", false)
        .not("operator_id", "is", null)
        .lte("start_date", weekEnd)
        .or(`end_date.gte.${weekStart},end_date.is.null`),

      supabase
        .from("job_allocations")
        .select(`
          id,
          job_id,
          operator_id,
          asset_type,
          crane_id,
          vehicle_id,
          equipment_id,
          start_at,
          end_at,
          supplier_reference,
          notes,
          jobs:job_id (
            id,
            job_number,
            site_name,
            start_date,
            end_date,
            job_date,
            status,
            archived
          )
        `)
        .not("operator_id", "is", null),

      supabase
        .from("transport_jobs")
        .select("id, operator_id, transport_number, collection_address, delivery_address, transport_date, delivery_date, status, archived")
        .eq("archived", false)
        .not("operator_id", "is", null)
        .lte("transport_date", weekEnd)
        .or(`delivery_date.gte.${weekStart},delivery_date.is.null`),
    ]);

    if (operatorsRes.error) return NextResponse.json({ error: operatorsRes.error.message }, { status: 400 });
    if (entriesRes.error) return NextResponse.json({ error: entriesRes.error.message }, { status: 400 });
    if (directJobsRes.error) return NextResponse.json({ error: directJobsRes.error.message }, { status: 400 });
    if (jobAllocationsRes.error) return NextResponse.json({ error: jobAllocationsRes.error.message }, { status: 400 });
    if (transportJobsRes.error) return NextResponse.json({ error: transportJobsRes.error.message }, { status: 400 });

    const bankHolidays = (bankHolidaySeed ?? []).filter((item) => item.date >= weekStart && item.date <= weekEnd);
    const days = Array.from({ length: 7 }).map((_, index) => {
      const dayDate = new Date(weekStartDate);
      dayDate.setDate(weekStartDate.getDate() + index);
      const dayIso = isoDate(dayDate);
      const holiday = bankHolidays.find((item) => item.date === dayIso) ?? null;
      return {
        date: dayIso,
        label: dayDate.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        }),
        is_bank_holiday: Boolean(holiday),
        bank_holiday_label: holiday?.label ?? null,
      };
    });

    const entriesByOperator = new Map<string, any[]>();
    for (const entry of entriesRes.data ?? []) {
      const operatorId = String((entry as any)?.operator_id ?? "");
      if (!operatorId) continue;
      const entryStart = clean((entry as any)?.start_date);
      const entryEnd = clean((entry as any)?.end_date) ?? entryStart;
      if (!overlapsWeek(entryStart, entryEnd, weekStart, weekEnd)) continue;
      const list = entriesByOperator.get(operatorId) ?? [];
      list.push(normaliseAvailabilityEntry(entry));
      entriesByOperator.set(operatorId, list);
    }

    const craneJobsByOperator = new Map<string, any[]>();
    const craneDedup = new Set<string>();

    for (const job of directJobsRes.data ?? []) {
      if (!isVisibleStatus((job as any)?.status)) continue;
      const operatorId = String((job as any)?.operator_id ?? "");
      if (!operatorId) continue;
      const start = normaliseJobStart(job);
      const end = normaliseJobEnd(job);
      if (!overlapsWeek(start, end, weekStart, weekEnd)) continue;

      const key = `${operatorId}:${(job as any).id}`;
      craneDedup.add(key);
      const list = craneJobsByOperator.get(operatorId) ?? [];
      list.push(normaliseCraneJob(job));
      craneJobsByOperator.set(operatorId, list);
    }

    for (const allocation of jobAllocationsRes.data ?? []) {
      const operatorId = String((allocation as any)?.operator_id ?? "");
      const relatedJob = first((allocation as any)?.jobs);
      if (!operatorId || !relatedJob) continue;
      if (Boolean((relatedJob as any)?.archived)) continue;
      if (!isVisibleStatus((relatedJob as any)?.status)) continue;

      const start = dateOnlyFromTimestamp((allocation as any)?.start_at) ?? normaliseJobStart(relatedJob);
      const end = dateOnlyFromTimestamp((allocation as any)?.end_at) ?? normaliseJobEnd(relatedJob);
      if (!overlapsWeek(start, end, weekStart, weekEnd)) continue;

      const key = `${operatorId}:${(relatedJob as any).id}`;
      if (craneDedup.has(key)) continue;
      craneDedup.add(key);

      const list = craneJobsByOperator.get(operatorId) ?? [];
      list.push({
        ...normaliseCraneJob(relatedJob),
        start_date: start,
        end_date: end,
        start_time: timeOnlyFromTimestamp((allocation as any)?.start_at),
        end_time: timeOnlyFromTimestamp((allocation as any)?.end_at),
        allocation_source: "job_allocations",
        allocation_id: (allocation as any)?.id ?? null,
        asset_type: (allocation as any)?.asset_type ?? null,
        supplier_reference: (allocation as any)?.supplier_reference ?? null,
        notes: (allocation as any)?.notes ?? null,
      });
      craneJobsByOperator.set(operatorId, list);
    }

    const transportByOperator = new Map<string, any[]>();
    for (const job of transportJobsRes.data ?? []) {
      if (!isVisibleStatus((job as any)?.status)) continue;
      const operatorId = String((job as any)?.operator_id ?? "");
      if (!operatorId) continue;
      const start = clean((job as any)?.transport_date);
      const end = clean((job as any)?.delivery_date) ?? start;
      if (!overlapsWeek(start, end, weekStart, weekEnd)) continue;

      const list = transportByOperator.get(operatorId) ?? [];
      list.push(normaliseTransportJob(job));
      transportByOperator.set(operatorId, list);
    }

    const operators = (operatorsRes.data ?? []).map((row: any) => {
      const operatorId = String(row.id);
      const entries = (entriesByOperator.get(operatorId) ?? []).sort((a: any, b: any) => {
        if (a.start_date !== b.start_date) return String(a.start_date).localeCompare(String(b.start_date));
        return statusSortValue(a.status) - statusSortValue(b.status);
      });

      const assignedJobs = (craneJobsByOperator.get(operatorId) ?? []).sort((a: any, b: any) =>
        String(a.start_date ?? "").localeCompare(String(b.start_date ?? ""))
      );

      const assignedTransportJobs = (transportByOperator.get(operatorId) ?? []).sort((a: any, b: any) =>
        String(a.transport_date ?? "").localeCompare(String(b.transport_date ?? ""))
      );

      return {
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        entries,
        assigned_jobs: assignedJobs,
        assigned_transport_jobs: assignedTransportJobs,
        holiday_working_days:
          entries
            .filter((entry: any) => String(entry.status ?? "").toLowerCase() === "holiday")
            .reduce((sum: number, entry: any) => sum + Number(entry.working_day_count ?? 0), 0) || 0,
      };
    });

    return NextResponse.json({
      week_start: weekStart,
      week_end: weekEnd,
      days,
      bank_holidays: bankHolidays,
      operators,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not load staff planner." }, { status: 400 });
  }
}
