import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", params.id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        client_id: booking.client_id,
        equipment_id: booking.equipment_id,
        booking_id: booking.id,
        job_date: booking.date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        site_name: booking.site_name,
        site_address: booking.site_address,
        contact_name: booking.contact_name,
        contact_phone: booking.contact_phone,
        status: "confirmed",
      })
      .select("id")
      .single();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, job_id: job.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not convert booking." },
      { status: 400 }
    );
  }
}
