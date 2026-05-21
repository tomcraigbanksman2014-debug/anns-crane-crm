import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getEnglandWalesBankHolidays } from "../../../lib/bankHolidays";
import { getAssetAvailabilityForRange } from "../../../lib/assetAvailability";

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
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

function hasTransportSubcontractMeta(row: any) {
  const supplierId = String(row?.supplier_id ?? "").trim();
  const supplierReference = String(row?.supplier_reference ?? "").trim();
  const supplierCost = num(row?.supplier_cost);

  return Boolean(supplierId || supplierReference || supplierCost > 0);
}

function isCrossHiredTransportPlannerJob(row: any) {
  return !String(row?.vehicle_id ?? "").trim() && hasTransportSubcontractMeta(row);
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


function datesBetweenClamped(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  rangeStart: string,
  rangeEnd: string
) {
  const startText = String(startDate ?? "").slice(0, 10);
  const endText = String(endDate ?? startDate ?? "").slice(0, 10);
  if (!startText || !endText) return [] as string[];

  const start = new Date(`${startText}T00:00:00`);
  const end = new Date(`${endText}T00:00:00`);
  const min = new Date(`${rangeStart}T00:00:00`);
  const max = new Date(`${rangeEnd}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [] as string[];

  const cursor = start < min ? new Date(min) : new Date(start);
  const stop = end > max ? max : end;
  const days: string[] = [];
  while (cursor <= stop) {
    days.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function normaliseInvoiceStatus(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "paid") return "Paid";
  if (raw === "part paid" || raw === "part_paid") return "Part Paid";
  if (raw === "invoiced") return "Invoiced";
  return "Not Invoiced";
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
        linked_job_id,
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
        invoice_status,
        supplier_id,
        supplier_reference,
        supplier_cost,
        agreed_sell_rate,
        price,
        total_invoice,
        price_mode,
        price_per_day,
        abnormal_load_enabled,
        abnormal_load_category,
        movement_reference,
        movement_order_reference,
        movement_order_status,
        submission_method,
        submission_status,
        approval_status,
        approval_reference,
        authorised_to_move,
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

    const [vehiclesRes, operatorsRes, assetAvailability] = await Promise.all([
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
      getAssetAvailabilityForRange(supabase, "vehicle", rangeStart, rangeEnd),
    ]);

    if (vehiclesRes.error) {
      return NextResponse.json({ error: vehiclesRes.error.message }, { status: 400 });
    }
    if (operatorsRes.error) {
      return NextResponse.json({ error: operatorsRes.error.message }, { status: 400 });
    }

    const vehicles = vehiclesRes.data ?? [];
    const operators = operatorsRes.data ?? [];
    const vehicleAvailabilityByAssetId = new Map<string, any[]>();
    for (const entry of assetAvailability ?? []) {
      const assetId = String((entry as any).asset_id ?? "").trim();
      if (!assetId) continue;
      const list = vehicleAvailabilityByAssetId.get(assetId) ?? [];
      list.push(entry);
      vehicleAvailabilityByAssetId.set(assetId, list);
    }

    const activeJobs = transportJobs
      .filter((row: any) => lower(row.status) !== "cancelled")
      .filter((row: any) =>
        overlapsRange(row.transport_date, row.delivery_date ?? row.transport_date, rangeStart, rangeEnd)
      )
      .map((row: any) => ({
        ...row,
        effective_price: effectiveTransportPrice(row),
      }));

    const activeJobIds = activeJobs.map((row: any) => String(row.id ?? "").trim()).filter(Boolean);
    let visitInvoices: any[] = [];

    if (activeJobIds.length > 0) {
      const { data: visitInvoiceData, error: visitInvoiceError } = await supabase
        .from("job_daily_visit_rates")
        .select("id, job_id, visit_date, weekday, charge, invoice_status, invoice_number, invoice_date, notes")
        .eq("job_type", "transport")
        .in("job_id", activeJobIds)
        .gte("visit_date", rangeStart)
        .lte("visit_date", rangeEnd);

      if (visitInvoiceError) {
        return NextResponse.json({ error: visitInvoiceError.message }, { status: 400 });
      }

      visitInvoices = visitInvoiceData ?? [];
    }

    const visitInvoicesByJobId = new Map<string, Record<string, any>>();
    visitInvoices.forEach((row: any) => {
      const jobId = String(row?.job_id ?? "").trim();
      const visitDate = String(row?.visit_date ?? "").slice(0, 10);
      if (!jobId || !visitDate) return;
      const existing = visitInvoicesByJobId.get(jobId) ?? {};
      existing[visitDate] = row;
      visitInvoicesByJobId.set(jobId, existing);
    });

    const getVisitInvoicesForJob = (job: any) => {
      const jobId = String(job?.id ?? "").trim();
      if (!jobId) return {};

      const existing = { ...(visitInvoicesByJobId.get(jobId) ?? {}) };
      const parentStatus = normaliseInvoiceStatus(job?.invoice_status);
      const mode = lower(job?.price_mode || "full_job");
      const visibleDates = datesBetweenClamped(
        job?.transport_date,
        job?.delivery_date ?? job?.transport_date,
        rangeStart,
        rangeEnd
      );

      // Full-job pricing should follow the transport job invoice status.
      // This prevents old per-visit rows making the planner say "Visit invoiced"
      // while the transport job page says "Not Invoiced".
      if (mode !== "per_day") {
        visibleDates.forEach((visitDate) => {
          existing[visitDate] = {
            ...(existing[visitDate] ?? {}),
            job_id: jobId,
            visit_date: visitDate,
            invoice_status: parentStatus,
            invoice_number: parentStatus === "Not Invoiced" ? null : existing[visitDate]?.invoice_number ?? null,
            invoice_date: parentStatus === "Not Invoiced" ? null : existing[visitDate]?.invoice_date ?? null,
          };
        });
        return existing;
      }

      // Per-day pricing can keep individual visit statuses, but if the job itself
      // has explicitly been reset to Not Invoiced we do not allow stale visit rows
      // to keep showing as invoiced on the planner.
      if (parentStatus === "Not Invoiced") {
        visibleDates.forEach((visitDate) => {
          existing[visitDate] = {
            ...(existing[visitDate] ?? {}),
            job_id: jobId,
            visit_date: visitDate,
            invoice_status: "Not Invoiced",
            invoice_number: null,
            invoice_date: null,
          };
        });
        return existing;
      }

      // If the job has been marked invoiced from the job page/outstanding invoices
      // and no visit row exists yet, show that status on the planner too.
      visibleDates.forEach((visitDate) => {
        if (!existing[visitDate]) {
          existing[visitDate] = {
            job_id: jobId,
            visit_date: visitDate,
            invoice_status: parentStatus,
            invoice_number: null,
            invoice_date: null,
          };
        }
      });

      return existing;
    };

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
        linked_job_id: row.linked_job_id ?? null,
        vehicle_id: row.vehicle_id ?? null,
        status: row.status ?? null,
        invoice_status: normaliseInvoiceStatus(row.invoice_status),
        job_type: row.job_type ?? null,
        load_description: row.load_description ?? null,
        supplier_id: row.supplier_id ?? null,
        supplier_reference: row.supplier_reference ?? null,
        supplier_cost: num(row.supplier_cost),
        agreed_sell_rate: num(row.agreed_sell_rate),
        job_price: num(row.effective_price),
        price_mode: row.price_mode ?? "full_job",
        price_per_day: num(row.price_per_day),
        abnormal_load_enabled: Boolean(row.abnormal_load_enabled),
        abnormal_load_category: row.abnormal_load_category ?? null,
        movement_reference: row.movement_reference ?? null,
        movement_order_reference: row.movement_order_reference ?? null,
        movement_order_status: row.movement_order_status ?? null,
        submission_method: row.submission_method ?? null,
        submission_status: row.submission_status ?? null,
        approval_status: row.approval_status ?? null,
        approval_reference: row.approval_reference ?? null,
        authorised_to_move: Boolean(row.authorised_to_move),
        visit_invoices: getVisitInvoicesForJob(row),
      };
    };

    const crossHiredJobs = activeJobs.filter((row: any) => isCrossHiredTransportPlannerJob(row));
    const ownedTransportJobs = activeJobs.filter((row: any) => !isCrossHiredTransportPlannerJob(row));

    const vehicleRows = vehicles.map((vehicle: any) => ({
      id: vehicle.id,
      name: vehicle.name,
      reg_number: vehicle.reg_number,
      status: vehicle.status,
      availability: vehicleAvailabilityByAssetId.get(String(vehicle.id)) ?? [],
      items: ownedTransportJobs.filter((row: any) => row.vehicle_id === vehicle.id).map(mapJob),
    }));

    const unallocatedJobs = ownedTransportJobs.filter((row: any) => !row.vehicle_id).map(mapJob);
    const crossHiredPlannerJobs = crossHiredJobs.map((row: any) => ({
      ...mapJob(row),
      planner_group: "cross_hired",
    }));

    return NextResponse.json({
      week_start: rangeStart,
      week_end: rangeEnd,
      bank_holidays: bankHolidays,
      vehicles: vehicleRows,
      unallocated_jobs: unallocatedJobs,
      cross_hired_jobs: crossHiredPlannerJobs,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load transport planner board." },
      { status: 400 }
    );
  }
}
