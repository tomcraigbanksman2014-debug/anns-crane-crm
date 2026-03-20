import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function calcWorkedHours(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined
) {
  if (!startedAt || !completedAt) return 0;
  const start = new Date(startedAt);
  const end = new Date(completedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  return diffMs / (1000 * 60 * 60);
}

function num(value: any) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function recordState(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined
) {
  if (startedAt && completedAt) return "Complete";
  if (startedAt && !completedAt) return "Started only";
  if (!startedAt && completedAt) return "Completed only";
  return "No clock times";
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function makeCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];

  return lines.join("\n");
}

export async function GET(_request: NextRequest) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);

  const weekStartStr = weekStart.toISOString();
  const weekEndStr = weekEnd.toISOString();

  const { data, error } = await supabase
    .from("jobs")
    .select(`
      id,
      job_number,
      job_date,
      started_at,
      completed_at,
      travel_hours,
      break_hours,
      overtime_hours,
      submitted_to_office_at,
      operators:operator_id (
        full_name
      )
    `)
    .not("operator_id", "is", null)
    .gte("job_date", weekStartStr.slice(0, 10))
    .lte("job_date", weekEndStr.slice(0, 10))
    .order("job_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((job: any) => {
    const operator = first(job.operators);
    const workedHours = calcWorkedHours(job.started_at, job.completed_at);
    const travelHours = num(job.travel_hours);
    const breakHours = num(job.break_hours);
    const overtimeHours = num(job.overtime_hours);
    const payableHours = workedHours + travelHours + overtimeHours - breakHours;

    return {
      operator: operator?.full_name ?? "",
      job_number: job.job_number ?? "",
      job_date: job.job_date ?? "",
      started_at: job.started_at ?? "",
      completed_at: job.completed_at ?? "",
      record_state: recordState(job.started_at, job.completed_at),
      worked_hours: workedHours.toFixed(2),
      travel_hours: travelHours.toFixed(2),
      break_hours: breakHours.toFixed(2),
      overtime_hours: overtimeHours.toFixed(2),
      payable_hours: payableHours.toFixed(2),
      submitted_to_office_at: job.submitted_to_office_at ?? "",
    };
  });

  const csv = makeCsv(rows);
  const filename = `timesheets-${weekStartStr.slice(0, 10)}-to-${weekEndStr.slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
