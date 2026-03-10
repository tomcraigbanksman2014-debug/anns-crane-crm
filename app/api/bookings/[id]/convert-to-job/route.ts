import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

function toTimeOnly(value: string | null | undefined) {
  if (!value) return null;

  // If already looks like HH:MM or HH:MM:SS
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return value.slice(0, 5);
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id,
        client_id,
        equipment_id,
        start_date,
        end_date,
        start_at,
        end_at,
        location,
        status
      `)
      .eq("id", params.id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.redirect(new URL("/bookings", req.url));
    }

    // Do not create duplicate jobs for the same booking
    const { data: existingJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("booking_id", booking.id)
      .maybeSingle();

    if (existingJob?.id) {
      return NextResponse.redirect(new URL(`/jobs/${existingJob.id}`, req.url));
    }

    const payload = {
      client_id: booking.client_id ?? null,
      equipment_id: booking.equipment_id ?? null,
      booking_id: booking.id,
      job_date: booking.start_date ?? null,
      start_time: toTimeOnly(booking.start_at),
      end_time: toTimeOnly(booking.end_at),
      site_name: null,
      site_address: booking.location ?? null,
      contact_name: null,
      contact_phone: null,
      status: "confirmed",
      hire_type: null,
      lift_type: null,
      notes: null,
      created_by: user.id,
    };

    if (!payload.job_date) {
      return NextResponse.redirect(new URL(`/bookings/${params.id}`, req.url));
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert([payload])
      .select("id, job_number")
      .single();

    if (jobError || !job) {
      return NextResponse.redirect(new URL(`/bookings/${params.id}`, req.url));
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "create",
      entity_type: "job",
      entity_id: job.id,
      meta: {
        source: "booking_conversion",
        booking_id: booking.id,
        job_number: job.job_number ?? null,
        client_id: payload.client_id,
        equipment_id: payload.equipment_id,
        job_date: payload.job_date,
      },
    });

    return NextResponse.redirect(new URL(`/jobs/${job.id}`, req.url));
  } catch {
    return NextResponse.redirect(new URL(`/bookings/${params.id}`, req.url));
  }
}
