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

function uniqueById<T extends { id?: string | null }>(rows: T[]) {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const row of rows) {
    const id = String(row?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }

  return out;
}

function touchesWindow(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  windowStart: string,
  windowEnd: string
) {
  const start = String(startDate ?? "");
  const end = String(endDate ?? startDate ?? "");

  if (!start) return false;

  return start <= windowEnd && end >= windowStart;
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

    const baseSelect = `
      id,
      transport_number,
      transport_date,
      collection_time,
      delivery_date,
      delivery_time,
      status,
      job_type,
      collection_address,
      delivery_address,
      collection_lat,
      collection_lng,
      delivery_lat,
      delivery_lng,
      load_description,
      notes,
      vehicle_id,
      operator_id,
      linked_job_id,
      clients:client_id (
        company_name
      ),
      vehicles:vehicle_id (
        id,
        name,
        reg_number
      ),
      operators:operator_id (
        id,
        full_name
      ),
      jobs:linked_job_id (
        id,
        job_number,
        site_name
      )
    `;

    const [
      { data: jobsA, error: jobsAError },
      { data: jobsB, error: jobsBError },
      { data: jobsC, error: jobsCError },
      { data: vehicles, error: vehiclesError },
    ] = await Promise.all([
      supabase
        .from("transport_jobs")
        .select(baseSelect)
        .gte("transport_date", from)
        .lte("transport_date", to)
        .order("transport_date", { ascending: true })
        .order("collection_time", { ascending: true }),

      supabase
        .from("transport_jobs")
        .select(baseSelect)
        .gte("delivery_date", from)
        .lte("delivery_date", to)
        .order("delivery_date", { ascending: true })
        .order("delivery_time", { ascending: true }),

      supabase
        .from("transport_jobs")
        .select(baseSelect)
        .lt("transport_date", from)
        .gt("delivery_date", to)
        .order("transport_date", { ascending: true })
        .order("collection_time", { ascending: true }),

      supabase
        .from("vehicles")
        .select("id, name, reg_number, status, archived")
        .eq("archived", false)
        .order("name", { ascending: true }),
    ]);

    if (jobsAError) {
      return NextResponse.json({ error: jobsAError.message }, { status: 400 });
    }

    if (jobsBError) {
      return NextResponse.json({ error: jobsBError.message }, { status: 400 });
    }

    if (jobsCError) {
      return NextResponse.json({ error: jobsCError.message }, { status: 400 });
    }

    if (vehiclesError) {
      return NextResponse.json({ error: vehiclesError.message }, { status: 400 });
    }

    const jobs = uniqueById([
      ...((jobsA as any[]) ?? []),
      ...((jobsB as any[]) ?? []),
      ...((jobsC as any[]) ?? []),
    ])
      .filter((job: any) =>
        touchesWindow(job.transport_date, job.delivery_date ?? job.transport_date, from, to)
      )
      .sort((a: any, b: any) => {
        const av =
          (a.transport_date && a.collection_time
            ? `${a.transport_date}T${a.collection_time}`
            : a.transport_date) ?? "";
        const bv =
          (b.transport_date && b.collection_time
            ? `${b.transport_date}T${b.collection_time}`
            : b.transport_date) ?? "";
        return String(av).localeCompare(String(bv));
      });

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
      jobs,
      vehicles: vehicles ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load transport planner." },
      { status: 400 }
    );
  }
}
