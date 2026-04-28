import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function buildQuery(body: any) {
  return [
    clean(body?.location_name),
    clean(body?.address),
    clean(body?.postcode),
    "United Kingdom",
  ]
    .filter(Boolean)
    .join(", ");
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
    const query = buildQuery(body);

    if (!query || query === "United Kingdom") {
      return NextResponse.json({ error: "No address or postcode supplied." }, { status: 400 });
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "gb");
    url.searchParams.set("q", query);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-GB",
        "User-Agent": "AnnS-Crane-CRM/1.0 asset-location-geocoder",
      },
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json({ error: "Could not look up the map location." }, { status: 400 });
    }

    const first = Array.isArray(data) ? data[0] : null;
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);

    if (!first || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "No map location found for that address/postcode." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      latitude: lat,
      longitude: lng,
      displayName: String(first?.display_name ?? ""),
      source: "openstreetmap_nominatim",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not geocode asset location." },
      { status: 500 }
    );
  }
}
