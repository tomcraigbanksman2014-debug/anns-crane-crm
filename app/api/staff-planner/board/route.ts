import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { getEnglandWalesBankHolidays } from "../../../lib/bankHolidays";

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

    const [operatorsRes, entriesRes, jobsRes, transportJobsRes] = await Promise.all([
      supabase
        .from("operators")
        .select("id, full_name, email, phone, status, archived")
        .eq("archived", false)
        .order("full_name", { ascending: true }),
      supabase
        .from("operator_availability")
        .select("id, operator_id, start_date, end_date, start_time, end_time, status, notes, blocks_assignment, created_at, updated_at")
        .lte("start_date", weekEnd)
        .gte("end_date", weekStart)
        .order("start_date", { ascending: true }),
      supabase
        .from("jobs")
        .select("id, operator_id, job_number, site_name, start_date, end_date, job_date, status, archived")
        .eq("archived", false)
        .not("operator_id", "is", null)
        .lte("start_date", weekEnd)
        .gte("end_date", weekStart),
      supabase
        .from("transport_jobs")
        .select("id, operator_id, transport_number, collection_address, delivery_address, transport_date, delivery_date, status, archived")
        .eq("archived", false)
        .not("operator_id", "is", null)
        .lte("transport_date", weekEnd)
        .gte("delivery_date", weekStart),
    ]);

    if (operatorsRes.error) return NextResponse.json({ error: operatorsRes.error.message }, { status: 400 });
    if (entriesRes.error) return NextResponse.json({ error: entriesRes.error.message }, { status: 400 });
    if (jobsRes.error) return NextResponse.json({ error: jobsRes.error.message }, { status: 400 });
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

    const operators = (operatorsRes.data ?? []).map((row: any) => ({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      entries: (entriesRes.data ?? [])
        .filter((entry: any) => String(entry.operator_id) === String(row.id))
        .sort((a: any, b: any) => {
          if (a.start_date !== b.start_date) return String(a.start_date).localeCompare(String(b.start_date));
          return statusSortValue(a.status) - statusSortValue(b.status);
        }),
      assigned_jobs: (jobsRes.data ?? []).filter((job: any) => String(job.operator_id) === String(row.id)),
      assigned_transport_jobs: (transportJobsRes.data ?? []).filter((job: any) => String(job.operator_id) === String(row.id)),
    }));

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
