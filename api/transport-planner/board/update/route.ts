import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function clean(value: any) {
  const s = String(value ?? "").trim();
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

    const body = await req.json().catch(() => ({}));

    const transportJobId = clean(body.transport_job_id);

    if (!transportJobId) {
      return NextResponse.json(
        { error: "Transport job id is required." },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if ("vehicle_id" in body) {
      updatePayload.vehicle_id = clean(body.vehicle_id);
    }

    if ("transport_date" in body) {
      updatePayload.transport_date = clean(body.transport_date);
    }

    if ("status" in body) {
      updatePayload.status = clean(body.status) ?? "planned";
    }

    const { error } = await supabase
      .from("transport_jobs")
      .update(updatePayload)
      .eq("id", transportJobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update transport planner job." },
      { status: 400 }
    );
  }
}
