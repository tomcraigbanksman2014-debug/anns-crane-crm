import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { getEnglandWalesBankHolidays } from "../../../lib/bankHolidays";

function startOfWeek(dateStr?: string | null) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
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

function normaliseDateBounds(
  startDate: string | null | undefined,
  endDate: string | null | undefined
) {
  const start = String(startDate ?? "").trim();
  const end = String(endDate ?? startDate ?? "").trim();

  if (!start && !end) {
    return { start: "", end: "" };
  }

  if (!start) {
    return { start: end, end };
  }

  if (!end) {
    return { start, end: start };
  }

  const startParsed = parseDateOnly(start);
  const endParsed = parseDateOnly(end);

  if (startParsed && endParsed && endParsed < startParsed) {
    return { start: end, end: start };
  }

  return { start, end };
}

function dateRangeInclusive(startDate: string, endDate: string) {
  const bounds = normaliseDateBounds(startDate, endDate);
  const start = parseDateOnly(bounds.start);
  const end = parseDateOnly(bounds.end);

  if (!start || !end) return [];

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
  const bounds = normaliseDateBounds(startDate, endDate);
  if (!bounds.start || !bounds.end) return [];

  const allDates = dateRangeInclusive(bounds.start, bounds.end);
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

function liftPlanStatusLabel(liftPlan: any) {
  if (!liftPlan) return "LP required";

  const lockedAt = String(liftPlan?.locked_at ?? "").trim();
  if (lockedAt) return "LP locked";

  const hasAnyContent = [
    liftPlan?.method_statement,
    liftPlan?.risk_assessment,
    liftPlan?.sequence_of_operations,
    liftPlan?.communication_plan,
    liftPlan?.pack_sections,
  ].some((value) => {
    if (value == null) return false;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return String(value).trim().length > 0;
  });

  return hasAnyContent ? "LP draft" : "LP required";
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

function looksLikeCrossHireCraneAllocation(row: any) {
  const sourceType = String(row?.source_type ?? "").trim().toLowerCase();
  const assetType = String(row?.asset_type ?? "").trim().toLowerCase();
  const craneId = String(row?.crane_id ?? "").trim();
  const supplierId = String(row?.supplier_id ?? first(row?.jobs)?.supplier_id ?? "").trim();
  const supplierReference = String(row?.supplier_reference ?? "").trim();
  const supplierCost = num(row?.supplier_cost ?? row?.agreed_cost);

  if (sourceType === "cross_hire") {
    return assetType === "crane" || looksLikeCraneAllocation(row);
  }

  if (assetType !== "crane") return false;
  if (craneId) return false;

  return Boolean(supplierId || supplierReference || supplierCost > 0);
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
    itemName.includes("supervisor") ||
    itemName.includes("operator") ||
    notes.includes("labour") ||
    notes.includes("slinger") ||
    notes.includes("supervisor") ||
    notes.includes("operator")
  );
}

export async function GET(req: Request) {
  try {
    const supabase = await requireApiUser();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    const weekStartDate = startOfWeek(date);
    const weekEndDate = endOfWeek(date);
    const weekStart = isoDate(weekStartDate);
    const weekEnd = isoDate(weekEndDate);

    const [
      jobsRes,
      equipmentAllocationsRes,
      jobAllocationsRes,
      operatorsRes,
      cranesRes,
      bankHolidayRes,
      liftPlansRes,
    ] = await Promise.all([
      supabase
        .from("jobs")
        .select(`
          id,
          job_number,
          client_id,
          operator_id,
          crane_id,
          site_name,
          site_address,
          start_date,
          end_date,
          job_date,
          start_time,
          end_time,
          hire_type,
          lift_type,
          status,
          notes,
          supplier_id,
          cross_hire_cost_total,
          invoice_subtotal,
          invoice_amount,
          total_invoice,
          price_mode,
          price_per_day,
          exclude_weekends,
          clients:client_id (id, company_name),
          operators:operator_id (id, full_name),
          cranes:crane_id (id, name, asset_number)
        `),

      supabase
        .from("job_equipment")
        .select(`
          id,
          job_id,
          crane_id,
          operator_id,
          start_date,
          end_date,
          start_time,
          end_time,
          source_type,
          supplier_id,
          supplier_reference,
          supplier_cost,
          agreed_sell_rate,
          notes,
          cranes:crane_id (id, name, asset_number),
          operators:operator_id (id, full_name),
          jobs:job_id (
            id,
            job_number,
            client_id,
            operator_id,
            crane_id,
            site_name,
            site_address,
            start_date,
            end_date,
            job_date,
            start_time,
            end_time,
            hire_type,
            lift_type,
            status,
            notes,
            supplier_id,
            cross_hire_cost_total,
            invoice_subtotal,
            invoice_amount,
            total_invoice,
            price_mode,
            price_per_day,
            exclude_weekends,
            clients:client_id (id, company_name)
          ),
          suppliers:supplier_id (id, company_name)
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
            site_name,
            site_address,
            start_date,
            end_date,
            job_date,
            start_time,
            end_time,
            status,
            notes,
            price_mode,
            price_per_day,
            invoice_subtotal,
            invoice_amount,
            total_invoice,
            exclude_weekends,
            clients:client_id (id, company_name)
          ),
          cranes:crane_id (id, name, asset_number),
          operators:operator_id (id, full_name)
        `),

      supabase
        .from("operators")
        .select("id, full_name")
        .eq("active", true)
        .order("full_name", { ascending: true }),

      supabase
        .from("cranes")
        .select("id, name, asset_number")
        .eq("active", true)
        .order("name", { ascending: true }),

      getEnglandWalesBankHolidays(),

      supabase
        .from("lift_plans")
        .select("job_id, locked_at, method_statement, risk_assessment, sequence_of_operations, communication_plan, pack_sections"),
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

    if (liftPlansRes.error) {
      return NextResponse.json({ error: liftPlansRes.error.message }, { status: 400 });
    }

    const jobs = jobsRes.data ?? [];
    const equipmentAllocations = equipmentAllocationsRes.data ?? [];
    const jobAllocations = jobAllocationsRes.data ?? [];
    const operators = operatorsRes.data ?? [];
    const cranes = cranesRes.data ?? [];
    const liftPlans = liftPlansRes.data ?? [];

    const bankHolidays = (bankHolidayRes ?? []).filter((item) => item.date >= weekStart && item.date <= weekEnd);
    const bankHolidayMap = new Map(bankHolidays.map((item) => [item.date, item.label]));
    const liftPlanByJobId = new Map(liftPlans.map((row: any) => [String(row.job_id), row]));

    const activeJobs = jobs.filter((job: any) => isPlannerVisibleStatus(job?.status));
    const activeJobById = new Map(activeJobs.map((job: any) => [String(job.id), job]));

    const allAllocations = [...equipmentAllocations, ...jobAllocations]
      .filter((job: any) => job && isPlannerVisibleStatus(job?.status));

    const activeAllocations = allAllocations
      .map((row: any) => {
        if ("start_at" in row || "end_at" in row) {
          return {
            id: row.id,
            allocation_source: "job_allocations",
            job_id: row.job_id,
            asset_type: row.asset_type,
            crane_id: row.crane_id ?? row.equipment_id ?? null,
            operator_id: row.operator_id ?? null,
            start_date: dateOnlyFromTimestamp(row.start_at) ?? row.jobs?.start_date ?? row.jobs?.job_date ?? null,
            end_date: dateOnlyFromTimestamp(row.end_at) ?? row.jobs?.end_date ?? row.jobs?.start_date ?? row.jobs?.job_date ?? null,
            start_time: timeOnlyFromTimestamp(row.start_at) ?? row.jobs?.start_time ?? null,
            end_time: timeOnlyFromTimestamp(row.end_at) ?? row.jobs?.end_time ?? null,
            source_type: row.asset_type === "crane" ? "owned" : null,
            supplier_id: null,
            supplier_reference: row.supplier_reference ?? null,
            supplier_cost: num(row.agreed_cost),
            agreed_sell_rate: 0,
            item_name: null,
            notes: row.notes ?? null,
            jobs: row.jobs,
            cranes: row.cranes,
            operators: row.operators,
            suppliers: [],
          };
        }

        return {
          ...row,
          allocation_source: "job_equipment",
          asset_type: looksLikeCraneAllocation(row) ? "crane" : "other",
        };
      })
      .filter((row: any) => {
        const relatedJob = first(row.jobs) ?? activeJobById.get(String(row.job_id)) ?? null;
        const excludeWeekends = Boolean(relatedJob?.exclude_weekends);
        return overlapsWorkingWeek(
          row.start_date ?? relatedJob?.start_date ?? relatedJob?.job_date ?? null,
          row.end_date ?? relatedJob?.end_date ?? row.start_date ?? relatedJob?.start_date ?? relatedJob?.job_date ?? null,
          weekStart,
          weekEnd,
          excludeWeekends
        );
      });

    const jobsInRange = activeJobs.filter((job: any) =>
      overlapsWorkingWeek(
        job.start_date ?? job.job_date ?? null,
        job.end_date ?? job.start_date ?? job.job_date ?? null,
        weekStart,
        weekEnd,
        Boolean(job.exclude_weekends)
      )
    );

    const jobsWithAnyAllocationRows = new Set(activeAllocations.map((row: any) => String(row.job_id)));
    const jobsWithAnyCraneAllocationRows = new Set(
      activeAllocations
        .filter((row: any) => looksLikeCraneAllocation(row) || looksLikeCrossHireCraneAllocation(row))
        .map((row: any) => String(row.job_id))
    );

    const linkedTransportRes = await supabase
      .from("transport_jobs")
      .select(`
        id,
        job_number,
        linked_job_id,
        status,
        transport_date,
        delivery_date
      `)
      .not("linked_job_id", "is", null);

    if (linkedTransportRes.error) {
      return NextResponse.json({ error: linkedTransportRes.error.message }, { status: 400 });
    }

    const linkedTransportByJobId = new Map<string, string[]>();

    (linkedTransportRes.data ?? []).forEach((row: any) => {
      if (!row?.linked_job_id) return;
      if (!isPlannerVisibleStatus(row?.status)) return;
      const key = String(row.linked_job_id);
      const existing = linkedTransportByJobId.get(key) ?? [];
      existing.push(row?.job_number ? `#${row.job_number}` : `T${row.id}`);
      linkedTransportByJobId.set(key, existing);
    });

    function getLinkedTransportMeta(jobId: string | null | undefined) {
      const rows = linkedTransportByJobId.get(String(jobId ?? "")) ?? [];
      return {
        linked_transport_job_count: rows.length,
        linked_transport_numbers: rows,
      };
    }

    const crossHireCraneAllocationRows = activeAllocations.filter((row: any) =>
      looksLikeCrossHireCraneAllocation(row)
    );
    const craneAllocationRows = activeAllocations.filter((row: any) => {
      if (looksLikeCrossHireCraneAllocation(row)) return false;
      return looksLikeCraneAllocation(row);
    });
    const labourAllocationRows = activeAllocations.filter((row: any) => {
      if (!looksLikeLabourAllocation(row)) return false;
      return !jobsWithAnyCraneAllocationRows.has(String(row.job_id));
    });

    const allocationItems = craneAllocationRows.map((row: any) => {
      const job = first(row.jobs) ?? activeJobById.get(String(row.job_id)) ?? null;
      const operator = first(row.operators);
      const crane = first(row.cranes);
      const client = first(job?.clients);
      const liftPlan = liftPlanByJobId.get(String(row.job_id)) ?? null;

      const rowCraneId = row.crane_id ?? crane?.id ?? null;
      const dateBounds = normaliseDateBounds(
        row.start_date ?? job?.start_date ?? job?.job_date ?? null,
        row.end_date ?? job?.end_date ?? row.start_date ?? job?.start_date ?? job?.job_date ?? null
      );
      const excludeWeekends = Boolean(job?.exclude_weekends);

      const linkedTransportMeta = getLinkedTransportMeta(row.job_id);

      return {
        id: `alloc_${row.allocation_source}_${row.id}_${rowCraneId ?? "none"}`,
        allocation_id: row.id,
        allocation_source: row.allocation_source,
        job_id: row.job_id,
        job_number: job?.job_number ?? null,
        job_date: dateBounds.start || null,
        start_date: dateBounds.start || null,
        end_date: dateBounds.end || null,
        start_time: row.start_time ?? job?.start_time ?? null,
        end_time: row.end_time ?? job?.end_time ?? null,
        status: job?.status ?? null,
        site_name: job?.site_name ?? null,
        site_address: job?.site_address ?? null,
        operator_id: row.operator_id ?? job?.operator_id ?? null,
        equipment_id: rowCraneId,
        source_type: row.source_type ?? "owned",
        item_name: row.item_name ?? null,
        clients: client ? [client] : [],
        operators: operator ? [operator] : [],
        equipment: crane ? [crane] : [],
        agreed_sell_rate: num(row.agreed_sell_rate),
        supplier_id: row?.supplier_id ?? job?.supplier_id ?? null,
        supplier_reference: row?.supplier_reference ?? null,
        supplier_cost: num(row.supplier_cost) || num(job?.cross_hire_cost_total),
        price_mode: job?.price_mode ?? "full_job",
        price_per_day: num(job?.price_per_day),
        job_price: effectiveJobPrice(job),
        exclude_weekends: excludeWeekends,
        working_dates: activeWorkingDates(dateBounds.start, dateBounds.end, excludeWeekends),
        billable_days: countBillableDays(dateBounds.start, dateBounds.end, excludeWeekends),
        notes: row.notes ?? job?.notes ?? null,
        linked_transport_job_count: linkedTransportMeta.linked_transport_job_count,
        linked_transport_numbers: linkedTransportMeta.linked_transport_numbers,
        planner_group: "allocated",
        lift_plan_status: liftPlanStatusLabel(liftPlan),
      };
    });

    const crossHireItems = crossHireCraneAllocationRows.map((row: any) => {
      const job = first(row.jobs) ?? activeJobById.get(String(row.job_id)) ?? null;
      const operator = first(row.operators);
      const client = first(job?.clients);
      const supplier = first(row.suppliers);
      const liftPlan = liftPlanByJobId.get(String(row.job_id)) ?? null;
      const dateBounds = normaliseDateBounds(
        row.start_date ?? job?.start_date ?? job?.job_date ?? null,
        row.end_date ?? job?.end_date ?? row.start_date ?? job?.start_date ?? job?.job_date ?? null
      );
      const excludeWeekends = Boolean(job?.exclude_weekends);

      const linkedTransportMeta = getLinkedTransportMeta(row.job_id);

      return {
        id: `cross_hire_${row.allocation_source}_${row.id}`,
        allocation_id: row.id,
        allocation_source: row.allocation_source,
        job_id: row.job_id,
        job_number: job?.job_number ?? null,
        job_date: dateBounds.start || null,
        start_date: dateBounds.start || null,
        end_date: dateBounds.end || null,
        start_time: row.start_time ?? job?.start_time ?? null,
        end_time: row.end_time ?? job?.end_time ?? null,
        status: job?.status ?? null,
        site_name: job?.site_name ?? null,
        site_address: job?.site_address ?? null,
        operator_id: row.operator_id ?? job?.operator_id ?? null,
        equipment_id: null,
        source_type: "cross_hire",
        item_name: row.item_name ?? supplier?.company_name ?? "Cross-hired crane",
        clients: client ? [client] : [],
        operators: operator ? [operator] : [],
        equipment: [],
        agreed_sell_rate: num(row.agreed_sell_rate),
        supplier_id: row?.supplier_id ?? job?.supplier_id ?? null,
        supplier_reference: row?.supplier_reference ?? null,
        supplier_cost: num(row.supplier_cost) || num(job?.cross_hire_cost_total),
        price_mode: job?.price_mode ?? "full_job",
        price_per_day: num(job?.price_per_day),
        job_price: effectiveJobPrice(job),
        exclude_weekends: excludeWeekends,
        working_dates: activeWorkingDates(dateBounds.start, dateBounds.end, excludeWeekends),
        billable_days: countBillableDays(dateBounds.start, dateBounds.end, excludeWeekends),
        notes: row.notes ?? job?.notes ?? null,
        linked_transport_job_count: linkedTransportMeta.linked_transport_job_count,
        linked_transport_numbers: linkedTransportMeta.linked_transport_numbers,
        planner_group: "cross_hired",
        lift_plan_status: liftPlanStatusLabel(liftPlan),
      };
    });

    const labourOnlyItems = labourAllocationRows.map((row: any) => {
      const job = first(row.jobs) ?? activeJobById.get(String(row.job_id)) ?? null;
      const operator = first(row.operators);
      const client = first(job?.clients);
      const liftPlan = liftPlanByJobId.get(String(row.job_id)) ?? null;
      const dateBounds = normaliseDateBounds(
        row.start_date ?? job?.start_date ?? job?.job_date ?? null,
        row.end_date ??
          row.start_date ??
          job?.end_date ??
          job?.start_date ??
          job?.job_date ??
          null
      );
      const excludeWeekends = Boolean(job?.exclude_weekends);

      const linkedTransportMeta = getLinkedTransportMeta(row.job_id);

      return {
        id: `labour_${row.allocation_source}_${row.id}`,
        allocation_id: row.id,
        allocation_source: row.allocation_source,
        job_id: row.job_id,
        job_number: job?.job_number ?? null,
        job_date: dateBounds.start || null,
        start_date: dateBounds.start || null,
        end_date: dateBounds.end || null,
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
        working_dates: activeWorkingDates(dateBounds.start, dateBounds.end, excludeWeekends),
        billable_days: countBillableDays(dateBounds.start, dateBounds.end, excludeWeekends),
        notes: row.notes ?? job?.notes ?? null,
        linked_transport_job_count: linkedTransportMeta.linked_transport_job_count,
        linked_transport_numbers: linkedTransportMeta.linked_transport_numbers,
        planner_group: "labour_only",
        lift_plan_status: liftPlanStatusLabel(liftPlan),
      };
    });

    const directJobItems = jobsInRange.flatMap((job: any) => {
      const client = first(job.clients);
      const operator = first(job.operators);
      const crane = first(job.cranes);
      const dateBounds = normaliseDateBounds(
        job.start_date ?? job.job_date ?? null,
        job.end_date ?? job.start_date ?? job.job_date ?? null
      );
      const excludeWeekends = Boolean(job.exclude_weekends);
      const jobId = String(job.id);
      const mainCraneId = String(job.crane_id ?? "").trim();
      const linkedTransportMeta = getLinkedTransportMeta(job.id);
      const isCrossHiredDirect = Boolean(job?.supplier_id) || num(job?.cross_hire_cost_total) > 0;
      const liftPlan = liftPlanByJobId.get(String(job.id)) ?? null;

      if (jobsWithAnyAllocationRows.has(jobId)) {
        return [];
      }

      if (mainCraneId) {
        return [
          {
            id: `job_${job.id}_${mainCraneId}`,
            allocation_id: null,
            allocation_source: null,
            job_id: job.id,
            job_number: job.job_number ?? null,
            job_date: dateBounds.start || null,
            start_date: dateBounds.start || null,
            end_date: dateBounds.end || null,
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
            working_dates: activeWorkingDates(dateBounds.start, dateBounds.end, excludeWeekends),
            billable_days: countBillableDays(dateBounds.start, dateBounds.end, excludeWeekends),
            notes: job.notes ?? null,
            linked_transport_job_count: linkedTransportMeta.linked_transport_job_count,
            linked_transport_numbers: linkedTransportMeta.linked_transport_numbers,
            planner_group: "allocated",
            lift_plan_status: liftPlanStatusLabel(liftPlan),
          },
        ];
      }

      const plannerGroup = isCrossHiredDirect ? "cross_hired" : classifyUnassignedType(job);

      return [
        {
          id: `job_${job.id}`,
          allocation_id: null,
          allocation_source: null,
          job_id: job.id,
          job_number: job.job_number ?? null,
          job_date: dateBounds.start || null,
          start_date: dateBounds.start || null,
          end_date: dateBounds.end || null,
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
          supplier_cost: num(job.cross_hire_cost_total),
          supplier_id: job.supplier_id ?? null,
          supplier_reference: null,
          source_type: plannerGroup === "cross_hired" ? "cross_hire" : null,
          price_mode: job.price_mode ?? "full_job",
          price_per_day: num(job.price_per_day),
          job_price: effectiveJobPrice(job),
          exclude_weekends: excludeWeekends,
          working_dates: activeWorkingDates(dateBounds.start, dateBounds.end, excludeWeekends),
          billable_days: countBillableDays(dateBounds.start, dateBounds.end, excludeWeekends),
          notes: job.notes ?? null,
          linked_transport_job_count: linkedTransportMeta.linked_transport_job_count,
          linked_transport_numbers: linkedTransportMeta.linked_transport_numbers,
          planner_group: plannerGroup,
          lift_plan_status: liftPlanStatusLabel(liftPlan),
        },
      ];
    });

    const items = [...allocationItems, ...crossHireItems, ...labourOnlyItems, ...directJobItems];

    const days = Array.from({ length: 7 }).map((_, index) => {
      const dayDate = new Date(weekStartDate);
      dayDate.setDate(weekStartDate.getDate() + index);
      const dayIso = isoDate(dayDate);
      const label = dayDate.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      });
      return {
        date: dayIso,
        label,
        is_bank_holiday: bankHolidayMap.has(dayIso),
        bank_holiday_label: bankHolidayMap.get(dayIso) ?? null,
      };
    });

    return NextResponse.json({
      week_start: weekStart,
      week_end: weekEnd,
      days,
      bank_holidays: bankHolidays,
      items,
      operators,
      equipment: cranes,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load planner board." },
      { status: 400 }
    );
  }
}
