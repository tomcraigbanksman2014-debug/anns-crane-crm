import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { timesheetsEnabled } from "../../../lib/features";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

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

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function shiftState(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined
) {
  if (startedAt && endedAt) return "Complete";
  if (startedAt && !endedAt) return "Open shift";
  if (!startedAt && endedAt) return "Invalid";
  return "No clock times";
}

function overlapsWeek(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  weekStart: Date,
  weekEnd: Date
) {
  if (!startedAt) return false;

  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  return start <= weekEnd && end >= weekStart;
}

function calcShiftHoursWithinWindow(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  windowStart: Date,
  windowEnd: Date
) {
  if (!startedAt) return 0;

  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const clippedStart = start > windowStart ? start : windowStart;
  const clippedEnd = end < windowEnd ? end : windowEnd;

  const diffMs = clippedEnd.getTime() - clippedStart.getTime();
  if (diffMs <= 0) return 0;

  return diffMs / (1000 * 60 * 60);
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

export async function GET() {
  if (!timesheetsEnabled()) {
    return NextResponse.json({ error: "Timesheets are not enabled." }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);

  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();

  const { data, error } = await admin
    .from("operator_shift_sessions")
    .select(`
      id,
      operator_id,
      started_at,
      ended_at,
      start_site_text,
      end_site_text,
      end_issue_type,
      end_issue_notes,
      operators:operator_id (
        full_name
      )
    `)
    .lte("started_at", weekEndIso)
    .order("started_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = ((data ?? []) as any[])
    .filter((row) => overlapsWeek(row.started_at, row.ended_at, weekStart, weekEnd))
    .map((row: any) => {
      const operator = first(row.operators);
      const workedHours = calcShiftHoursWithinWindow(
        row.started_at,
        row.ended_at,
        weekStart,
        weekEnd
      );

      return {
        operator: operator?.full_name ?? "",
        shift_id: row.id ?? "",
        shift_date: row.started_at
          ? new Date(row.started_at).toLocaleDateString("en-GB")
          : "",
        started_at: row.started_at ?? "",
        ended_at: row.ended_at ?? "",
        record_state: shiftState(row.started_at, row.ended_at),
        worked_hours: workedHours.toFixed(2),
        start_site: row.start_site_text ?? "",
        end_site: row.end_site_text ?? "",
        end_issue_type: row.end_issue_type ?? "",
        end_issue_notes: row.end_issue_notes ?? "",
      };
    });

  const csv = makeCsv(rows);
  const filename = `timesheets-${weekStartIso.slice(0, 10)}-to-${weekEndIso.slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
