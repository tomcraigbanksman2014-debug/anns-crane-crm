import { NextResponse } from "next/server";
import { geocodeAddress } from "../../../../lib/geocode";
import { requireMasterAdminApi } from "../../../../lib/routeGuards";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

type Coord = {
  label: string;
  lat: number;
  lng: number;
};

type RouteResult = {
  distanceMeters: number | null;
  durationSeconds: number | null;
  path: number[][];
  provider: string;
  cached?: boolean;
  routeErrors?: string[];
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

function clean(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, ", ").replace(/\s+/g, " ").trim();
}

function normaliseKey(value: unknown) {
  return clean(value).toUpperCase().replace(/\s+/g, "");
}

function roundCoord(value: number) {
  return value.toFixed(5);
}

function makeKey(lat: number, lng: number) {
  return `${roundCoord(lat)},${roundCoord(lng)}`;
}

function sameStop(a: Coord, b: Coord) {
  const sameLabel = normaliseKey(a.label) && normaliseKey(a.label) === normaliseKey(b.label);
  const sameCoord = Math.abs(a.lat - b.lat) < 0.00005 && Math.abs(a.lng - b.lng) < 0.00005;
  return sameLabel || sameCoord;
}

function toLatLngs(coords: number[][]) {
  return coords
    .map((pair) => [Number(pair[1]), Number(pair[0])])
    .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
}

async function geocodeStop(label: string, value: unknown): Promise<Coord> {
  const address = clean(value);
  if (!address) throw new Error(`${label} is blank.`);

  const result = await geocodeAddress(address);
  if (!result) throw new Error(`Could not geocode ${label}: ${address}.`);

  return {
    label: address,
    lat: result.lat,
    lng: result.lng,
  };
}

async function readCachedRoute(args: {
  profile: string;
  fromKey: string;
  toKey: string;
}): Promise<RouteResult | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("transport_route_cache")
      .select("distance_meters, duration_seconds, path_json, provider")
      .eq("profile", args.profile)
      .eq("from_key", args.fromKey)
      .eq("to_key", args.toKey)
      .maybeSingle();

    if (error || !data) return null;

    const path = Array.isArray(data.path_json) ? data.path_json : [];

    return {
      path,
      distanceMeters: typeof data.distance_meters === "number" ? data.distance_meters : Number(data.distance_meters ?? 0) || null,
      durationSeconds: typeof data.duration_seconds === "number" ? data.duration_seconds : Number(data.duration_seconds ?? 0) || null,
      provider: String((data as any).provider || "cache"),
      cached: true,
    };
  } catch {
    return null;
  }
}

async function writeCachedRoute(args: {
  profile: string;
  fromKey: string;
  toKey: string;
  route: RouteResult;
}) {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("transport_route_cache").upsert(
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
      { onConflict: "profile,from_key,to_key" }
    );
  } catch {
    // Cache must never break live quoting.
  }
}

async function fetchOpenRouteServiceRoute(from: Coord, to: Coord): Promise<RouteResult> {
  const apiKey = String(process.env.ORS_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("ORS_API_KEY is missing.");

  const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-hgv/geojson", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    }),
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(json?.error?.message || json?.message || "OpenRouteService could not fetch HGV route.");
  }

  const feature = (json?.features?.[0] ?? null) as OrsFeature | null;
  const coords = feature?.geometry?.coordinates ?? [];
  const summary = feature?.properties?.summary ?? {};

  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error("OpenRouteService returned no route geometry.");
  }

  const path = toLatLngs(coords);
  if (path.length < 2) throw new Error("OpenRouteService returned invalid route geometry.");

  return {
    path,
    distanceMeters: typeof summary.distance === "number" ? summary.distance : null,
    durationSeconds: typeof summary.duration === "number" ? summary.duration : null,
    provider: "openrouteservice-hgv",
  };
}

