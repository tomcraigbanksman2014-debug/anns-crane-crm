import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function num(value: any) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function lower(value: any) {
  return String(value ?? "").trim().toLowerCase();
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function mondayOf(base: Date) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function overlapsDateRange(
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

function sumRangeTotal(
  rows: any[],
  startKey: string,
  endKey: string,
  valueGetter: (row: any) => number,
  rangeStart: string,
  rangeEnd: string
) {
  return rows.reduce((sum, row) => {
    if (!overlapsDateRange(row[startKey], row[endKey] ?? row[startKey], rangeStart, rangeEnd)) {
      return sum;
    }
    return sum + valueGetter(row);
  }, 0);
}

function makeJobValueMap(jobEquipment: any[]) {
  const totals = new Map<string, number>();

  for (const row of jobEquipment ?? []) {
    const jobId = String(row?.job_id ?? "").trim();
    if (!jobId) continue;

    const sell =
      num(row?.agreed_sell_rate) > 0
        ? num(row?.agreed_sell_rate)
        : num(row?.agreed_cost);

    totals.set(jobId, (totals.get(jobId) ?? 0) + sell);
  }

  return totals;
}

function jobIncomingValue(row: any, jobValueMap: Map<string, number>) {
  const invoiceValue = Math.max(
    num(row?.invoice_total),
    num(row?.total_invoice),
    num(row?.invoice_subtotal),
    num(row?.invoice_amount)
  );

  if (invoiceValue > 0) return invoiceValue;

  return jobValueMap.get(String(row?.id ?? "")) ?? 0;
}

function purchaseOrderValue(row: any) {
  return num(row?.total_cost);
}

export async function GET() {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const now = new Date();
    const today = isoDate(now);
    const next30Days = isoDate(addDays(now, 30));

    const [
      jobsRes,
      jobEquipmentRes,
      jobAllocationsRes,
      transportJobsRes,
      cranesRes,
      vehiclesRes,
      equipmentRes,
      recentAuditRes,
      purchaseOrdersRes,
      recentServiceLogRes,
    ] = await Promise.all([
      supabase
        .from("jobs")
        .select(`
          id,
          job_number,
          client_id,
          site_name,
          site_address,
          job_date,
          start_date,
          end_date,
          start_time,
          end_time,
          status,
          invoice_status,
          total_invoice,
          invoice_total,
          invoice_subtotal,
          invoice_amount,
          amount_paid,
          equipment_id,
          operator_id,
          main_operator_id,
          archived,
          clients:client_id (
            company_name
          )
        `),

      supabase
        .from("job_equipment")
        .select(`
          id,
          job_id,
          agreed_sell_rate,
          agreed_cost
        `),

      supabase
        .from("job_allocations")
        .select("id, job_id, crane_id, equipment_id, operator_id"),

      supabase
        .from("transport_jobs")
        .select(`
          id,
          transport_number,
          client_id,
          collection_address,
          delivery_address,
          transport_date,
          delivery_date,
          collection_time,
          delivery_time,
          status,
          invoice_status,
          total_invoice,
          amount_paid,
          vehicle_id,
          operator_id,
          archived,
          clients:client_id (
            company_name
          )
        `),

      supabase
        .from("cranes")
        .select(`
          id,
          archived,
          status,
          loler_due_on,
          inspection_due_on
        `),

      supabase
        .from("vehicles")
        .select("id, archived"),

      supabase
        .from("equipment")
        .select(`
          id,
          archived,
          status,
          certification_expires_on,
          loler_due_on
        `),

      supabase
        .from("audit_log")
        .select(`
          id,
          actor_username,
          action,
          entity_type,
          created_at
        `)
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("purchase_orders")
        .select(`
          id,
          order_date,
          required_date,
          total_cost,
          status
        `),

      supabase
        .from("equipment_service_log")
        .select(`
          id,
          equipment_id,
          entry_type,
          service_date,
          engineer,
          notes,
          created_at,
          equipment:equipment_id (
            name
          )
        `)
        .order("service_date", { ascending: false })
        .limit(20),
    ]);

    if (jobsRes.error) {
      return NextResponse.json({ error: jobsRes.error.message }, { status: 400 });
    }
    if (jobEquipmentRes.error) {
      return NextResponse.json({ error: jobEquipmentRes.error.message }, { status: 400 });
    }
    if (jobAllocationsRes.error) {
      return NextResponse.json({ error: jobAllocationsRes.error.message }, { status: 400 });
    }
    if (transportJobsRes.error) {
      return NextResponse.json({ error: transportJobsRes.error.message }, { status: 400 });
    }
    if (cranesRes.error) {
      return NextResponse.json({ error: cranesRes.error.message }, { status: 400 });
    }
    if (vehiclesRes.error) {
      return NextResponse.json({ error: vehiclesRes.error.message }, { status: 400 });
    }
    if (equipmentRes.error) {
      return NextResponse.json({ error: equipmentRes.error.message }, { status: 400 });
    }
    if (recentAuditRes.error) {
      return NextResponse.json({ error: recentAuditRes.error.message }, { status: 400 });
    }
    if (purchaseOrdersRes.error) {
      return NextResponse.json({ error: purchaseOrdersRes.error.message }, { status: 400 });
    }

    const jobs = jobsRes.data ?? [];
    const jobEquipment = jobEquipmentRes.data ?? [];
    const jobAllocations = jobAllocationsRes.data ?? [];
    const transportJobs = transportJobsRes.data ?? [];
    const cranes = cranesRes.data ?? [];
    const vehicles = vehiclesRes.data ?? [];
    const equipment = equipmentRes.data ?? [];
    const recentAudit = recentAuditRes.data ?? [];
    const purchaseOrders = purchaseOrdersRes.data ?? [];
    const recentServiceLog = recentServiceLogRes.error ? [] : recentServiceLogRes.data ?? [];

    const jobValueMap = makeJobValueMap(jobEquipment);

    const activeJobs = jobs.filter((j: any) => !j.archived && lower(j.status) !== "cancelled");
    const activeTransportJobs = transportJobs.filter(
      (j: any) => !j.archived && lower(j.status) !== "cancelled"
    );

    const activeCranes = cranes.filter((c: any) => !c.archived);
    const activeVehicles = vehicles.filter((v: any) => !v.archived);
    const activeEquipment = equipment.filter((e: any) => !e.archived);

    const craneJobsTodayRows = activeJobs.filter((j: any) =>
      overlapsDateRange(j.start_date ?? j.job_date, j.end_date ?? j.job_date, today, today)
    );

    const transportJobsTodayRows = activeTransportJobs.filter((j: any) =>
      overlapsDateRange(j.transport_date, j.delivery_date ?? j.transport_date, today, today)
    );

    const todayJobs = [
      ...craneJobsTodayRows.map((j: any) => ({
        id: `job-${j.id}`,
        href: `/jobs/${j.id}`,
        title: `Job #${j.job_number ?? "—"}`,
        subtitle: `${j.clients?.company_name ?? "Customer"} • ${j.site_name ?? j.site_address ?? "No site"}`,
        time: j.start_time ?? "—",
        status: j.status ?? "—",
      })),
      ...transportJobsTodayRows.map((j: any) => ({
        id: `transport-${j.id}`,
        href: `/transport-jobs/${j.id}`,
        title: `${j.transport_number ?? "Transport job"}`,
        subtitle: `${j.clients?.company_name ?? "Customer"} • ${j.delivery_address ?? j.collection_address ?? "No address"}`,
        time: j.collection_time ?? "—",
        status: j.status ?? "—",
      })),
    ].slice(0, 12);

    const upcomingJobs = [
      ...activeJobs
        .filter((j: any) => String(j.start_date ?? j.job_date ?? "") > today)
        .map((j: any) => ({
          id: `job-${j.id}`,
          recordType: "crane",
          recordId: j.id,
          href: `/jobs/${j.id}`,
          title: `Job #${j.job_number ?? "—"}`,
          subtitle: `${j.clients?.company_name ?? "Customer"} • ${j.site_name ?? j.site_address ?? "No site"}`,
          when: String(j.start_date ?? j.job_date ?? ""),
          status: j.status ?? "—",
        })),
      ...activeTransportJobs
        .filter((j: any) => String(j.transport_date ?? "") > today)
        .map((j: any) => ({
          id: `transport-${j.id}`,
          recordType: "transport",
          recordId: j.id,
          href: `/transport-jobs/${j.id}`,
          title: `${j.transport_number ?? "Transport job"}`,
          subtitle: `${j.clients?.company_name ?? "Customer"} • ${j.delivery_address ?? j.collection_address ?? "No address"}`,
          when: String(j.transport_date ?? ""),
          status: j.status ?? "—",
        })),
    ]
      .sort((a, b) => a.when.localeCompare(b.when))
      .slice(0, 12);

    const overdueInvoices = [
      ...activeJobs
        .filter((j: any) => {
          const total = Math.max(
            num(j.total_invoice),
            num(j.invoice_total),
            num(j.invoice_amount),
            num(j.invoice_subtotal),
            jobValueMap.get(String(j.id)) ?? 0
          );
          const paid = num(j.amount_paid);
          return total > paid && lower(j.invoice_status) !== "paid";
        })
        .map((j: any) => ({
          id: `job-${j.id}`,
          recordType: "crane",
          recordId: j.id,
          href: `/jobs/${j.id}`,
          title: `Job #${j.job_number ?? "—"}`,
          subtitle: j.clients?.company_name ?? "Customer",
          invoice_status: j.invoice_status ?? "—",
          status: j.status ?? "—",
          amountPaid: num(j.amount_paid),
          amount:
            Math.max(
              num(j.total_invoice),
              num(j.invoice_total),
              num(j.invoice_amount),
              num(j.invoice_subtotal),
              jobValueMap.get(String(j.id)) ?? 0
            ) - num(j.amount_paid),
        })),
      ...activeTransportJobs
        .filter((j: any) => {
          const total = num(j.total_invoice);
          const paid = num(j.amount_paid);
          return total > paid && lower(j.invoice_status) !== "paid";
        })
        .map((j: any) => ({
          id: `transport-${j.id}`,
          recordType: "transport",
          recordId: j.id,
          href: `/transport-jobs/${j.id}`,
          title: `${j.transport_number ?? "Transport job"}`,
          subtitle: j.clients?.company_name ?? "Customer",
          invoice_status: j.invoice_status ?? "—",
          status: j.status ?? "—",
          amountPaid: num(j.amount_paid),
          amount: num(j.total_invoice) - num(j.amount_paid),
        })),
    ]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12);

    const totalCranes = activeCranes.length;
    const totalVehicles = activeVehicles.length;
    const totalEquipment = activeEquipment.length;

    const cranesOnHireNow = craneJobsTodayRows.length;
    const cranesReservedLater = activeJobs.filter((j: any) => {
      const start = String(j.start_date ?? j.job_date ?? "");
      return !!start && start > today && start <= next30Days;
    }).length;

    const vehiclesOnWorkToday = transportJobsTodayRows.length;

    const availableCranesNow = Math.max(totalCranes - cranesOnHireNow, 0);
    const availableVehiclesNow = Math.max(totalVehicles - vehiclesOnWorkToday, 0);

    const outstandingJobInvoices = activeJobs.reduce((sum: number, j: any) => {
      const total = Math.max(
        num(j.total_invoice),
        num(j.invoice_total),
        num(j.invoice_amount),
        num(j.invoice_subtotal),
        jobValueMap.get(String(j.id)) ?? 0
      );
      const paid = num(j.amount_paid);
      return sum + Math.max(total - paid, 0);
    }, 0);

    const outstandingTransportInvoices = activeTransportJobs.reduce((sum: number, j: any) => {
      const total = num(j.total_invoice);
      const paid = num(j.amount_paid);
      return sum + Math.max(total - paid, 0);
    }, 0);

    const outstandingInvoices = outstandingJobInvoices + outstandingTransportInvoices;

    const utilisationPct =
      totalCranes > 0 ? Math.round((cranesOnHireNow / totalCranes) * 100) : 0;

    const certExpiredEquipment = activeEquipment.filter((e: any) => {
      const d = String(e.certification_expires_on ?? "");
      return !!d && d < today;
    }).length;

    const certExpiringSoonEquipment = activeEquipment.filter((e: any) => {
      const d = String(e.certification_expires_on ?? "");
      return !!d && d >= today && d <= next30Days;
    }).length;

    const certExpiredCranes = activeCranes.filter((c: any) => {
      const d = String(c.inspection_due_on ?? "");
      return !!d && d < today;
    }).length;

    const certExpiringSoonCranes = activeCranes.filter((c: any) => {
      const d = String(c.inspection_due_on ?? "");
      return !!d && d >= today && d <= next30Days;
    }).length;

    const certExpired = certExpiredEquipment + certExpiredCranes;
    const certExpiringSoon = certExpiringSoonEquipment + certExpiringSoonCranes;

    const lolerOverdueEquipment = activeEquipment.filter((e: any) => {
      const d = String(e.loler_due_on ?? "");
      return !!d && d < today;
    }).length;

    const lolerDueSoonEquipment = activeEquipment.filter((e: any) => {
      const d = String(e.loler_due_on ?? "");
      return !!d && d >= today && d <= next30Days;
    }).length;

    const lolerOverdueCranes = activeCranes.filter((c: any) => {
      const d = String(c.loler_due_on ?? "");
      return !!d && d < today;
    }).length;

    const lolerDueSoonCranes = activeCranes.filter((c: any) => {
      const d = String(c.loler_due_on ?? "");
      return !!d && d >= today && d <= next30Days;
    }).length;

    const lolerOverdue = lolerOverdueEquipment + lolerOverdueCranes;
    const lolerDueSoon = lolerDueSoonEquipment + lolerDueSoonCranes;

    const maintenanceEquipment = activeEquipment.filter((e: any) => {
      const status = lower(e.status);
      return status === "maintenance" || status === "repair" || status === "workshop";
    }).length;

    const maintenanceCranes = activeCranes.filter((c: any) => {
      const status = lower(c.status);
      return status === "maintenance" || status === "repair" || status === "workshop";
    }).length;

    const maintenanceCount = maintenanceEquipment + maintenanceCranes;

    const serviceHistoryIds = new Set(
      recentServiceLog
        .map((row: any) => String(row.equipment_id ?? ""))
        .filter(Boolean)
    );

    const equipmentWithServiceHistory = activeEquipment.filter((e: any) =>
      serviceHistoryIds.has(String(e.id))
    ).length;

    const equipmentWithoutServiceHistory = Math.max(
      totalEquipment - equipmentWithServiceHistory,
      0
    );

    const allocationMap = new Map<string, { hasCrane: boolean; hasOperator: boolean }>();
    (jobAllocations ?? []).forEach((row: any) => {
      const jobId = String(row?.job_id ?? "").trim();
      if (!jobId) return;
      const current = allocationMap.get(jobId) ?? { hasCrane: false, hasOperator: false };
      if (row?.crane_id || row?.equipment_id) current.hasCrane = true;
      if (row?.operator_id) current.hasOperator = true;
      allocationMap.set(jobId, current);
    });

    const unassignedCraneJobs = activeJobs.filter((j: any) => {
      const allocationsForJob = allocationMap.get(String(j.id));
      const hasCrane = !!j.equipment_id || !!allocationsForJob?.hasCrane;
      const hasOperator = !!j.operator_id || !!j.main_operator_id || !!allocationsForJob?.hasOperator;
      return !hasCrane || !hasOperator;
    }).length;

    const unassignedTransportJobs = activeTransportJobs.filter(
      (j: any) => !j.vehicle_id || !j.operator_id
    ).length;

    const completedCraneJobsNotInvoiced = activeJobs.filter((j: any) => {
      return lower(j.status) === "completed" && lower(j.invoice_status || "not invoiced") === "not invoiced";
    }).length;

    const completedTransportJobsNotInvoiced = activeTransportJobs.filter((j: any) => {
      return lower(j.status) === "completed" && lower(j.invoice_status || "not invoiced") === "not invoiced";
    }).length;

    const currentWeekStart = mondayOf(now);
    const lastWeekStart = addDays(currentWeekStart, -7);
    const nextWeekStart = addDays(currentWeekStart, 7);

    const weekRanges = {
      lastWeek: { start: isoDate(lastWeekStart), end: isoDate(addDays(lastWeekStart, 6)) },
      thisWeek: { start: isoDate(currentWeekStart), end: isoDate(addDays(currentWeekStart, 6)) },
      nextWeek: { start: isoDate(nextWeekStart), end: isoDate(addDays(nextWeekStart, 6)) },
    };

    const weeklyIncomingJobs = {
      lastWeek: sumRangeTotal(
        activeJobs,
        "start_date",
        "end_date",
        (row) => jobIncomingValue(row, jobValueMap),
        weekRanges.lastWeek.start,
        weekRanges.lastWeek.end
      ),
      thisWeek: sumRangeTotal(
        activeJobs,
        "start_date",
        "end_date",
        (row) => jobIncomingValue(row, jobValueMap),
        weekRanges.thisWeek.start,
        weekRanges.thisWeek.end
      ),
      nextWeek: sumRangeTotal(
        activeJobs,
        "start_date",
        "end_date",
        (row) => jobIncomingValue(row, jobValueMap),
        weekRanges.nextWeek.start,
        weekRanges.nextWeek.end
      ),
    };

    const activePurchaseOrders = purchaseOrders.filter((po: any) => lower(po.status) !== "cancelled");

    const weeklyPurchaseOrderCosts = {
      lastWeek: sumRangeTotal(
        activePurchaseOrders,
        "order_date",
        "required_date",
        purchaseOrderValue,
        weekRanges.lastWeek.start,
        weekRanges.lastWeek.end
      ),
      thisWeek: sumRangeTotal(
        activePurchaseOrders,
        "order_date",
        "required_date",
        purchaseOrderValue,
        weekRanges.thisWeek.start,
        weekRanges.thisWeek.end
      ),
      nextWeek: sumRangeTotal(
        activePurchaseOrders,
        "order_date",
        "required_date",
        purchaseOrderValue,
        weekRanges.nextWeek.start,
        weekRanges.nextWeek.end
      ),
    };

    return NextResponse.json({
      jobsToday: todayJobs.length,
      activeCraneJobs: craneJobsTodayRows.length,
      activeTransportToday: transportJobsTodayRows.length,
      totalEquipment,
      totalCranes,
      totalVehicles,
      availableCranesNow,
      reservedCranesLater: cranesReservedLater,
      availableVehiclesNow,
      outstandingInvoices,
      utilisationPct,
      cranesOnHireNow,
      certExpiringSoon,
      certExpired,
      maintenanceEquipment: maintenanceCount,
      equipmentWithServiceHistory,
      equipmentWithoutServiceHistory,
      lolerDueSoon,
      lolerOverdue,
      unassignedCraneJobs,
      unassignedTransportJobs,
      completedCraneJobsNotInvoiced,
      completedTransportJobsNotInvoiced,
      weeklyIncomingJobs,
      weeklyPurchaseOrderCosts,
      upcomingJobs,
      overdueInvoices,
      recentAudit,
      todayJobs,
      recentServiceLog,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load dashboard stats." },
      { status: 400 }
    );
  }
}
