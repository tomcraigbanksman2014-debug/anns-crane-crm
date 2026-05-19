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

  const subtotal = num(job?.invoice_subtotal);
  if (subtotal > 0) return subtotal;

  const invoiceAmount = num(job?.invoice_amount);
  if (invoiceAmount > 0) return invoiceAmount;

  const gross = num(job?.invoice_total) || num(job?.total_invoice);
  const vat = num(job?.invoice_vat);
  if (gross > 0 && vat > 0) return Math.max(gross - vat, 0);

  return gross;
}

function liftPlanStatusLabel(liftPlan: any) {
  if (!liftPlan) return "LP required";

  if (Boolean(liftPlan?.paperwork_locked)) return "LP locked";

  const hasAnyContent = [
    liftPlan?.method_statement,
    liftPlan?.risk_assessment,
    liftPlan?.pack_sections,
  ].some((value) => {
    if (value == null) return false;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return String(value).trim().length > 0;
  });

  return hasAnyContent ? "LP draft" : "LP required";
}

function shouldShowLiftPlanStatus(job: any) {
  const hireType = String(job?.hire_type ?? "").trim().toLowerCase();
  const liftType = String(job?.lift_type ?? "").trim().toLowerCase();

  if (hireType === "contract lift" || hireType === "contract_lift") return true;
  if (hireType === "cpa") return false;

  if (liftType.includes("contract lift")) return true;
  if (liftType.includes("cpa")) return false;

  return false;
}

