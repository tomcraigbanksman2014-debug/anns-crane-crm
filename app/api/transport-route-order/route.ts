import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function isCancelledStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "cancelled";
}

function positiveIntOrNull(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : null;
}

type RouteStopPayload = {
  transport_job_id?: string;
  stop_type?: "pickup" | "delivery";
  stop_order?: number;
};

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const admin = getAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const vehicleId = clean(body.vehicle_id);
    const routeDate = clean(body.route_date);
    const stops = Array.isArray(body.stops) ? (body.stops as RouteStopPayload[]) : [];

    if (!vehicleId || !routeDate) {
      return NextResponse.json(
        { error: "vehicle_id and route_date are required." },
        { status: 400 }
      );
    }

    const { data: jobs, error: jobsError } = await admin
      .from("transport_jobs")
      .select("id, vehicle_id, transport_date, delivery_date, archived, status")
      .eq("vehicle_id", vehicleId)
      .eq("archived", false)
      .or(`transport_date.eq.${routeDate},delivery_date.eq.${routeDate}`);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 400 });
    }

    const relevantJobs = ((jobs ?? []) as Array<{
      id: string;
      vehicle_id: string | null;
      transport_date: string | null;
      delivery_date: string | null;
      archived?: boolean | null;
      status?: string | null;
    }>).filter((job) => !isCancelledStatus(job.status));

    const relevantJobMap = new Map(relevantJobs.map((job) => [job.id, job]));

    for (const job of relevantJobs) {
      const updatePayload: Record<string, number | null> = {};

      if (job.transport_date === routeDate) {
        updatePayload.collection_route_order = null;
      }

      if ((job.delivery_date || job.transport_date) === routeDate) {
        updatePayload.delivery_route_order = null;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: resetError } = await admin
          .from("transport_jobs")
          .update(updatePayload)
          .eq("id", job.id);

        if (resetError) {
          return NextResponse.json({ error: resetError.message }, { status: 400 });
        }
      }
    }

    const orderedStops = [...stops]
      .map((stop) => ({
        transportJobId: clean(stop.transport_job_id),
        stopType: stop.stop_type === "delivery" ? "delivery" : "pickup",
        stopOrder: positiveIntOrNull(stop.stop_order),
      }))
      .filter((stop) => !!stop.transportJobId && !!stop.stopOrder)
      .sort((a, b) => Number(a.stopOrder) - Number(b.stopOrder));

    for (const stop of orderedStops) {
      const job = relevantJobMap.get(String(stop.transportJobId));
      if (!job) {
        continue;
      }

      const updatePayload: Record<string, number> = {};

      if (stop.stopType === "pickup" && job.transport_date === routeDate) {
        updatePayload.collection_route_order = Number(stop.stopOrder);
      }

      if (
        stop.stopType === "delivery" &&
        (job.delivery_date || job.transport_date) === routeDate
      ) {
        updatePayload.delivery_route_order = Number(stop.stopOrder);
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await admin
          .from("transport_jobs")
          .update(updatePayload)
          .eq("id", String(stop.transportJobId));

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 400 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not save route order." },
      { status: 400 }
    );
  }
}
