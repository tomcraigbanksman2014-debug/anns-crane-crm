import { NextResponse } from "next/server";
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
  totalKey: string,
  rangeStart: string,
  rangeEnd: string
) {
  return rows.reduce((sum, row) => {
    if (!overlapsDateRange(row[startKey], row[endKey] ?? row[startKey], rangeStart, rangeEnd)) {
      return sum;
    }
    return sum + num(row[totalKey]);
  }, 0);
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const now = new Date();
    const today = isoDate(now);
    const next30Days = isoDate(addDays(now, 30));

    const [
      bookingsRes,
      jobsRes,
      transportJobsRes,
      cranesRes,
      vehiclesRes,
      equipmentRes,
      recentAuditRes,
      purchaseOrdersRes,
    ] = await Promise.all([
      supabase
        .from("bookings")
        .select(`
          id,
          start_date,
          end_date,
          start_at,
          status,
          location,
          invoice_status,
          total_invoice,
          payment_received,
          clients:client_id (
            company_name
          ),
          equipment:equipment_id (
            name
          )
        `),

      supabase
        .from("jobs")
        .select(`
          *,
          clients:client_id (
            company_name
          )
        `),

      supabase
        .from("transport_jobs")
        .select(`
          *
        `),

      supabase
        .from("cranes")
        .select("id, archived"),

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
        .select("id, order_date, required_date, total_cost, status"),
    ]);

    if (bookingsRes.error) {
      return NextResponse.json({ error: bookingsRes.error.message }, { status: 400 });
    }
    if (jobsRes.error) {
      return NextResponse.json({ error: jobsRes.error.message }, { status: 400 });
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

    // Optional table: do not break dashboard if missing
    const serviceLogRes = await supabase
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
      .limit(20);

    const recentServiceLog = serviceLogRes.error ? [] : serviceLogRes.data ?? [];

    const bookings = bookingsRes.data ?? [];
    const jobs = jobsRes.data ?? [];
    const transportJobs = transportJobsRes.data ?? [];
    const cranes = cranesRes.data ?? [];
    const vehicles = vehiclesRes.data ?? [];
    const equipment = equipmentRes.data ?? [];
    const recentAudit = recentAuditRes.data ?? [];
    const purchaseOrders = purchaseOrdersRes.data ?? [];

    const activeBookings = bookings.filter((b: any) => lower(b.status) !== "cancelled");
    const activeJobs = jobs.filter((j: any) => !j.archived && lower(j.status) !== "cancelled");
    const activeTransportJobs = transportJobs.filter(
      (j: any) => !j.archived && lower(j.status) !== "cancelled"
    );

    const activeCranes = cranes.filter((c: any) => !c.archived);
    const activeVehicles = vehicles.filter((v: any) => !v.archived);
    const activeEquipment = equipment.filter((e: any) => !e.archived);

    const bookingsTodayRows = activeBookings.filter((b: any) =>
      overlapsDateRange(b.start_date, b.end_date ?? b.start_date, today, today)
    );

    const activeHiresRows = activeBookings.filter((b: any) =>
      overlapsDateRange(b.start_date, b.end_date ?? b.start_date, today, today)
    );

    const todayJobs = bookingsTodayRows
      .sort((a: any, b: any) =>
        String(a.start_at ?? a.start_date ?? "").localeCompare(
          String(b.start_at ?? b.start_date ?? "")
        )
      )
      .slice(0, 12);

    const upcomingBookings = activeBookings
      .filter((b: any) => {
        const start = String(b.start_date ?? "");
        return !!start && start > today;
      })
      .sort((a: any, b: any) =>
        String(a.start_at ?? a.start_date ?? "").localeCompare(
          String(b.start_at ?? b.start_date ?? "")
        )
      )
      .slice(0, 12);

    const overdueInvoices = activeBookings
      .filter((b: any) => {
        const total = num(b.total_invoice);
        const paid = num(b.payment_received);
        return total > paid && lower(b.invoice_status) !== "paid";
      })
      .sort((a: any, b: any) =>
        String(a.start_at ?? a.start_date ?? "").localeCompare(
          String(b.start_at ?? b.start_date ?? "")
        )
      )
      .slice(0, 12)
      .map((b: any) => ({
        ...b,
        href: `/bookings/${b.id}`,
      }));

    const totalCranes = activeCranes.length;
    const totalVehicles = activeVehicles.length;
    const totalEquipment = activeEquipment.length;

    const onHireEquipment = activeJobs.filter((j: any) =>
      overlapsDateRange(j.start_date ?? j.job_date, j.end_date ?? j.job_date, today, today)
    ).length;

    const reservedCranesLater = activeJobs.filter((j: any) => {
      const start = String(j.start_date ?? j.job_date ?? "");
      return !!start && start > today && start <= next30Days;
    }).length;

    const vehiclesOnWorkToday = activeTransportJobs.filter((j: any) =>
      overlapsDateRange(j.transport_date, j.delivery_date ?? j.transport_date, today, today)
    ).length;

    const availableCranesNow = Math.max(totalCranes - onHireEquipment, 0);
    const availableVehiclesNow = Math.max(totalVehicles - vehiclesOnWorkToday, 0);

    const outstandingBookingInvoices = activeBookings.reduce((sum: number, b: any) => {
      const total = num(b.total_invoice);
      const paid = num(b.payment_received);
      return sum + Math.max(total - paid, 0);
    }, 0);

    const outstandingJobInvoices = activeJobs.reduce((sum: number, j: any) => {
      const total = num(j.total_invoice);
      const paid = num(j.amount_paid);
      return sum + Math.max(total - paid, 0);
    }, 0);

    const outstandingTransportInvoices = activeTransportJobs.reduce((sum: number, j: any) => {
      const total = num(j.total_invoice);
      const paid = num(j.amount_paid);
      return sum + Math.max(total - paid, 0);
    }, 0);

    const outstandingInvoices =
      outstandingBookingInvoices + outstandingJobInvoices + outstandingTransportInvoices;

    const utilisationPct =
      totalCranes > 0 ? Math.round((onHireEquipment / totalCranes) * 100) : 0;

    const certExpired = activeEquipment.filter((e: any) => {
      const d = String(e.certification_expires_on ?? "");
      return !!d && d < today;
    }).length;

    const certExpiringSoon = activeEquipment.filter((e: any) => {
      const d = String(e.certification_expires_on ?? "");
      return !!d && d >= today && d <= next30Days;
    }).length;

    const lolerOverdue = activeEquipment.filter((e: any) => {
      const d = String(e.loler_due_on ?? "");
      return !!d && d < today;
    }).length;

    const lolerDueSoon = activeEquipment.filter((e: any) => {
      const d = String(e.loler_due_on ?? "");
      return !!d && d >= today && d <= next30Days;
    }).length;

    const maintenanceEquipment = activeEquipment.filter((e: any) => {
      const status = lower(e.status);
      return status === "maintenance" || status === "repair" || status === "workshop";
    }).length;

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

    const unassignedTransportJobs = activeTransportJobs.filter(
      (j: any) => !j.vehicle_id || !j.operator_id
    ).length;

    const completedCraneJobsNotInvoiced = activeJobs.filter((j: any) => {
      return lower(j.status) === "completed" && lower(j.invoice_status || "Not Invoiced") === "not invoiced";
    }).length;

    const completedTransportJobsNotInvoiced = activeTransportJobs.filter((j: any) => {
      return lower(j.status) === "completed" && lower(j.invoice_status || "Not Invoiced") === "not invoiced";
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
      lastWeek: sumRangeTotal(activeJobs, "start_date", "end_date", "price", weekRanges.lastWeek.start, weekRanges.lastWeek.end),
      thisWeek: sumRangeTotal(activeJobs, "start_date", "end_date", "price", weekRanges.thisWeek.start, weekRanges.thisWeek.end),
      nextWeek: sumRangeTotal(activeJobs, "start_date", "end_date", "price", weekRanges.nextWeek.start, weekRanges.nextWeek.end),
    };

    const activePurchaseOrders = purchaseOrders.filter((po: any) => lower(po.status) !== "cancelled");

    const weeklyPurchaseOrderCosts = {
      lastWeek: sumRangeTotal(activePurchaseOrders, "order_date", "required_date", "total_cost", weekRanges.lastWeek.start, weekRanges.lastWeek.end),
      thisWeek: sumRangeTotal(activePurchaseOrders, "order_date", "required_date", "total_cost", weekRanges.thisWeek.start, weekRanges.thisWeek.end),
      nextWeek: sumRangeTotal(activePurchaseOrders, "order_date", "required_date", "total_cost", weekRanges.nextWeek.start, weekRanges.nextWeek.end),
    };

    const timesheetsNotSubmitted = activeJobs.filter((j: any) => {
      return lower(j.status) === "completed" && !j.submitted_to_office_at;
    }).length;

    return NextResponse.json({
      bookingsToday: bookingsTodayRows.length,
      activeHires: activeHiresRows.length,
      availableEquipment: Math.max(totalEquipment - activeHiresRows.length, 0),
      totalEquipment,
      totalCranes,
      totalVehicles,
      availableCranesNow,
      reservedCranesLater,
      availableVehiclesNow,
      outstandingInvoices,
      utilisationPct,
      onHireEquipment,
      reservedEquipment: 0,
      certExpiringSoon,
      certExpired,
      maintenanceEquipment,
      equipmentWithServiceHistory,
      equipmentWithoutServiceHistory,
      lolerDueSoon,
      lolerOverdue,
      unassignedTransportJobs,
      completedCraneJobsNotInvoiced,
      completedTransportJobsNotInvoiced,
      timesheetsNotSubmitted,
      weeklyIncomingJobs,
      weeklyPurchaseOrderCosts,
      upcomingBookings,
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