async function fetchOsrmRoute(from: Coord, to: Coord): Promise<RouteResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=false`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || json?.error || "OSRM fallback could not fetch road route.");

  const route = (json?.routes?.[0] ?? null) as OsrmRoute | null;
  const coords = route?.geometry?.coordinates ?? [];

  if (!Array.isArray(coords) || coords.length < 2) throw new Error("OSRM fallback returned no route geometry.");

  const path = toLatLngs(coords);
  if (path.length < 2) throw new Error("OSRM fallback returned invalid route geometry.");

  return {
    path,
    distanceMeters: typeof route?.distance === "number" ? route.distance : null,
    durationSeconds: typeof route?.duration === "number" ? route.duration : null,
    provider: "osrm-road-fallback",
  };
}

async function routeSegment(from: Coord, to: Coord): Promise<RouteResult> {
  const profile = "driving-hgv-with-road-fallback";
  const fromKey = makeKey(from.lat, from.lng);
  const toKey = makeKey(to.lat, to.lng);

  const cached = await readCachedRoute({ profile, fromKey, toKey });
  if (cached?.distanceMeters) return cached;

  const routeErrors: string[] = [];
  let route: RouteResult | null = null;

  try {
    route = await fetchOpenRouteServiceRoute(from, to);
  } catch (error: any) {
    routeErrors.push(error?.message || "OpenRouteService route failed.");
  }

  if (!route) {
    try {
      route = await fetchOsrmRoute(from, to);
    } catch (error: any) {
      routeErrors.push(error?.message || "OSRM fallback route failed.");
    }
  }

  if (!route) {
    throw new Error(routeErrors.join(" ") || "Could not fetch route segment.");
  }

  route.routeErrors = routeErrors;
  await writeCachedRoute({ profile, fromKey, toKey, route });

  return route;
}

export async function POST(req: Request) {
  const auth = await requireMasterAdminApi();
  if (auth.response) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const yardInput = body?.yard_postcode || "SA10 6JY";
    const collectionInput = clean(body?.collection_postcode);
    const deliveryInput = clean(body?.delivery_postcode);
    const returnToYard = body?.return_to_yard !== false;

    if (!collectionInput && !deliveryInput) {
      return NextResponse.json({ error: "Enter at least a collection or delivery postcode/address." }, { status: 400 });
    }

    const yard = await geocodeStop("yard", yardInput);
    const stops: Coord[] = [yard];

    if (collectionInput) {
      const collection = await geocodeStop("collection", collectionInput);
      if (!sameStop(collection, stops[stops.length - 1])) stops.push(collection);
    }

    if (deliveryInput) {
      const delivery = await geocodeStop("delivery/site", deliveryInput);
      if (!sameStop(delivery, stops[stops.length - 1])) stops.push(delivery);
    }

    if (returnToYard && !sameStop(stops[stops.length - 1], yard)) {
      stops.push(yard);
    }

    if (stops.length < 2) {
      return NextResponse.json({ error: "Route needs at least two different stops." }, { status: 400 });
    }

    const segments = [] as Array<{
      from: string;
      to: string;
      miles: number;
      provider: string;
      cached: boolean;
    }>;

    let totalMeters = 0;
    const providers = new Set<string>();
    const routeErrors: string[] = [];

    for (let i = 0; i < stops.length - 1; i += 1) {
      const from = stops[i];
      const to = stops[i + 1];
      const route = await routeSegment(from, to);
      const meters = Number(route.distanceMeters ?? 0);
      if (!Number.isFinite(meters) || meters <= 0) {
        throw new Error(`Route segment returned no distance: ${from.label} to ${to.label}.`);
      }
      totalMeters += meters;
      providers.add(route.provider);
      (route.routeErrors ?? []).forEach((err) => routeErrors.push(err));
      segments.push({
        from: from.label,
        to: to.label,
        miles: Math.round((meters / 1609.344) * 10) / 10,
        provider: route.provider,
        cached: Boolean(route.cached),
      });
    }

    const actualMiles = totalMeters / 1609.344;
    const chargeableMiles = Math.ceil(actualMiles);
    const providerText = Array.from(providers).join(" + ") || "openrouteservice-hgv";
    const usedFallback = providerText.includes("fallback");

    return NextResponse.json({
      actual_miles: Math.round(actualMiles * 10) / 10,
      chargeable_miles: chargeableMiles,
      route_stops: stops.map((stop) => stop.label),
      segments,
      provider: providerText,
      route_errors: routeErrors,
      note: usedFallback
        ? "Warning: HGV route fell back to standard road routing for at least one segment. Check HGV restrictions, low bridges and site access before relying on this price."
        : "HGV routing calculated using the same OpenRouteService setup as the transport planner. Still check site access, restrictions and low bridges before confirming.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not calculate HGV mileage." }, { status: 400 });
  }
}
