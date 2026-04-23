import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";
import { assertOperatorAvailable } from "../../../lib/staffAvailability";

type Payload = {
  client_id?: string | null;
  equipment_id?: string | null;
  operator_id?: string | null;
  booking_id?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  job_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: "draft" | "confirmed" | "in_progress" | "completed" | "cancelled";
  hire_type?: string | null;
  lift_type?: string | null;
  notes?: string | null;
  invoice_subtotal?: number | null;
};

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Payload;

    const invoiceSubtotalRaw =
      body.invoice_subtotal != null && String(body.invoice_subtotal).trim() !== ""
        ? Number(body.invoice_subtotal)
        : null;

    if (invoiceSubtotalRaw != null && Number.isNaN(invoiceSubtotalRaw)) {
      return NextResponse.json(
        { error: "invoice_subtotal must be a number" },
        { status: 400 }
      );
    }

    const startDate = norm(body.start_date) ?? norm(body.job_date);
    const endDate = norm(body.end_date) ?? startDate;

    if (!startDate) {
      return NextResponse.json({ error: "Job start date is required" }, { status: 400 });
    }

    if (!endDate) {
      return NextResponse.json({ error: "Job end date is required" }, { status: 400 });
    }

    if (endDate < startDate) {
      return NextResponse.json(
        { error: "Job end date cannot be earlier than job start date" },
        { status: 400 }
      );
    }

    const payload = {
      client_id: norm(body.client_id),
      equipment_id: norm(body.equipment_id),
      operator_id: norm(body.operator_id),
      booking_id: norm(body.booking_id),
      site_name: norm(body.site_name),
      site_address: norm(body.site_address),
      contact_name: norm(body.contact_name),
      contact_phone: norm(body.contact_phone),
      job_date: startDate,
      start_date: startDate,
      end_date: endDate,
      start_time: norm(body.start_time),
      end_time: norm(body.end_time),
      status: norm(body.status) ?? "draft",
      hire_type: norm(body.hire_type),
      lift_type: norm(body.lift_type),
      notes: norm(body.notes),
      invoice_subtotal: invoiceSubtotalRaw,
      created_by: user.id,
      archived: false,
      updated_at: new Date().toISOString(),
    };

    if (payload.operator_id) {
      await assertOperatorAvailable(supabase, {
        operatorId: payload.operator_id,
        startDate: payload.start_date,
        endDate: payload.end_date,
        startTime: payload.start_time,
        endTime: payload.end_time,
      });
    }

    const { data, error } = await supabase
      .from("jobs")
      .insert([payload])
      .select("id, job_number")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "job_created",
      entity_type: "job",
      entity_id: data?.id ?? null,
      meta: {
        job_number: data?.job_number ?? null,
        client_id: payload.client_id,
        equipment_id: payload.equipment_id,
        operator_id: payload.operator_id,
        booking_id: payload.booking_id,
        job_date: payload.job_date,
        start_date: payload.start_date,
        end_date: payload.end_date,
        status: payload.status,
        site_name: payload.site_name,
      },
    });

    return NextResponse.json({
      ok: true,
      id: data?.id ?? null,
      job_number: data?.job_number ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not save job." },
      { status: 400 }
    );
  }
}
