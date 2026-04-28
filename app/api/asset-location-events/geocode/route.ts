import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function cleanPostcode(value: unknown) {
  return clean(value).replace(/\s+/g, "").toUpperCase();
}

function buildAddressQuery(body: any) {
  return [
    clean(body?.location_name),
    clean(body?.address),
    clean(body?.postcode),
    "United Kingdom",
  ]
    .filter(Boolean)
    .join(", ");
}

async function geocodeByPostcode(postcode: string) {
  const compact = cleanPostcode(postcode);
  if (!compact) return null;

  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "AnnS-Crane-CRM/1.0 asset-location-postcode-lookup",
    },
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.status !== 200 || !data?.result) return null;

  const lat = Number(data.result.latitude);
  const lng = Number(data.result.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    latitude: lat,
    longitude: lng,
    displayName: [
      data.result.postcode,
      data.result.admin_district,
      data.result.region,
      "United Kingdom",
    ]
      .filter(Boolean)
      .join(", "),
    source: "postcodes_io",
  };
}

async function geocodeByAddress(query: string) {
  if (!query || query === "United Kingdom") return null;

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

  if (!res.ok) return null;

  const first = Array.isArray(data) ? data[0] : null;
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);

  if (!first || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    latitude: lat,
    longitude: lng,
    displayName: String(first?.display_name ?? ""),
    source: "openstreetmap_nominatim",
  };
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

    const postcode = clean(body?.postcode);
    const query = buildAddressQuery(body);

    const postcodeResult = await geocodeByPostcode(postcode);
    if (postcodeResult) {
      return NextResponse.json({
        ok: true,
        ...postcodeResult,
      });
    }

    const addressResult = await geocodeByAddress(query);
    if (addressResult) {
      return NextResponse.json({
        ok: true,
        ...addressResult,
      });
    }

    return NextResponse.json(
      { error: "No map location found for that postcode/address." },
      { status: 404 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not geocode asset location." },
      { status: 500 }
    );
  }
}
