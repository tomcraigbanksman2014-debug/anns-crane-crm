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
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", params.id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.redirect(new URL("/bookings", req.url));
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        client_id: booking.client_id,
        equipment_id: booking.equipment_id,
        booking_id: booking.id,
        job_date: booking.start_date,
        start_time: booking.start_at,
        end_time: booking.end_at,
        site_address: booking.location,
        contact_name: booking.contact_name,
        contact_phone: booking.contact_phone,
        status: "confirmed",
      })
      .select("id")
      .single();

    if (jobError || !job) {
      return NextResponse.redirect(new URL(`/bookings/${params.id}`, req.url));
    }

    // Redirect to the new job page
    return NextResponse.redirect(new URL(`/jobs/${job.id}`, req.url));

  } catch {
    return NextResponse.redirect(new URL("/bookings", req.url));
  }
}
