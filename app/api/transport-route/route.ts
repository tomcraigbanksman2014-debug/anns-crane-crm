import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiUser } from "../../lib/apiAuth";

type RouteResult = {
  path: number[][];
  distanceMeters: number | null;
  durationSeconds: number | null;
  provider: string;
};

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

type OsrmRoute = {
  geometry?: {
    coordinates?: number[][];
  };
  distance?: number;
  duration?: number;
};

function roundCoord(value: number) {
  return value.toFixed(5);
}

function makeKey(lat: number, lng: number) {
  return `${roundCoord(lat)},${roundCoord(lng)}`;
}

function isValidCoord(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n);
}

function toLatLngs(coords: number[][]) {
  return coords
    .map((pair) => [Number(pair[1]), Number(pair[0])])
    .filter(
      (pair) =>
        Number.isFinite(pair[0]) &&
        Number.isFinite(pair[1])
    );
}

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

async function readCachedRoute(args: {
  admin: ReturnType<typeof getAdminClient>;
  profile: string;
  fromKey: string;
  toKey: string;
}) {
  try {
    const { data, error } = await args.admin
      .from("transport_route_cache")
      .select("distance_meters, duration_seconds, path_json, provider")
      .eq("profile", args.profile)
      .eq("from_key", args.fromKey)
      .eq("to_key", args.toKey)
      .maybeSingle();

    if (error || !data?.path_json) return null;

    const path = Array.isArray(data.path_json) ? data.path_json : [];

    if (path.length < 2) return null;

    return {
      path,
      distanceMeters:
        typeof data.distance_meters === "number"
          ? data.distance_meters
          : Number(data.distance_meters ?? 0) || null,
      durationSeconds:
        typeof data.duration_seconds === "number"
          ? data.duration_seconds
          : Number(data.duration_seconds ?? 0) || null,
      provider: String((data as any).provider || "cache"),
    } satisfies RouteResult;
  } catch {
    return null;
  }
}

async function writeCachedRoute(args: {
  admin: ReturnType<typeof getAdminClient>;
  profile: string;
  fromKey: string;
  toKey: string;
  route: RouteResult;
}) {
  try {
    await args.admin.from("transport_route_cache").upsert(
      {
        profile: args.profile,
        from_key: args.fromKey,
        to_key: args.toKey,
        distance_meters: args.route.distanceMeters,
        duration_seconds: args.route.durationSeconds,
        path_json: args.route.path,
        provider: args.route.provider,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "profile,from_key,to_key",
      }
    );
  } catch {
    // Cache must never break live routing.
  }
}

async function fetchOpenRouteServiceRoute(args: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}) {
  const apiKey = String(process.env.ORS_API_KEY ?? "").trim();

  if (!apiKey) {
    throw new Error("ORS_API_KEY is missing.");
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
          [args.fromLng, args.fromLat],
          [args.toLng, args.toLat],
        ],
      }),
      cache: "no-store",
    }
  );

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      json?.error?.message ||
        json?.message ||
        "OpenRouteService could not fetch HGV route."
    );
  }

  const feature = (json?.features?.[0] ?? null) as OrsFeature | null;
  const coords = feature?.geometry?.coordinates ?? [];
  const summary = feature?.properties?.summary ?? {};

  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error("OpenRouteService returned no route geometry.");
  }

  const path = toLatLngs(coords);

  if (path.length < 2) {
    throw new Error("OpenRouteService returned invalid route geometry.");
  }

  return {
    path,
    distanceMeters:
      typeof summary.distance === "number" ? summary.distance : null,
    durationSeconds:
      typeof summary.duration === "number" ? summary.duration : null,
    provider: "openrouteservice-hgv",
  } satisfies RouteResult;
}

async function fetchOsrmRoute(args: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${args.fromLng},${args.fromLat};${args.toLng},${args.toLat}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=false`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      json?.message ||
        json?.error ||
        "OSRM fallback could not fetch road route."
    );
  }

  const route = (json?.routes?.[0] ?? null) as OsrmRoute | null;
  const coords = route?.geometry?.coordinates ?? [];

  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error("OSRM fallback returned no route geometry.");
  }

  const path = toLatLngs(coords);

  if (path.length < 2) {
    throw new Error("OSRM fallback returned invalid route geometry.");
  }

  return {
    path,
    distanceMeters:
      typeof route?.distance === "number" ? route.distance : null,
    durationSeconds:
      typeof route?.duration === "number" ? route.duration : null,
    provider: "osrm-road-fallback",
  } satisfies RouteResult;
}

export async function POST(req: Request) {
  try {
    const { response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => null);

    if (
      !isValidCoord(body?.fromLat) ||
      !isValidCoord(body?.fromLng) ||
      !isValidCoord(body?.toLat) ||
      !isValidCoord(body?.toLng)
    ) {
      return NextResponse.json(
        { error: "Invalid route coordinates." },
        { status: 400 }
      );
    }

    const fromLat = Number(body.fromLat);
    const fromLng = Number(body.fromLng);
    const toLat = Number(body.toLat);
    const toLng = Number(body.toLng);

    const profile = "driving-hgv-with-road-fallback";
    const fromKey = makeKey(fromLat, fromLng);
    const toKey = makeKey(toLat, toLng);

    let admin: ReturnType<typeof getAdminClient> | null = null;

    try {
      admin = getAdminClient();
    } catch {
      admin = null;
    }

    if (admin) {
      const cached = await readCachedRoute({
        admin,
        profile,
        fromKey,
        toKey,
      });

      if (cached) {
        return NextResponse.json({
          path: cached.path,
          distance_meters: cached.distanceMeters,
          duration_seconds: cached.durationSeconds,
          provider: cached.provider,
          cached: true,
        });
      }
    }

    const routeErrors: string[] = [];
    let route: RouteResult | null = null;

    try {
      route = await fetchOpenRouteServiceRoute({
        fromLat,
        fromLng,
        toLat,
        toLng,
      });
    } catch (error: any) {
      routeErrors.push(error?.message || "OpenRouteService route failed.");
    }

    if (!route) {
      try {
        route = await fetchOsrmRoute({
          fromLat,
          fromLng,
          toLat,
          toLng,
        });
      } catch (error: any) {
        routeErrors.push(error?.message || "OSRM fallback route failed.");
      }
    }

    if (!route) {
      return NextResponse.json(
        {
          error: "Could not fetch a road route.",
          route_errors: routeErrors,
        },
        { status: 400 }
      );
    }

    if (admin) {
      await writeCachedRoute({
        admin,
        profile,
        fromKey,
        toKey,
        route,
      });
    }

    return NextResponse.json({
      path: route.path,
      distance_meters: route.distanceMeters,
      duration_seconds: route.durationSeconds,
      provider: route.provider,
      cached: false,
      route_errors: routeErrors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
