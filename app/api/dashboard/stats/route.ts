import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfNext7DaysIso() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function plusDaysDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const today = isoDate();
  const todayStartIso = startOfTodayIso();
  const next7DaysIso = endOfNext7DaysIso();
  const in30Days = plusDaysDate(30);

  const [
    bookingsToday,
    activeHires,
    equipmentAll,
    invoicesOutstanding,
    upcomingTimed,
    upcomingDated,
    overdueInvoices,
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
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("start_date", today),

    supabase
      .from("bookings")
      .select("id,equipment_id", { count: "exact" })
      .lte("start_date", today)
      .gte("end_date", today)
      .neq("status", "Cancelled"),

    supabase
      .from("equipment")
      .select("id,status,certification_expires_on,loler_due_on", { count: "exact" }),

    supabase
      .from("bookings")
      .select("total_invoice, invoice_status")
      .neq("invoice_status", "Paid"),

    supabase
      .from("bookings")
      .select(`
        id,
        start_at,
        start_date,
        location,
        status,
        clients:client_id ( company_name ),
        equipment:equipment_id ( name )
      `)
      .not("start_at", "is", null)
      .gte("start_at", todayStartIso)
      .lte("start_at", next7DaysIso)
      .neq("status", "Cancelled")
      .order("start_at", { ascending: true })
      .limit(10),

    supabase
      .from("bookings")
      .select(`
        id,
        start_at,
        start_date,
        location,
        status,
        clients:client_id ( company_name ),
        equipment:equipment_id ( name )
      `)
      .is("start_at", null)
      .gte("start_date", today)
      .lte("start_date", plusDaysDate(7))
      .neq("status", "Cancelled")
      .order("start_date", { ascending: true })
      .limit(10),

    supabase
      .from("bookings")
      .select(`
        id,
        total_invoice,
        invoice_status,
        start_at,
        start_date,
        clients:client_id ( company_name )
      `)
      .in("invoice_status", ["Not Invoiced", "Invoiced", "Part Paid"])
      .lt("end_date", today)
      .order("end_date", { ascending: true })
      .limit(10),

    supabase
      .from("audit_log")
      .select("id, actor_username, action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(8),

    supabase
      .from("bookings")
      .select(`
        id,
        start_at,
        start_date,
        location,
        status,
        clients:client_id ( company_name ),
        equipment:equipment_id ( name )
      `)
      .eq("start_date", today)
      .neq("status", "Cancelled")
      .order("start_at", { ascending: true })
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

  const activeCount = activeHires.count ?? 0;

  const activeEquipmentIds = new Set(
    (activeHires.data ?? [])
      .map((b: any) => b.equipment_id)
      .filter(Boolean)
  );

  const totalEquipment = equipmentAll.count ?? 0;

  let availableNow = 0;
  let reservedLater = 0;

  const equipmentIds = Array.from(
    new Set((equipmentAll.data ?? []).map((e: any) => e.id).filter(Boolean))
  );

  const { data: futureBookings } = await supabase
    .from("bookings")
    .select("equipment_id")
    .gt("start_date", today)
    .neq("status", "Cancelled");

  const futureEquipmentIds = new Set(
    (futureBookings ?? [])
      .map((b: any) => b.equipment_id)
      .filter(Boolean)
  );

  for (const id of equipmentIds) {
    const row = (equipmentAll.data ?? []).find((e: any) => e.id === id);
    const status = String(row?.status ?? "").toLowerCase();

    if (status === "maintenance" || status === "out_of_service") {
      continue;
    }

    const isBookedNow = activeEquipmentIds.has(id);
    const isReservedLater = futureEquipmentIds.has(id);

    if (!isBookedNow) {
      availableNow++;
    }

    if (!isBookedNow && isReservedLater) {
      reservedLater++;
    }
  }

  const outstandingTotal =
    (invoicesOutstanding.data ?? []).reduce((acc: number, r: any) => {
      const n = Number(r.total_invoice ?? 0);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0) ?? 0;

  const upcomingBookings = [
    ...(upcomingTimed.data ?? []),
    ...(upcomingDated.data ?? []),
  ]
    .sort((a: any, b: any) => {
      const av = a.start_at || a.start_date || "";
      const bv = b.start_at || b.start_date || "";
      return String(av).localeCompare(String(bv));
    })
    .slice(0, 10);

  const utilisationPct =
    totalEquipment > 0
      ? Math.round((activeEquipmentIds.size / totalEquipment) * 100)
      : 0;

  const servicedEquipmentIds = new Set(
    (serviceLogAll.data ?? [])
      .map((r: any) => r.equipment_id)
      .filter(Boolean)
  );

  const equipmentWithServiceHistory = servicedEquipmentIds.size;
  const equipmentWithoutServiceHistory = Math.max(
    0,
    totalEquipment - equipmentWithServiceHistory
  );

  return NextResponse.json({
    today,
    bookingsToday: bookingsToday.count ?? 0,
    activeHires: activeCount,
    availableEquipment: availableNow,
    totalEquipment,
    outstandingInvoices: outstandingTotal,
    upcomingBookings,
    overdueInvoices: overdueInvoices.data ?? [],
    utilisationPct,
    recentAudit: recentAudit.data ?? [],
    todayJobs: todayJobs.data ?? [],
    onHireEquipment: activeEquipmentIds.size,
    reservedEquipment: reservedLater,
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