function plannerLiftPlanStatus(job: any, liftPlan: any) {
  return shouldShowLiftPlanStatus(job) ? liftPlanStatusLabel(liftPlan) : null;
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

  // Be deliberately forgiving here. The live CRM has had allocations saved
  // through more than one route, so a real crane allocation may be identified
  // by asset_type, crane_id, or the joined crane object. Do not treat a generic
  // equipment_id as a crane here because lifting equipment also uses equipment_id.
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
    return assetType !== "other" && Boolean(craneId || supplierId || supplierReference || supplierCost > 0 || assetType === "crane");
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
      jobsRes,
      equipmentAllocationsRes,
      jobAllocationsRes,
      operatorsRes,
      cranesRes,
      bankHolidayRes,
      liftPlansRes,
      jobSupplierLinksRes,
      visitInvoicesRes,
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
          archived,
          notes,
          supplier_id,
          cross_hire_cost_total,
          invoice_subtotal,
          invoice_amount,
          invoice_vat,
          invoice_total,
          total_invoice,
          price_mode,
          price_per_day,
          exclude_weekends,
          clients:client_id (id, company_name),
          operators:operator_id (id, full_name),
          cranes:crane_id (id, name, asset_number:reg_number)
        `)
        .eq("archived", false),

      supabase
        .from("job_equipment")
        .select(`
          id,
          job_id,
          asset_type,
          item_name,
          crane_id,
          vehicle_id,
          equipment_id,
          operator_id,
          start_date,
          end_date,
          start_time,
          end_time,
          source_type,
          supplier_id,
          supplier_reference,
          supplier_cost,
          agreed_cost,
          agreed_sell_rate,
          notes,
          cranes:crane_id (id, name, asset_number:reg_number),
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
            archived,
            notes,
            supplier_id,
            cross_hire_cost_total,
            invoice_subtotal,
            invoice_amount,
            invoice_vat,
            invoice_total,
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
            archived,
            notes,
            supplier_id,
            cross_hire_cost_total,
            price_mode,
            price_per_day,
            invoice_subtotal,
            invoice_amount,
            invoice_vat,
            invoice_total,
            total_invoice,
            exclude_weekends,
            clients:client_id (id, company_name)
          ),
          cranes:crane_id (id, name, asset_number:reg_number),
          operators:operator_id (id, full_name)
        `),

      supabase
        .from("operators")
        .select("id, full_name")
        .eq("archived", false)
        .order("full_name", { ascending: true }),

      supabase
        .from("cranes")
        .select("id, name, asset_number:reg_number")
        .eq("archived", false)
        .order("name", { ascending: true }),

      bankHolidaySeed,

      supabase
        .from("lift_plans")
        .select("job_id, paperwork_locked, method_statement, risk_assessment, pack_sections"),

      supabase
        .from("job_supplier_links")
        .select(`
          id,
          job_id,
          supplier_id,
          supplier_display_name,
          supplier_category,
          supplier_reference,
          service_description,
          supplier_cost,
          notes,
          is_primary,
          sort_order
        `),

      supabase
        .from("job_visit_invoices")
        .select("id, job_id, visit_date, invoice_status, invoice_number, invoice_date, notes")
        .gte("visit_date", weekStart)
        .lte("visit_date", weekEnd),
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

    if (jobSupplierLinksRes.error) {
      return NextResponse.json({ error: jobSupplierLinksRes.error.message }, { status: 400 });
    }

    if (visitInvoicesRes.error) {
      return NextResponse.json({ error: visitInvoicesRes.error.message }, { status: 400 });
    }

    const jobs = jobsRes.data ?? [];
    const equipmentAllocations = equipmentAllocationsRes.data ?? [];
    const jobAllocations = jobAllocationsRes.data ?? [];
    const operators = operatorsRes.data ?? [];
    const cranes = cranesRes.data ?? [];
    const liftPlans = liftPlansRes.data ?? [];
    const jobSupplierLinks = jobSupplierLinksRes.data ?? [];
    const visitInvoices = visitInvoicesRes.data ?? [];

    const craneById = new Map(cranes.map((row: any) => [String(row.id), row]));
    const operatorById = new Map(operators.map((row: any) => [String(row.id), row]));

    const bankHolidays = (bankHolidayRes ?? []).filter((item) => item.date >= weekStart && item.date <= weekEnd);
    const bankHolidayMap = new Map(bankHolidays.map((item) => [item.date, item.label]));
    const liftPlanByJobId = new Map(liftPlans.map((row: any) => [String(row.job_id), row]));

    const visitInvoicesByJobId = new Map<string, Record<string, any>>();
    (visitInvoices ?? []).forEach((row: any) => {
      const jobId = String(row?.job_id ?? "").trim();
      const visitDate = String(row?.visit_date ?? "").slice(0, 10);
      if (!jobId || !visitDate) return;
      const existing = visitInvoicesByJobId.get(jobId) ?? {};
      existing[visitDate] = row;
      visitInvoicesByJobId.set(jobId, existing);
    });

    const getVisitInvoicesForJob = (jobId: string | null | undefined) => {
      return visitInvoicesByJobId.get(String(jobId ?? "").trim()) ?? {};
    };

    const supplierLinksByJobId = new Map<string, any[]>();
    (jobSupplierLinks ?? []).forEach((row: any) => {
      const jobId = String(row?.job_id ?? "").trim();
      if (!jobId) return;
      const existing = supplierLinksByJobId.get(jobId) ?? [];
      existing.push(row);
      supplierLinksByJobId.set(jobId, existing);
    });

    const getSupplierLinksForJob = (jobId: string | null | undefined) => {
      return supplierLinksByJobId.get(String(jobId ?? "").trim()) ?? [];
    };

    const getPrimarySupplierLinkForJob = (jobId: string | null | undefined) => {
      const links = getSupplierLinksForJob(jobId);
      if (links.length === 0) return null;

      return (
        links.find((row: any) => Boolean(row?.is_primary)) ??
        [...links].sort((a: any, b: any) => num(a?.sort_order) - num(b?.sort_order))[0] ??
        null
      );
    };

    const getSupplierCostTotalForJob = (jobId: string | null | undefined) => {
      return getSupplierLinksForJob(jobId).reduce((total: number, row: any) => total + num(row?.supplier_cost), 0);
    };

    const jobHasCrossHireMeta = (jobId: string | null | undefined, job?: any) => {
      const id = String(jobId ?? job?.id ?? "").trim();
      const linkedJob = job ?? (id ? jobs.find((row: any) => String(row?.id) === id) : null);
      return Boolean(
        String(linkedJob?.supplier_id ?? "").trim() ||
          num(linkedJob?.cross_hire_cost_total) > 0 ||
          getSupplierLinksForJob(id).length > 0
      );
    };

    const activeJobs = jobs.filter((job: any) => isPlannerVisibleStatus(job?.status));
    const activeJobById = new Map(activeJobs.map((job: any) => [String(job.id), job]));

    const allAllocations = [...equipmentAllocations, ...jobAllocations].filter(Boolean);

    const findCraneByLooseName = (value: string | null | undefined) => {
      const target = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
      if (!target) return null;

      return (cranes as any[]).find((crane: any) => {
        const names = [crane?.name, crane?.asset_number, crane?.reg_number]
          .map((item) =>
            String(item ?? "")
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "")
          )
          .filter(Boolean);

        return names.some((name) => name === target || name.includes(target) || target.includes(name));
      }) ?? null;
    };

    const resolveAllocationCrane = (row: any) => {
      const joinedCrane = first(row?.cranes);
      const directCraneId = String(row?.crane_id ?? "").trim();
      const possibleEquipmentId = String(row?.equipment_id ?? "").trim();
      const relatedJob = activeJobById.get(String(row?.job_id ?? "")) ?? first(row?.jobs) ?? null;
      const jobCraneId = String(relatedJob?.crane_id ?? "").trim();
      const assetType = String(row?.asset_type ?? "").trim().toLowerCase();

      const idMatch: any =
        (directCraneId ? craneById.get(directCraneId) ?? null : null) ??
        (possibleEquipmentId ? craneById.get(possibleEquipmentId) ?? null : null) ??
        (assetType === "crane" && jobCraneId ? craneById.get(jobCraneId) ?? null : null) ??
        null;

      const nameMatch: any =
        joinedCrane ??
        idMatch ??
        findCraneByLooseName(row?.item_name) ??
        findCraneByLooseName(row?.notes) ??
        null;

      return {
        crane: nameMatch,
        craneId: String(directCraneId || idMatch?.id || nameMatch?.id || (assetType === "crane" ? jobCraneId : "")).trim() || null,
      };
    };

    const normalisedAllocations = allAllocations
      .map((row: any) => {
        if ("start_at" in row || "end_at" in row) {
          const resolvedCrane = resolveAllocationCrane(row);
          const fallbackCraneId = String(resolvedCrane.craneId ?? row.crane_id ?? row.equipment_id ?? "").trim() || null;
          const fallbackCrane = resolvedCrane.crane ?? (fallbackCraneId ? craneById.get(fallbackCraneId) ?? first(row.cranes) : first(row.cranes));
          const normalisedAssetType = fallbackCraneId || String(row.asset_type ?? "").trim().toLowerCase() === "crane" ? "crane" : row.asset_type;

          return {
            id: row.id,
            allocation_source: "job_allocations",
            job_id: row.job_id,
            asset_type: normalisedAssetType,
            crane_id: fallbackCraneId,
            operator_id: row.operator_id ?? null,
            start_date: dateOnlyFromTimestamp(row.start_at) ?? row.jobs?.start_date ?? row.jobs?.job_date ?? null,
            end_date: dateOnlyFromTimestamp(row.end_at) ?? row.jobs?.end_date ?? row.jobs?.start_date ?? row.jobs?.job_date ?? null,
            start_time: timeOnlyFromTimestamp(row.start_at) ?? row.jobs?.start_time ?? null,
            end_time: timeOnlyFromTimestamp(row.end_at) ?? row.jobs?.end_time ?? null,
            source_type: normalisedAssetType === "crane" ? "owned" : null,
            supplier_id: null,
            supplier_reference: row.supplier_reference ?? null,
            supplier_cost: num(row.agreed_cost),
            agreed_sell_rate: 0,
            item_name: null,
            notes: row.notes ?? null,
            jobs: row.jobs,
            cranes: fallbackCrane ? [fallbackCrane] : row.cranes,
            operators: row.operators,
            suppliers: [],
          };
        }

        const resolvedCrane = resolveAllocationCrane(row);
        const assetType =
          looksLikeCraneAllocation({ ...row, crane_id: resolvedCrane.craneId, cranes: resolvedCrane.crane ? [resolvedCrane.crane] : row.cranes })
            ? "crane"
            : String(row?.asset_type ?? "").trim().toLowerCase() === "vehicle"
              ? "vehicle"
              : String(row?.asset_type ?? "").trim().toLowerCase() === "equipment"
                ? "equipment"
                : "other";

        return {
          ...row,
          allocation_source: "job_equipment",
          asset_type: assetType,
          crane_id: resolvedCrane.craneId,
          cranes: resolvedCrane.crane ? [resolvedCrane.crane] : row.cranes,
        };
      })
      .filter((row: any) => {
        const relatedJob = activeJobById.get(String(row.job_id)) ?? first(row.jobs) ?? null;
        if (!relatedJob) return false;
        if (Boolean(relatedJob?.archived)) return false;
        if (!isPlannerVisibleStatus(relatedJob?.status)) return false;
        return true;
      });

    const activeAllocations = normalisedAllocations.filter((row: any) => {
      const relatedJob = activeJobById.get(String(row.job_id)) ?? first(row.jobs) ?? null;
      if (!relatedJob) return false;

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

    const allocationRowBelongsToCrossHireJob = (row: any) => {
      if (looksLikeCrossHireCraneAllocation(row)) return true;

      // Do not turn operator/labour rows into cross-hire planner cards just because
      // the job has supplier/cost metadata. Only actual crane-like rows belong in
      // the cross-hire crane lane.
      if (!looksLikeCraneAllocation(row)) return false;

      return false;
    };

    const craneLikeAllocationRows = (rows: any[]) =>
      rows.filter((row: any) => looksLikeCraneAllocation(row) || allocationRowBelongsToCrossHireJob(row));

    const jobsWithActiveCraneAllocationRows = new Set(
      craneLikeAllocationRows(activeAllocations).map((row: any) => String(row.job_id))
    );

    const jobsWithPotentialCraneRows = new Set(
      normalisedAllocations
        .filter((row: any) => looksLikeCraneAllocation(row))
        .map((row: any) => String(row.job_id))
    );

    const jobsWithAnyCraneAllocationRows = new Set(
      craneLikeAllocationRows(normalisedAllocations).map((row: any) => String(row.job_id))
    );

    const jobsWithRealCraneAssignment = new Set<string>([
      ...Array.from(jobsWithAnyCraneAllocationRows),
      ...Array.from(jobsWithPotentialCraneRows),
      ...jobsInRange
        .filter((job: any) => String(job?.crane_id ?? "").trim())
        .map((job: any) => String(job.id)),
    ]);

    const firstOwnedCraneAllocationByJobId = new Map<string, any>();
    craneLikeAllocationRows(normalisedAllocations).forEach((row: any) => {
      if (allocationRowBelongsToCrossHireJob(row)) return;
      const jobId = String(row?.job_id ?? "").trim();
      const resolvedCrane = resolveAllocationCrane(row);
      const rowCraneId = String(row?.crane_id ?? resolvedCrane.craneId ?? first(row?.cranes)?.id ?? "").trim();
      if (!jobId || !rowCraneId) return;
      if (!firstOwnedCraneAllocationByJobId.has(jobId)) {
        firstOwnedCraneAllocationByJobId.set(jobId, row);
      }
    });

    const activeJobIds = Array.from(activeJobById.keys()).filter(Boolean);
    let linkedTransportJobs: any[] = [];

    if (activeJobIds.length > 0) {
      const linkedTransportRes = await supabase
        .from("transport_jobs")
        .select(`
          id,
          linked_job_id,
          transport_number,
          status,
          archived
        `)
        .in("linked_job_id", activeJobIds)
        .eq("archived", false);

      if (linkedTransportRes.error) {
        return NextResponse.json({ error: linkedTransportRes.error.message }, { status: 400 });
      }

      linkedTransportJobs = (linkedTransportRes.data ?? []).filter((row: any) =>
        isPlannerVisibleStatus(row?.status)
      );
    }

    const linkedTransportByJobId = new Map<string, any[]>();

    linkedTransportJobs.forEach((row: any) => {
      if (!row?.linked_job_id) return;
      const key = String(row.linked_job_id).trim();
      const existing = linkedTransportByJobId.get(key) ?? [];
      existing.push(row);
      linkedTransportByJobId.set(key, existing);
    });

    const getLinkedTransportMeta = (jobId: string | null | undefined) => {
      const rows = linkedTransportByJobId.get(String(jobId ?? "").trim()) ?? [];
      return {
        linked_transport_job_count: rows.length,
        linked_transport_numbers: rows
          .map((row: any) => String(row?.transport_number ?? "").trim())
          .filter(Boolean),
      };
    };

    const crossHireCraneAllocationRows = activeAllocations.filter((row: any) =>
      allocationRowBelongsToCrossHireJob(row)
    );
    const craneAllocationRows = activeAllocations.filter((row: any) => {
      if (looksLikeCrossHireCraneAllocation(row)) return false;
      return looksLikeCraneAllocation(row);
    });
    const labourAllocationRows = activeAllocations.filter((row: any) => {
      if (!looksLikeLabourAllocation(row)) return false;
      return !jobsWithRealCraneAssignment.has(String(row.job_id));
    });

    const allocationItems = craneAllocationRows.map((row: any) => {
      const job = activeJobById.get(String(row.job_id)) ?? first(row.jobs) ?? null;
      const operator = first(row.operators) ?? first(job?.operators) ?? operatorById.get(String(row.operator_id ?? job?.operator_id ?? "")) ?? null;
      const crane = first(row.cranes);
      const jobCrane = first(job?.cranes);
      const client = first(job?.clients);
      const liftPlan = liftPlanByJobId.get(String(row.job_id)) ?? null;

      const rowCraneId = String(row.crane_id ?? crane?.id ?? job?.crane_id ?? jobCrane?.id ?? "").trim() || null;
      const displayCrane = crane ?? jobCrane ?? (rowCraneId ? craneById.get(rowCraneId) ?? null : null);
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
        equipment: displayCrane ? [displayCrane] : [],
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
        lift_plan_status: plannerLiftPlanStatus(job, liftPlan),
      };
    });

    const crossHireItems = crossHireCraneAllocationRows.map((row: any) => {
      const job = activeJobById.get(String(row.job_id)) ?? first(row.jobs) ?? null;
      const operator = first(row.operators);
      const client = first(job?.clients);
      const supplier = first(row.suppliers);
      const primarySupplierLink = getPrimarySupplierLinkForJob(row.job_id);
      const supplierLinksCost = getSupplierCostTotalForJob(row.job_id);
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
        item_name:
          row.item_name ??
          primarySupplierLink?.service_description ??
          primarySupplierLink?.supplier_display_name ??
          supplier?.company_name ??
          "Cross-hired crane",
        clients: client ? [client] : [],
        operators: operator ? [operator] : [],
        equipment: [],
        agreed_sell_rate: num(row.agreed_sell_rate),
        supplier_id: row?.supplier_id ?? primarySupplierLink?.supplier_id ?? job?.supplier_id ?? null,
        supplier_reference: row?.supplier_reference ?? primarySupplierLink?.supplier_reference ?? null,
        supplier_cost: num(row.supplier_cost) || supplierLinksCost || num(job?.cross_hire_cost_total),
        price_mode: job?.price_mode ?? "full_job",
        price_per_day: num(job?.price_per_day),
        job_price: effectiveJobPrice(job),
        exclude_weekends: excludeWeekends,
        working_dates: activeWorkingDates(dateBounds.start, dateBounds.end, excludeWeekends),
        billable_days: countBillableDays(dateBounds.start, dateBounds.end, excludeWeekends),
        notes: row.notes ?? primarySupplierLink?.notes ?? job?.notes ?? null,
        linked_transport_job_count: linkedTransportMeta.linked_transport_job_count,
        linked_transport_numbers: linkedTransportMeta.linked_transport_numbers,
        planner_group: "cross_hired",
        lift_plan_status: plannerLiftPlanStatus(job, liftPlan),
      };
    });

    const labourOnlyItems = labourAllocationRows.map((row: any) => {
      const job = activeJobById.get(String(row.job_id)) ?? first(row.jobs) ?? null;
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
        lift_plan_status: plannerLiftPlanStatus(job, liftPlan),
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
      const isCrossHiredDirect = jobHasCrossHireMeta(jobId, job);
      const primarySupplierLink = getPrimarySupplierLinkForJob(jobId);
      const supplierLinksCost = getSupplierCostTotalForJob(jobId);
      const liftPlan = liftPlanByJobId.get(String(job.id)) ?? null;
      const fallbackCraneAllocation = firstOwnedCraneAllocationByJobId.get(jobId) ?? null;
      const fallbackCrane = first(fallbackCraneAllocation?.cranes) ??
        craneById.get(String(fallbackCraneAllocation?.crane_id ?? "")) ??
        null;
      const fallbackCraneId = String(fallbackCraneAllocation?.crane_id ?? fallbackCrane?.id ?? "").trim();
      const effectiveCraneId = mainCraneId || fallbackCraneId;
      const effectiveCrane = crane ?? fallbackCrane ?? (effectiveCraneId ? craneById.get(effectiveCraneId) ?? null : null);
      const effectiveOperator = operator ?? first(fallbackCraneAllocation?.operators) ?? null;

      if (effectiveCraneId) {
        // If this job has explicit crane allocation rows in the visible week, use those
        // rows so day-specific crane changes show correctly. If the explicit rows are
        // outside the visible week, keep/fall back to an assigned crane card so jobs do
        // not appear as unallocated or disappear from the current planner view.
        if (jobsWithActiveCraneAllocationRows.has(jobId)) {
          return [];
        }

        return [
          {
            id: `job_${job.id}_${effectiveCraneId}`,
            allocation_id: null,
            allocation_source: null,
            job_id: job.id,
            job_number: job.job_number ?? null,
            job_date: dateBounds.start || null,
            start_date: dateBounds.start || null,
            end_date: dateBounds.end || null,
            start_time: job.start_time ?? fallbackCraneAllocation?.start_time ?? null,
            end_time: job.end_time ?? fallbackCraneAllocation?.end_time ?? null,
            status: job.status ?? null,
            site_name: job.site_name ?? null,
            site_address: job.site_address ?? null,
            operator_id: job.operator_id ?? fallbackCraneAllocation?.operator_id ?? null,
            equipment_id: effectiveCraneId,
            item_name: fallbackCraneAllocation?.item_name ?? null,
            clients: client ? [client] : [],
            operators: effectiveOperator ? [effectiveOperator] : [],
            equipment: effectiveCrane ? [effectiveCrane] : [],
            agreed_sell_rate: num(fallbackCraneAllocation?.agreed_sell_rate),
            supplier_cost: num(fallbackCraneAllocation?.supplier_cost),
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
            lift_plan_status: plannerLiftPlanStatus(job, liftPlan),
          },
        ];
      }

      // If a job has explicit crane/cross-hire allocations anywhere but none could be
      // resolved to an owned crane, do not also show the full job span as unassigned.
      // Cross-hire allocation rows will appear in the cross-hire section instead.
      if (jobsWithAnyCraneAllocationRows.has(jobId) || jobsWithPotentialCraneRows.has(jobId)) {
        return [];
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
          item_name:
            plannerGroup === "labour_only"
              ? "Labour / Other"
              : plannerGroup === "cross_hired"
                ? primarySupplierLink?.service_description ?? primarySupplierLink?.supplier_display_name ?? "Cross-hired crane"
                : null,
          clients: client ? [client] : [],
          operators: operator ? [operator] : [],
          equipment: [],
          agreed_sell_rate: 0,
          supplier_cost: supplierLinksCost || num(job.cross_hire_cost_total),
          supplier_id: primarySupplierLink?.supplier_id ?? job.supplier_id ?? null,
          supplier_reference: primarySupplierLink?.supplier_reference ?? null,
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
          lift_plan_status: plannerLiftPlanStatus(job, liftPlan),
        },
      ];
    });

    const items = [...allocationItems, ...crossHireItems, ...labourOnlyItems, ...directJobItems].map((item: any) => ({
      ...item,
      visit_invoices: getVisitInvoicesForJob(item.job_id),
    }));

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
