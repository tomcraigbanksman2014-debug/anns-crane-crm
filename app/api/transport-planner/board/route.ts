import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getEnglandWalesBankHolidays } from "../../../lib/bankHolidays";

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function lower(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
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

function countDaysInclusive(startDate: string | null | undefined, endDate: string | null | undefined) {
  const start = String(startDate ?? "").trim();
  const end = String(endDate ?? startDate ?? "").trim();
  if (!start || !end) return 0;

  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;

  let count = 0;
  const cursor = new Date(s);
  while (cursor <= e) {
    count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function effectiveTransportPrice(job: any) {
  const mode = lower(job?.price_mode || "full_job");
  if (mode === "per_day") {
    const rate = num(job?.price_per_day);
    const days = Math.max(countDaysInclusive(job?.transport_date, job?.delivery_date ?? job?.transport_date), 1);
    return Number((rate * days).toFixed(2));
  }
  return num(job?.agreed_sell_rate) || num(job?.price) || num(job?.total_invoice);
}

export async function GET(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;
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
    const bankHolidays = getEnglandWalesBankHolidays(weekStart.getFullYear()).filter(
      (d) => d.date >= rangeStart && d.date <= rangeEnd
    );

    const { data: jobsData, error: jobsError } = await supabase
      .from("transport_jobs")
      .select(`
        id,
        transport_number,
        client_id,
        vehicle_id,
        operator_id,
        job_type,
        collection_address,
        delivery_address,
        transport_date,
        collection_time,
        delivery_date,
        delivery_time,
        load_description,
        status,
        supplier_cost,
        agreed_sell_rate,
        price,
        total_invoice,
        price_mode,
        price_per_day,
        notes,
        clients:client_id (
          id,
          company_name
        )
      `)
      .eq("archived", false)
      .lte("transport_date", rangeEnd)
      .or(`delivery_date.gte.${rangeStart},delivery_date.is.null`)
      .order("transport_date", { ascending: true });

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 400 });
    }

    const transportJobs = jobsData ?? [];
    const operatorIds = Array.from(
      new Set(
        transportJobs
          .map((row: any) => String(row.operator_id ?? "").trim())
          .filter(Boolean)
      )
    );

    const [vehiclesRes, operatorsRes] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, name, reg_number, status, archived")
        .eq("archived", false)
        .order("name", { ascending: true }),
      operatorIds.length
        ? supabase
            .from("operators")
            .select("id, full_name, status, archived")
            .in("id", operatorIds)
            .eq("archived", false)
            .order("full_name", { ascending: true })
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (vehiclesRes.error) {
      return NextResponse.json({ error: vehiclesRes.error.message }, { status: 400 });
    }
    if (operatorsRes.error) {
      return NextResponse.json({ error: operatorsRes.error.message }, { status: 400 });
    }

    const vehicles = vehiclesRes.data ?? [];
    const operators = operatorsRes.data ?? [];

    const activeJobs = transportJobs
      .filter((row: any) => lower(row.status) !== "cancelled")
      .filter((row: any) =>
        overlapsRange(row.transport_date, row.delivery_date ?? row.transport_date, rangeStart, rangeEnd)
      )
      .map((row: any) => ({
        ...row,
        effective_price: effectiveTransportPrice(row),
      }));

    const operatorById = new Map<string, any>();
    for (const operator of operators) {
      operatorById.set(String((operator as any).id ?? ""), operator);
    }

    const mapJob = (row: any) => {
      const client = row?.clients && Array.isArray(row.clients) ? row.clients[0] : row?.clients ?? null;
      const operator = operatorById.get(String(row.operator_id ?? "")) ?? null;

      return {
        job_id: row.id,
        transport_number: row.transport_number ?? null,
        client_name: client?.company_name ?? null,
        collection_address: row.collection_address ?? null,
        delivery_address: row.delivery_address ?? null,
        transport_date: row.transport_date ?? null,
        collection_time: row.collection_time ?? null,
        delivery_date: row.delivery_date ?? row.transport_date ?? null,
        delivery_time: row.delivery_time ?? null,
        operator_name: operator?.full_name ?? null,
        operator_id: row.operator_id ?? null,
        vehicle_id: row.vehicle_id ?? null,
        status: row.status ?? null,
        job_type: row.job_type ?? null,
        load_description: row.load_description ?? null,
        supplier_cost: num(row.supplier_cost),
        agreed_sell_rate: num(row.agreed_sell_rate),
        job_price: num(row.effective_price),
        price_mode: row.price_mode ?? "full_job",
        price_per_day: num(row.price_per_day),
      };
    };

    const vehicleRows = vehicles.map((vehicle: any) => ({
      id: vehicle.id,
      name: vehicle.name,
      reg_number: vehicle.reg_number,
      status: vehicle.status,
      items: activeJobs.filter((row: any) => row.vehicle_id === vehicle.id).map(mapJob),
    }));

    const unallocatedJobs = activeJobs.filter((row: any) => !row.vehicle_id).map(mapJob);

    return NextResponse.json({
      week_start: rangeStart,
      week_end: rangeEnd,
      bank_holidays: bankHolidays,
      vehicles: vehicleRows,
      unallocated_jobs: unallocatedJobs,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load transport planner board." },
      { status: 400 }
    );
  }
}
