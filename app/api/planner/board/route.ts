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

function dateOnlyFromTimestamp(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const fallback = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? fallback : null;
}

function timeOnlyFromTimestamp(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = raw.match(/T(\d{2}:\d{2})/);
  if (match?.[1]) return match[1];

  const timeMatch = raw.match(/^(\d{2}:\d{2})/);
  if (timeMatch?.[1]) return timeMatch[1];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
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
  if (!excludeWeekends) return allDates;

  return allDates.filter((value) => {
    const d = parseDateOnly(value);
    return d ? !isWeekend(d) : false;
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

  return num(job?.invoice_subtotal) || num(job?.invoice_amount) || num(job?.total_invoice);
}

function isPlannerVisibleStatus(status: string | null | undefined) {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return true;
  if (s === "cancelled") return false;
  if (s === "late_cancelled") return false;
  if (s === "draft") return false;
  return true;
}

function classifyUnassignedType(job: any) {
  const siteName = String(job?.site_name ?? "").trim().toLowerCase();
  const notes = String(job?.notes ?? "").trim().toLowerCase();
  const hireType = String(job?.hire_type ?? "").trim().toLowerCase();
  const liftType = String(job?.lift_type ?? "").trim().toLowerCase();

  const combined = `${siteName} ${notes} ${hireType} ${liftType}`;

  if (
    combined.includes("labour only") ||
    combined.includes("labour-only") ||
    combined.includes("slinger") ||
    combined.includes("lift supervisor") ||
    combined.includes("supervisor only") ||
    combined.includes("operator only")
  ) {
    return "labour_only";
  }

  return "unassigned_crane";
}

function looksLikeCraneAllocation(row: any) {
  const assetType = String(row?.asset_type ?? "").trim().toLowerCase();
  const craneId = String(row?.crane_id ?? "").trim();
  const craneRow = first(row?.cranes);

  return Boolean(craneId || craneRow?.id || assetType === "crane");
}

function looksLikeLabourAllocation(row: any) {
  if (looksLikeCraneAllocation(row)) return false;

  const assetType = String(row?.asset_type ?? "").trim().toLowerCase();
  const itemName = String(row?.item_name ?? "").trim().toLowerCase();
  const notes = String(row?.notes ?? "").trim().toLowerCase();

  if (assetType === "other") return true;

  return (
    itemName.includes("labour") ||
    itemName.includes("slinger") ||
    itemName.includes("lift supervisor") ||
    notes.includes("labour only") ||
    notes.includes("labour-only")
  );
}

function normaliseJobEquipmentRow(row: any) {
  return {
    ...row,
    allocation_source: "job_equipment",
    start_date: row?.start_date ?? null,
    end_date: row?.end_date ?? row?.start_date ?? null,
    start_time: row?.start_time ?? null,
    end_time: row?.end_time ?? null,
    agreed_sell_rate: row?.agreed_sell_rate ?? 0,
    supplier_cost: row?.supplier_cost ?? row?.agreed_cost ?? 0,
    item_name: row?.item_name ?? null,
  };
}

function normaliseJobAllocationsRow(row: any) {
  return {
    ...row,
    allocation_source: "job_allocations",
    start_date: dateOnlyFromTimestamp(row?.start_at),
    end_date: dateOnlyFromTimestamp(row?.end_at) ?? dateOnlyFromTimestamp(row?.start_at),
    start_time: timeOnlyFromTimestamp(row?.start_at),
    end_time: timeOnlyFromTimestamp(row?.end_at),
    agreed_sell_rate: 0,
    supplier_cost: row?.agreed_cost ?? 0,
    item_name: null,
  };
}

export async function GET(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    const weekStart = startOfWeek(date);
    const weekEnd = endOfWeek(date);

    const from = isoDate(weekStart);
    const to = isoDate(weekEnd);
    const bankHolidays = getEnglandWalesBankHolidays(weekStart.getFullYear()).filter(
      (h) => h.date >= from && h.date <= to
    );

    const [jobsRes, equipmentAllocationsRes, jobAllocationsRes, operatorsRes, cranesRes] = await Promise.all([
      supabase
        .from("jobs")
        .select(`
          id,
          client_id,
          equipment_id,
          operator_id,
          crane_id,
          job_number,
          job_date,
          start_date,
          end_date,
          start_time,
          end_time,
          status,
          site_name,
          site_address,
          hire_type,
          lift_type,
          notes,
          invoice_subtotal,
          invoice_amount,
          total_invoice,
          price_mode,
          price_per_day,
          exclude_weekends,
          archived,
          clients:client_id (company_name),
          operators:operator_id (id, full_name),
          cranes:crane_id (id, name, reg_number)
        `)
        .eq("archived", false)
        .or(
          `and(start_date.lte.${to},end_date.gte.${from}),and(start_date.lte.${to},end_date.is.null),and(start_date.is.null,job_date.gte.${from},job_date.lte.${to})`
        ),

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
          agreed_cost,
          notes,
          jobs:job_id (
            id,
            client_id,
            operator_id,
            crane_id,
            job_number,
            job_date,
            start_date,
            end_date,
            start_time,
            end_time,
            status,
            site_name,
            site_address,
            hire_type,
            lift_type,
            notes,
            invoice_subtotal,
            invoice_amount,
            total_invoice,
            price_mode,
            price_per_day,
            exclude_weekends,
            archived,
            clients:client_id (company_name)
          ),
          operators:operator_id (id, full_name),
          cranes:crane_id (id, name, reg_number)
        `),

      supabase
        .from("job_allocations")
        .select(`
          id,
          job_id,
          asset_type,
          crane_id,
          vehicle_id,
          equipment_id,
          operator_id,
          start_at,
          end_at,
          agreed_cost,
          supplier_reference,
          notes,
          jobs:job_id (
            id,
            client_id,
            operator_id,
            crane_id,
            job_number,
            job_date,
            start_date,
            end_date,
            start_time,
            end_time,
            status,
            site_name,
            site_address,
            hire_type,
            lift_type,
            notes,
            invoice_subtotal,
            invoice_amount,
            total_invoice,
            price_mode,
            price_per_day,
            exclude_weekends,
            archived,
            clients:client_id (company_name)
          ),
          operators:operator_id (id, full_name),
          cranes:crane_id (id, name, reg_number)
        `),

      supabase
        .from("operators")
        .select("id, full_name")
        .eq("archived", false)
        .order("full_name", { ascending: true }),

      supabase
        .from("cranes")
        .select("id, name, reg_number")
        .eq("archived", false)
        .order("name", { ascending: true }),
    ]);

    if (jobsRes.error) {
      return NextResponse.json({ error: jobsRes.error.message }, { status: 400 });
    }
    if (equipmentAllocationsRes.error) {
      return NextResponse.json({ error: equipmentAllocationsRes.error.message }, { status: 400 });
    }
    if (jobAllocationsRes.error) {
      return NextResponse.json({ error: jobAllocationsRes.error.message }, { status: 400 });
    }
    if (operatorsRes.error) {
      return NextResponse.json({ error: operatorsRes.error.message }, { status: 400 });
    }
    if (cranesRes.error) {
      return NextResponse.json({ error: cranesRes.error.message }, { status: 400 });
    }

    const jobs = jobsRes.data ?? [];
    const allocations = [
      ...(equipmentAllocationsRes.data ?? []).map(normaliseJobEquipmentRow),
      ...(jobAllocationsRes.data ?? []).map(normaliseJobAllocationsRow),
    ];
    const operators = operatorsRes.data ?? [];
    const cranes = cranesRes.data ?? [];

    const days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dayIso = isoDate(d);
      const holiday = bankHolidays.find((h) => h.date === dayIso);

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

    const activeJobs = jobs.filter((job: any) => isPlannerVisibleStatus(job?.status));
    const activeJobById = new Map<string, any>(
      activeJobs.map((job: any) => [String(job.id), job])
    );

    const jobsInRange = activeJobs
      .filter((job: any) =>
        overlapsWorkingWeek(
          job.start_date ?? job.job_date,
          job.end_date ?? job.start_date ?? job.job_date,
          from,
          to,
          Boolean(job.exclude_weekends)
        )
      )
      .map((job: any) => {
        const startDate = job.start_date ?? job.job_date ?? null;
        const endDate = job.end_date ?? job.start_date ?? job.job_date ?? null;
        const workingDates = activeWorkingDates(startDate, endDate, Boolean(job.exclude_weekends));

        return {
          ...job,
          working_dates: workingDates,
          billable_days: countBillableDays(startDate, endDate, Boolean(job.exclude_weekends)),
          effective_price: effectiveJobPrice(job),
        };
      });

    const activeAllocations = allocations.filter((row: any) => {
      const linkedJob = activeJobById.get(String(row.job_id));
      if (!linkedJob) return false;

      const excludeWeekends = Boolean(linkedJob.exclude_weekends);

      return overlapsWorkingWeek(
        row.start_date ?? linkedJob.start_date ?? linkedJob.job_date,
        row.end_date ?? row.start_date ?? linkedJob.end_date ?? linkedJob.start_date ?? linkedJob.job_date,
        from,
        to,
        excludeWeekends
      );
    });

    const craneAllocationRows = activeAllocations.filter((row: any) => looksLikeCraneAllocation(row));
    const jobsWithAnyCrane = new Set<string>(
      jobsInRange
        .filter((job: any) => String(job?.crane_id ?? "").trim())
        .map((job: any) => String(job.id))
    );

    for (const row of craneAllocationRows) {
      jobsWithAnyCrane.add(String(row.job_id));
    }

    const labourAllocationRows = activeAllocations.filter((row: any) => {
      if (!looksLikeLabourAllocation(row)) return false;
      return !jobsWithAnyCrane.has(String(row.job_id));
    });

    const allocationItems = craneAllocationRows.map((row: any) => {
      const job = first(row.jobs) ?? activeJobById.get(String(row.job_id)) ?? null;
      const operator = first(row.operators);
      const crane = first(row.cranes);
      const client = first(job?.clients);

      const rowCraneId = row.crane_id ?? crane?.id ?? null;
      const startDate = row.start_date ?? job?.start_date ?? job?.job_date ?? null;
      const endDate = row.end_date ?? job?.end_date ?? startDate ?? null;
      const excludeWeekends = Boolean(job?.exclude_weekends);

      return {
        id: `alloc_${row.allocation_source}_${row.id}_${rowCraneId ?? "none"}`,
        allocation_id: row.id,
        allocation_source: row.allocation_source,
        job_id: row.job_id,
        job_number: job?.job_number ?? null,
        job_date: startDate,
        start_date: startDate,
        end_date: endDate,
        start_time: row.start_time ?? job?.start_time ?? null,
        end_time: row.end_time ?? job?.end_time ?? null,
        status: job?.status ?? null,
        site_name: job?.site_name ?? null,
        site_address: job?.site_address ?? null,
        operator_id: row.operator_id ?? job?.operator_id ?? null,
        equipment_id: rowCraneId,
        item_name: row.item_name ?? null,
        clients: client ? [client] : [],
        operators: operator ? [operator] : [],
        equipment: crane ? [crane] : [],
        agreed_sell_rate: num(row.agreed_sell_rate),
        supplier_cost: num(row.supplier_cost),
        price_mode: job?.price_mode ?? "full_job",
        price_per_day: num(job?.price_per_day),
        job_price: effectiveJobPrice(job),
        exclude_weekends: excludeWeekends,
        working_dates: activeWorkingDates(startDate, endDate, excludeWeekends),
        billable_days: countBillableDays(startDate, endDate, excludeWeekends),
        notes: row.notes ?? job?.notes ?? null,
        planner_group: "allocated",
      };
    });

    const labourOnlyItems = labourAllocationRows.map((row: any) => {
      const job = first(row.jobs) ?? activeJobById.get(String(row.job_id)) ?? null;
      const operator = first(row.operators);
      const client = first(job?.clients);
      const startDate = row.start_date ?? job?.start_date ?? job?.job_date ?? null;
      const endDate =
        row.end_date ??
        row.start_date ??
        job?.end_date ??
        job?.start_date ??
        job?.job_date ??
        null;
      const excludeWeekends = Boolean(job?.exclude_weekends);

      return {
        id: `labour_${row.allocation_source}_${row.id}`,
        allocation_id: row.id,
        allocation_source: row.allocation_source,
        job_id: row.job_id,
        job_number: job?.job_number ?? null,
        job_date: startDate,
        start_date: startDate,
        end_date: endDate,
        start_time: row.start_time ?? job?.start_time ?? null,
        end_time: row.end_time ?? job?.end_time ?? null,
        status: job?.status ?? null,
        site_name: job?.site_name ?? null,
        site_address: job?.site_address ?? null,
        operator_id: row.operator_id ?? job?.operator_id ?? null,
        equipment_id: null,
        item_name: row.item_name ?? "Labour / Other",
        clients: client ? [client] : [],
        operators: operator ? [operator] : [],
        equipment: [],
        agreed_sell_rate: num(row.agreed_sell_rate),
        supplier_cost: num(row.supplier_cost),
        price_mode: job?.price_mode ?? "full_job",
        price_per_day: num(job?.price_per_day),
        job_price: effectiveJobPrice(job),
        exclude_weekends: excludeWeekends,
        working_dates: activeWorkingDates(startDate, endDate, excludeWeekends),
        billable_days: countBillableDays(startDate, endDate, excludeWeekends),
        notes: row.notes ?? job?.notes ?? null,
        planner_group: "labour_only",
      };
    });

    const representedCranePairs = new Set(
      allocationItems
        .filter((item: any) => item.equipment_id)
        .map((item: any) => `${item.job_id}:${item.equipment_id}`)
    );

    const jobsWithPureLabourAllocations = new Set(
      labourAllocationRows.map((row: any) => String(row.job_id))
    );

    const directJobItems = jobsInRange.flatMap((job: any) => {
      const client = first(job.clients);
      const operator = first(job.operators);
      const crane = first(job.cranes);
      const startDate = job.start_date ?? job.job_date ?? null;
      const endDate = job.end_date ?? startDate ?? null;
      const excludeWeekends = Boolean(job.exclude_weekends);
      const jobId = String(job.id);
      const mainCraneId = String(job.crane_id ?? "").trim();

      if (mainCraneId) {
        const pairKey = `${jobId}:${mainCraneId}`;

        if (!representedCranePairs.has(pairKey)) {
          return [
            {
              id: `job_${job.id}_${mainCraneId}`,
              allocation_id: null,
              allocation_source: null,
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
              item_name: null,
              clients: client ? [client] : [],
              operators: operator ? [operator] : [],
              equipment: crane ? [crane] : [],
              agreed_sell_rate: 0,
              supplier_cost: 0,
              price_mode: job.price_mode ?? "full_job",
              price_per_day: num(job.price_per_day),
              job_price: effectiveJobPrice(job),
              exclude_weekends: excludeWeekends,
              working_dates: activeWorkingDates(startDate, endDate, excludeWeekends),
              billable_days: countBillableDays(startDate, endDate, excludeWeekends),
              notes: job.notes ?? null,
              planner_group: "allocated",
            },
          ];
        }

        return [];
      }

      if (jobsWithAnyCrane.has(jobId) || jobsWithPureLabourAllocations.has(jobId)) {
        return [];
      }

      const plannerGroup = classifyUnassignedType(job);

      return [
        {
          id: `job_${job.id}`,
          allocation_id: null,
          allocation_source: null,
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
          equipment_id: null,
          item_name: plannerGroup === "labour_only" ? "Labour / Other" : null,
          clients: client ? [client] : [],
          operators: operator ? [operator] : [],
          equipment: [],
          agreed_sell_rate: 0,
          supplier_cost: 0,
          price_mode: job.price_mode ?? "full_job",
          price_per_day: num(job.price_per_day),
          job_price: effectiveJobPrice(job),
          exclude_weekends: excludeWeekends,
          working_dates: activeWorkingDates(startDate, endDate, excludeWeekends),
          billable_days: countBillableDays(startDate, endDate, excludeWeekends),
          notes: job.notes ?? null,
          planner_group: plannerGroup,
        },
      ];
    });

    return NextResponse.json({
      week_start: from,
      week_end: to,
      days,
      bank_holidays: bankHolidays,
      items: [...allocationItems, ...labourOnlyItems, ...directJobItems],
      operators: operators ?? [],
      equipment:
        cranes.map((row: any) => ({
          id: row.id,
          name: row.name ?? null,
          asset_number: row.reg_number ?? null,
        })) ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load planner board." },
      { status: 400 }
    );
  }
}
