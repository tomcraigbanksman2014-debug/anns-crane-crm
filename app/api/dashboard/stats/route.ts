import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const today = isoDate();

  // Bookings starting today
  const bookingsToday = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("start_date", today);

  // Active hires today (start <= today <= end)
  const activeHires = await supabase
    .from("bookings")
    .select("id,equipment_id", { count: "exact" })
    .lte("start_date", today)
    .gte("end_date", today)
    .neq("status", "Cancelled");

  const activeCount = activeHires.count ?? 0;
  const activeEquipmentIds = new Set((activeHires.data ?? []).map((b: any) => b.equipment_id).filter(Boolean));

  // Total equipment
  const equipmentAll = await supabase.from("equipment").select("id,status", { count: "exact" });
  const totalEquipment = equipmentAll.count ?? 0;

  // “Available” equipment not currently active
  let availableNow = 0;
  for (const e of equipmentAll.data ?? []) {
    const isAvailable = (e.status ?? "").toLowerCase() === "available";
    const isBookedNow = activeEquipmentIds.has(e.id);
    if (isAvailable && !isBookedNow) availableNow++;
  }

  // Invoice outstanding = sum total_invoice where not Paid
  const invoicesOutstanding = await supabase
    .from("bookings")
    .select("total_invoice, invoice_status")
    .neq("invoice_status", "Paid");

  const outstandingTotal =
    (invoicesOutstanding.data ?? []).reduce((acc: number, r: any) => {
      const n = Number(r.total_invoice ?? 0);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0) ?? 0;

  return NextResponse.json({
    today,
    bookingsToday: bookingsToday.count ?? 0,
    activeHires: activeCount,
    availableEquipment: availableNow,
    totalEquipment,
    outstandingInvoices: outstandingTotal,
  });
}
