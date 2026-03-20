import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type OrsFeature = {
  geometry?: {
    coordinates?: number[][];
  };
  properties?: {
    summary?: {
      distance?: number;
      duration?: number;
    };
  };
};

function roundCoord(value: number) {
  return value.toFixed(5);
}

function makeKey(lat: number, lng: number) {
  return `${roundCoord(lat)},${roundCoord(lng)}`;
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const fromLat = Number(body?.fromLat);
    const fromLng = Number(body?.fromLng);
    const toLat = Number(body?.toLat);
    const toLng = Number(body?.toLng);

    if (
      !Number.isFinite(fromLat) ||
      !Number.isFinite(fromLng) ||
      !Number.isFinite(toLat) ||
      !Number.isFinite(toLng)
    ) {
      return NextResponse.json(
        { error: "Invalid route coordinates." },
        { status: 400 }
      );
    }

    const apiKey = String(process.env.ORS_API_KEY ?? "").trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: "ORS_API_KEY is missing on the server." },
        { status: 500 }
      );
    }

    const profile = "driving-hgv";
    const fromKey = makeKey(fromLat, fromLng);
    const toKey = makeKey(toLat, toLng);

    const admin = getAdminClient();

    const { data: cached } = await admin
      .from("transport_route_cache")
      .select("distance_meters, duration_seconds, path_json")
      .eq("profile", profile)
      .eq("from_key", fromKey)
      .eq("to_key", toKey)
      .maybeSingle();

    if (cached?.path_json) {
      return NextResponse.json({
        path: cached.path_json,
        distance_meters:
          typeof cached.distance_meters === "number"
            ? cached.distance_meters
            : Number(cached.distance_meters ?? 0) || null,
        duration_seconds:
          typeof cached.duration_seconds === "number"
            ? cached.duration_seconds
            : Number(cached.duration_seconds ?? 0) || null,
        cached: true,
      });
    }

    const res = await fetch(
      "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson",
      {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [fromLng, fromLat],
            [toLng, toLat],
          ],
        }),
        cache: "no-store",
      }
    );

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            json?.error?.message ||
            json?.message ||
            "Could not fetch HGV route.",
        },
        { status: 400 }
      );
    }

    const feature = (json?.features?.[0] ?? null) as OrsFeature | null;
    const coords = feature?.geometry?.coordinates ?? [];
    const summary = feature?.properties?.summary ?? {};

    if (!Array.isArray(coords) || coords.length === 0) {
      return NextResponse.json(
        { error: "No route returned." },
        { status: 400 }
      );
    }

    const latLngs = coords.map((pair) => [Number(pair[1]), Number(pair[0])]);

    const distanceMeters =
      typeof summary.distance === "number" ? summary.distance : null;
    const durationSeconds =
      typeof summary.duration === "number" ? summary.duration : null;

    try {
      await admin.from("transport_route_cache").upsert(
        {
          profile,
          from_key: fromKey,
          to_key: toKey,
          distance_meters: distanceMeters,
          duration_seconds: durationSeconds,
          path_json: latLngs,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "profile,from_key,to_key",
        }
      );
    } catch {
      // do not fail the live route response if cache write fails
    }

    return NextResponse.json({
      path: latLngs,
      distance_meters: distanceMeters,
      duration_seconds: durationSeconds,
      cached: false,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
