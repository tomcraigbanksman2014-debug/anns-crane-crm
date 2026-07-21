import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function clean(value: any) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function toNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

    const operatorId = clean(body.operator_id);
    const vehicleId = clean(body.vehicle_id);
    const transportJobId = clean(body.transport_job_id);
    const lat = toNumber(body.lat);
    const lng = toNumber(body.lng);
    const accuracy = toNumber(body.accuracy);
    const speed = toNumber(body.speed);
    const heading = toNumber(body.heading);

    if (!operatorId || !transportJobId || lat === null || lng === null) {
      return NextResponse.json(
        { error: "operator_id, transport_job_id, lat and lng are required." },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("driver_locations").insert({
      operator_id: operatorId,
      vehicle_id: vehicleId,
      transport_job_id: transportJobId,
      lat,
      lng,
      accuracy,
      speed,
      heading,
      recorded_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not save driver location." },
      { status: 400 }
    );
  }
}
