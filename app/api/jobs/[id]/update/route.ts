import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

type Payload = {
  client_id?: string | null;
  equipment_id?: string | null;
  booking_id?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  job_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: "draft" | "confirmed" | "in_progress" | "completed" | "cancelled";
  hire_type?: string | null;
  lift_type?: string | null;
  notes?: string | null;
};

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function PATCH(
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
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Payload;

    const payload = {
      client_id: norm(body.client_id),
      equipment_id: norm(body.equipment_id),
      booking_id: norm(body.booking_id),
      site_name: norm(body.site_name),
      site_address: norm(body.site_address),
      contact_name: norm(body.contact_name),
      contact_phone: norm(body.contact_phone),
      job_date: norm(body.job_date),
      start_time: norm(body.start_time),
      end_time: norm(body.end_time),
      status: norm(body.status) ?? "draft",
      hire_type: norm(body.hire_type),
      lift_type: norm(body.lift_type),
      notes: norm(body.notes),
    };

    if (!payload.job_date) {
      return NextResponse.json({ error: "Job date is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("jobs")
      .update(payload)
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "update",
      entity_type: "job",
      entity_id: params.id,
      meta: {
        client_id: payload.client_id,
        equipment_id: payload.equipment_id,
        job_date: payload.job_date,
        status: payload.status,
        site_name: payload.site_name,
      },
    });

    return NextResponse.json({ ok: true, id: params.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update job." },
      { status: 400 }
    );
  }
}
