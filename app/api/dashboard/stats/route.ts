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

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const today = isoDate();
  const todayStartIso = startOfTodayIso();
  const next7DaysIso = endOfNext7DaysIso();

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
    reservedJobs,
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

    supabase.from("equipment").select("id,status,name", { count: "exact" }),

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
      .lte("start_date", isoDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)))
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
      .lte("start_date", today)
      .gte("end_date", today)
      .neq("status", "Cancelled")
      .order("start_at", { ascending: true })
      .limit(10),

    supabase
      .from("bookings")
      .select("equipment_id")
      .gt("start_date", today)
      .neq("status", "Cancelled"),
  ]);

  const activeCount = activeHires.count ?? 0;
  const activeEquipmentIds = new Set(
    (activeHires.data ?? []).map((b: any) => b.equipment_id).filter(Boolean)
  );

  const reservedEquipmentIds = new Set(
    (reservedJobs.data ?? []).map((b: any) => b.equipment_id).filter(Boolean)
  );

  const totalEquipment = equipmentAll.count ?? 0;

  let availableNow = 0;
  let onHireEquipment = 0;
  let reservedEquipment = 0;

  for (const e of equipmentAll.data ?? []) {
    const isActive = activeEquipmentIds.has(e.id);
    const isReserved = reservedEquipmentIds.has(e.id);

    if (isActive) {
      onHireEquipment++;
    } else if (isReserved) {
      reservedEquipment++;
    } else {
      availableNow++;
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

  return NextResponse.json({
    today,
    bookingsToday: bookingsToday.count ?? 0,
    activeHires: activeCount,
    availableEquipment: availableNow,
    totalEquipment,
    onHireEquipment,
    reservedEquipment,
    outstandingInvoices: outstandingTotal,
    upcomingBookings,
    overdueInvoices: overdueInvoices.data ?? [],
    utilisationPct,
    recentAudit: recentAudit.data ?? [],
    todayJobs: todayJobs.data ?? [],
  });
}
