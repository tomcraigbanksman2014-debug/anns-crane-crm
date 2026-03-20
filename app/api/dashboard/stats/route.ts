import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function plusDaysDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function outstandingAmount(total: any, paid: any) {
  const totalNumber = Number(total ?? 0);
  const paidNumber = Number(paid ?? 0);

  const safeTotal = Number.isFinite(totalNumber) ? totalNumber : 0;
  const safePaid = Number.isFinite(paidNumber) ? paidNumber : 0;

  return Math.max(safeTotal - safePaid, 0);
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const today = isoDate();
  const in30Days = plusDaysDate(30);

  const [
    jobsToday,
    activeJobs,
    cranesAll,
    vehiclesAll,
    unpaidJobs,
    unpaidTransport,
    upcomingTimedJobs,
    upcomingDatedJobs,
    overdueJobInvoices,
    overdueTransportInvoices,
    recentAudit,
    todayJobs,
    certExpiringSoon,
    certExpired,
    maintenanceEquipment,
    serviceLogAll,
    recentServiceLog,
    lolerDueSoon,
    lolerOverdue,
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("job_date", today)
      .neq("status", "cancelled"),

    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .lte("job_date", today)
      .gte("job_date", today)
      .in("status", ["planned", "confirmed", "in_progress"]),

    supabase
      .from("cranes")
      .select("id,status,archived", { count: "exact" })
      .eq("archived", false),

    supabase
      .from("vehicles")
      .select("id,status,archived", { count: "exact" })
      .eq("archived", false),

    supabase
      .from("jobs")
      .select("total_invoice, amount_paid, invoice_status")
      .in("invoice_status", ["Not Invoiced", "Invoiced", "Part Paid"]),

    supabase
      .from("transport_jobs")
      .select("total_invoice, agreed_sell_rate, price, amount_paid, invoice_status")
      .in("invoice_status", ["Not Invoiced", "Invoiced", "Part Paid"]),

    supabase
      .from("jobs")
      .select(`
        id,
        job_date,
        start_time,
        site_name,
        status,
        clients:client_id ( company_name )
      `)
      .gte("job_date", today)
      .lte("job_date", plusDaysDate(7))
      .neq("status", "cancelled")
      .order("job_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(10),

    supabase
      .from("transport_jobs")
      .select(`
        id,
        transport_date,
        collection_time,
        collection_address,
        delivery_address,
        status,
        clients:client_id ( company_name )
      `)
      .gte("transport_date", today)
      .lte("transport_date", plusDaysDate(7))
      .neq("status", "cancelled")
      .order("transport_date", { ascending: true })
      .order("collection_time", { ascending: true })
      .limit(10),

    supabase
      .from("jobs")
      .select(`
        id,
        total_invoice,
        amount_paid,
        invoice_status,
        job_date,
        clients:client_id ( company_name )
      `)
      .in("invoice_status", ["Not Invoiced", "Invoiced", "Part Paid"])
      .lt("job_date", today)
      .order("job_date", { ascending: true })
      .limit(10),

    supabase
      .from("transport_jobs")
      .select(`
        id,
        total_invoice,
        agreed_sell_rate,
        price,
        amount_paid,
        invoice_status,
        transport_date,
        clients:client_id ( company_name )
      `)
      .in("invoice_status", ["Not Invoiced", "Invoiced", "Part Paid"])
      .lt("transport_date", today)
      .order("transport_date", { ascending: true })
      .limit(10),

    supabase
      .from("audit_log")
      .select("id, actor_username, action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(8),

    supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        job_date,
        start_time,
        site_name,
        status,
        clients:client_id ( company_name )
      `)
      .eq("job_date", today)
      .neq("status", "cancelled")
      .order("start_time", { ascending: true })
      .limit(10),

    supabase
      .from("equipment")
      .select("id")
      .gte("certification_expires_on", today)
      .lte("certification_expires_on", in30Days),

    supabase
      .from("equipment")
      .select("id")
      .lt("certification_expires_on", today),

    supabase
      .from("equipment")
      .select("id", { count: "exact", head: true })
      .eq("status", "maintenance"),

    supabase
      .from("equipment_service_log")
      .select("id, equipment_id"),

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
        equipment:equipment_id ( name )
      `)
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),

    supabase
      .from("equipment")
      .select("id")
      .gte("loler_due_on", today)
      .lte("loler_due_on", in30Days),

    supabase
      .from("equipment")
      .select("id")
      .lt("loler_due_on", today),
  ]);

  const activeCount = activeJobs.count ?? 0;

  const totalCranes = cranesAll.count ?? 0;
  const totalVehicles = vehiclesAll.count ?? 0;

  const availableCranesNow = (cranesAll.data ?? []).filter((c: any) => {
    const status = String(c?.status ?? "").toLowerCase();
    return status !== "maintenance" && status !== "out_of_service";
  }).length;

  const reservedCranesLater = 0;

  const availableVehiclesNow = (vehiclesAll.data ?? []).filter((v: any) => {
    const status = String(v?.status ?? "").toLowerCase();
    return status !== "maintenance" && status !== "out_of_service";
  }).length;

  const outstandingJobsTotal =
    (unpaidJobs.data ?? []).reduce((acc: number, r: any) => {
      return acc + outstandingAmount(r.total_invoice, r.amount_paid);
    }, 0) ?? 0;

  const outstandingTransportTotal =
    (unpaidTransport.data ?? []).reduce((acc: number, r: any) => {
      const total = Number(r.total_invoice ?? r.agreed_sell_rate ?? r.price ?? 0);
      const paid = Number(r.amount_paid ?? 0);
      return acc + outstandingAmount(total, paid);
    }, 0) ?? 0;

  const outstandingTotal = outstandingJobsTotal + outstandingTransportTotal;

  const upcomingBookings = [
    ...(upcomingTimedJobs.data ?? []).map((j: any) => ({
      id: j.id,
      start_at: j.job_date && j.start_time ? `${j.job_date}T${j.start_time}` : null,
      start_date: j.job_date,
      location: j.site_name,
      status: j.status,
      clients: j.clients,
      equipment: null,
    })),
    ...(upcomingDatedJobs.data ?? []).map((t: any) => ({
      id: t.id,
      start_at: t.transport_date && t.collection_time ? `${t.transport_date}T${t.collection_time}` : null,
      start_date: t.transport_date,
      location: t.collection_address || t.delivery_address,
      status: t.status,
      clients: t.clients,
      equipment: null,
    })),
  ]
    .sort((a: any, b: any) => {
      const av = a.start_at || a.start_date || "";
      const bv = b.start_at || b.start_date || "";
      return String(av).localeCompare(String(bv));
    })
    .slice(0, 10);

  const overdueInvoices = [
    ...(overdueJobInvoices.data ?? []).map((j: any) => ({
      id: j.id,
      total_invoice: outstandingAmount(j.total_invoice, j.amount_paid),
      invoice_status: j.invoice_status,
      start_at: null,
      start_date: j.job_date,
      clients: j.clients,
    })),
    ...(overdueTransportInvoices.data ?? []).map((t: any) => ({
      id: t.id,
      total_invoice: outstandingAmount(
        t.total_invoice ?? t.agreed_sell_rate ?? t.price,
        t.amount_paid
      ),
      invoice_status: t.invoice_status,
      start_at: null,
      start_date: t.transport_date,
      clients: t.clients,
    })),
  ]
    .sort((a: any, b: any) =>
      String(a.start_date || "").localeCompare(String(b.start_date || ""))
    )
    .slice(0, 10);

  const utilisationPct =
    totalCranes > 0 ? Math.round((activeCount / totalCranes) * 100) : 0;

  const servicedEquipmentIds = new Set(
    (serviceLogAll.data ?? [])
      .map((r: any) => r.equipment_id)
      .filter(Boolean)
  );

  const equipmentWithServiceHistory = servicedEquipmentIds.size;
  const equipmentWithoutServiceHistory = Math.max(
    0,
    totalCranes - equipmentWithServiceHistory
  );

  return NextResponse.json({
    today,
    bookingsToday: jobsToday.count ?? 0,
    activeHires: activeCount,
    availableEquipment: availableCranesNow,
    totalEquipment: totalCranes,
    totalCranes,
    totalVehicles,
    availableCranesNow,
    reservedCranesLater,
    availableVehiclesNow,
    outstandingInvoices: outstandingTotal,
    upcomingBookings,
    overdueInvoices,
    utilisationPct,
    recentAudit: recentAudit.data ?? [],
    todayJobs:
      (todayJobs.data ?? []).map((j: any) => ({
        id: j.id,
        start_at: j.job_date && j.start_time ? `${j.job_date}T${j.start_time}` : null,
        start_date: j.job_date,
        location: j.site_name,
        status: j.status,
        clients: j.clients,
        equipment: null,
      })) ?? [],
    onHireEquipment: activeCount,
    reservedEquipment: reservedCranesLater,
    certExpiringSoon: certExpiringSoon.data?.length ?? 0,
    certExpired: certExpired.data?.length ?? 0,
    maintenanceEquipment: maintenanceEquipment.count ?? 0,
    equipmentWithServiceHistory,
    equipmentWithoutServiceHistory,
    recentServiceLog: recentServiceLog.data ?? [],
    lolerDueSoon: lolerDueSoon.data?.length ?? 0,
    lolerOverdue: lolerOverdue.data?.length ?? 0,
  });
}
