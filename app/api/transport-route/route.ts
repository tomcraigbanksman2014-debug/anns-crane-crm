import { NextResponse } from "next/server";

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

    return NextResponse.json({
      path: latLngs,
      distance_meters:
        typeof summary.distance === "number" ? summary.distance : null,
      duration_seconds:
        typeof summary.duration === "number" ? summary.duration : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
