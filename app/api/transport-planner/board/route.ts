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

function countDaysInclusive(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }

  let count = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function effectiveTransportPrice(row: any) {
  const mode = String(row?.price_mode ?? "full_job").trim().toLowerCase();

  if (mode === "per_day") {
    const rate = num(row?.price_per_day);
    const startDate = String(row?.transport_date ?? "").trim();
    const endDate = String(row?.delivery_date ?? row?.transport_date ?? "").trim();
    const days = startDate && endDate ? countDaysInclusive(startDate, endDate) : 1;
    return rate * Math.max(days, 1);
  }

  return num(row?.agreed_sell_rate ?? row?.price);
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
      { data: transportJobs, error: jobsError },
      { data: vehicles, error: vehiclesError },
      { data: operators, error: operatorsError },
    ] = await Promise.all([
      supabase
        .from("transport_jobs")
        .select(`
          id,
          transport_number,
          linked_job_id,
          linked_transport_job_id,
          client_id,
          vehicle_id,
          operator_id,
          supplier_id,
          supplier_reference,
          supplier_cost,
          job_type,
          collection_address,
          delivery_address,
          transport_date,
          collection_time,
          delivery_date,
          delivery_time,
          load_description,
          status,
          price,
          agreed_sell_rate,
          price_mode,
          price_per_day,
          archived,
          clients:client_id (
            id,
            company_name
          )
        `)
        .eq("archived", false)
        .order("transport_date", { ascending: true }),

      supabase
        .from("vehicles")
        .select("id, name, reg_number, status, archived")
        .eq("archived", false)
        .order("name", { ascending: true }),

      supabase
        .from("operators")
        .select("id, full_name, status, archived")
        .eq("archived", false)
        .order("full_name", { ascending: true }),
    ]);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 400 });
    }
    if (vehiclesError) {
      return NextResponse.json({ error: vehiclesError.message }, { status: 400 });
    }
    if (operatorsError) {
      return NextResponse.json({ error: operatorsError.message }, { status: 400 });
    }

    const activeJobs = (transportJobs ?? [])
      .filter((row: any) => lower(row.status) !== "cancelled")
      .filter((row: any) =>
        overlapsRange(row.transport_date, row.delivery_date ?? row.transport_date, rangeStart, rangeEnd)
      )
      .map((row: any) => ({
        ...row,
        effective_price: effectiveTransportPrice(row),
      }));

    const vehicleRows = (vehicles ?? []).map((vehicle: any) => {
      const items = activeJobs
        .filter((row: any) => row.vehicle_id === vehicle.id)
        .map((row: any) => {
          const client = row?.clients && Array.isArray(row.clients) ? row.clients[0] : row?.clients ?? null;
          const operator = (operators ?? []).find((o: any) => o.id === row.operator_id) ?? null;

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
            status: row.status ?? null,
            job_type: row.job_type ?? null,
            load_description: row.load_description ?? null,
            supplier_cost: num(row.supplier_cost),
            agreed_sell_rate: num(row.agreed_sell_rate),
            job_price: num(row.effective_price),
            price_mode: row.price_mode ?? "full_job",
            price_per_day: num(row.price_per_day),
          };
        });

      return {
        id: vehicle.id,
        name: vehicle.name,
        reg_number: vehicle.reg_number,
        status: vehicle.status,
        items,
      };
    });

    const unallocatedJobs = activeJobs
      .filter((row: any) => !row.vehicle_id)
      .map((row: any) => {
        const client = row?.clients && Array.isArray(row.clients) ? row.clients[0] : row?.clients ?? null;
        const operator = (operators ?? []).find((o: any) => o.id === row.operator_id) ?? null;

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
          status: row.status ?? null,
          job_type: row.job_type ?? null,
          load_description: row.load_description ?? null,
          supplier_cost: num(row.supplier_cost),
          agreed_sell_rate: num(row.agreed_sell_rate),
          job_price: num(row.effective_price),
          price_mode: row.price_mode ?? "full_job",
          price_per_day: num(row.price_per_day),
        };
      });

    return NextResponse.json({
      week_start: rangeStart,
      week_end: rangeEnd,
      bank_holidays: bankHolidaysEnglandAndWales2026().filter(
        (d) => d.date >= rangeStart && d.date <= rangeEnd
      ),
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
