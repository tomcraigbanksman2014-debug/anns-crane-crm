import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

function toTimeOnly(value: string | null | undefined) {
  if (!value) return null;

  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return value.slice(0, 5);
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function extractSiteAddressFromDriverNotes(notes: string | null | undefined) {
  if (!notes) return null;
  const lines = String(notes).split("\n");
  const match = lines.find((line) => line.toLowerCase().startsWith("site address:"));
  if (!match) return null;
  return match.replace(/^site address:\s*/i, "").trim() || null;
}

function extractContactNameFromDriverNotes(notes: string | null | undefined) {
  if (!notes) return null;
  const lines = String(notes).split("\n");
  const match = lines.find((line) => line.toLowerCase().startsWith("site contact:"));
  if (!match) return null;
  return match.replace(/^site contact:\s*/i, "").trim() || null;
}

function extractContactPhoneFromDriverNotes(notes: string | null | undefined) {
  if (!notes) return null;
  const lines = String(notes).split("\n");
  const match = lines.find((line) => line.toLowerCase().startsWith("site phone:"));
  if (!match) return null;
  return match.replace(/^site phone:\s*/i, "").trim() || null;
}

function extractGeneralNotes(notes: string | null | undefined) {
  if (!notes) return null;

  const filtered = String(notes)
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase();
      return (
        !lower.startsWith("site address:") &&
        !lower.startsWith("site contact:") &&
        !lower.startsWith("site phone:")
      );
    })
    .join("\n")
    .trim();

  return filtered || null;
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
        status,
        invoice_status,
        driver_notes,
        operator_name
      `)
      .eq("id", params.id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.redirect(new URL("/bookings", req.url));
    }

    const { data: existingJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("booking_id", booking.id)
      .maybeSingle();

    if (existingJob?.id) {
      return NextResponse.redirect(new URL(`/jobs/${existingJob.id}`, req.url));
    }

    const { data: bookingEquipment, error: bookingEquipmentError } = await supabase
      .from("booking_equipment")
      .select(`
        id,
        equipment_id,
        operator_id,
        source_type,
        supplier_id,
        purchase_order_id,
        item_name,
        booking_date,
        start_time,
        end_time,
        agreed_cost,
        supplier_reference,
        notes
      `)
      .eq("booking_id", booking.id)
      .order("created_at", { ascending: true });

    if (bookingEquipmentError) {
      return NextResponse.redirect(new URL(`/bookings/${params.id}`, req.url));
    }

    const equipmentRows = bookingEquipment ?? [];
    const firstAllocation = equipmentRows[0] ?? null;

    const site_address =
      extractSiteAddressFromDriverNotes(booking.driver_notes) ?? booking.location ?? null;

    const contact_name = extractContactNameFromDriverNotes(booking.driver_notes);
    const contact_phone = extractContactPhoneFromDriverNotes(booking.driver_notes);
    const generalNotes = extractGeneralNotes(booking.driver_notes);

    const jobPayload = {
      client_id: booking.client_id ?? null,
      equipment_id: firstAllocation?.equipment_id ?? booking.equipment_id ?? null,
      booking_id: booking.id,
      job_date: booking.start_date ?? null,
      start_time: firstAllocation?.start_time ?? toTimeOnly(booking.start_at),
      end_time: firstAllocation?.end_time ?? toTimeOnly(booking.end_at),
      site_name: booking.location ?? null,
      site_address,
      contact_name,
      contact_phone,
      status: "confirmed",
      hire_type: null,
      lift_type: null,
      notes: generalNotes,
      created_by: user.id,
      operator_id: firstAllocation?.operator_id ?? null,
      main_operator_id: firstAllocation?.operator_id ?? null,
      invoice_status: booking.invoice_status ?? "not_invoiced",
      updated_at: new Date().toISOString(),
    };

    if (!jobPayload.job_date) {
      return NextResponse.redirect(new URL(`/bookings/${params.id}`, req.url));
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert([jobPayload])
      .select("id, job_number")
      .single();

    if (jobError || !job) {
      return NextResponse.redirect(new URL(`/bookings/${params.id}`, req.url));
    }

    if (equipmentRows.length > 0) {
      const jobEquipmentRows = equipmentRows.map((row) => ({
        job_id: job.id,
        equipment_id: row.equipment_id ?? null,
        operator_id: row.operator_id ?? null,
        source_type: row.source_type ?? "owned",
        supplier_id: row.source_type === "cross_hire" ? row.supplier_id ?? null : null,
        purchase_order_id:
          row.source_type === "cross_hire" ? row.purchase_order_id ?? null : null,
        item_name: row.item_name ?? null,
        start_date: row.booking_date ?? booking.start_date ?? null,
        end_date: row.booking_date ?? booking.end_date ?? booking.start_date ?? null,
        start_time: row.start_time ?? toTimeOnly(booking.start_at),
        end_time: row.end_time ?? toTimeOnly(booking.end_at),
        agreed_cost: Number(row.agreed_cost ?? 0) || 0,
        supplier_reference: row.supplier_reference ?? null,
        notes: row.notes ?? null,
        updated_at: new Date().toISOString(),
      }));

      const { error: jobEquipmentError } = await supabase
        .from("job_equipment")
        .insert(jobEquipmentRows);

      if (jobEquipmentError) {
        return NextResponse.redirect(new URL(`/bookings/${params.id}`, req.url));
      }

      const crossHireTotal = jobEquipmentRows
        .filter((row) => row.source_type === "cross_hire")
        .reduce((sum, row) => sum + Number(row.agreed_cost ?? 0), 0);

      await supabase
        .from("jobs")
        .update({
          equipment_count: jobEquipmentRows.length,
          cross_hire_cost_total: crossHireTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    } else {
      await supabase
        .from("jobs")
        .update({
          equipment_count: 0,
          cross_hire_cost_total: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
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
        client_id: jobPayload.client_id,
        equipment_id: jobPayload.equipment_id,
        operator_id: jobPayload.operator_id,
        job_date: jobPayload.job_date,
        equipment_count: equipmentRows.length,
      },
    });

    return NextResponse.redirect(new URL(`/jobs/${job.id}`, req.url));
  } catch {
    return NextResponse.redirect(new URL(`/bookings/${params.id}`, req.url));
  }
}
