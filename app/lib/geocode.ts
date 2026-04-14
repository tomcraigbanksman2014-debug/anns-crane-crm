export type GeocodeResult = {
  lat: number;
  lng: number;
};

const UK_BOUNDS = {
  minLat: 49.5,
  maxLat: 61.5,
  minLng: -8.8,
  maxLng: 2.5,
};

function cleanAddress(address: string) {
  return String(address || "")
    .replace(/[\r\n]+/g, ", ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/,{2,}/g, ",")
    .trim()
    .replace(/^,+|,+$/g, "");
}

function normalisePostcode(value: string) {
  return String(value || "").toUpperCase().replace(/\s+/g, "").trim();
}

function tryExtractPostcode(address: string) {
  const match = cleanAddress(address).match(
    /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i
  );
  return match ? match[1].toUpperCase().replace(/\s+/g, " ").trim() : "";
}

function isLikelyUkCoordinate(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= UK_BOUNDS.minLat &&
    lat <= UK_BOUNDS.maxLat &&
    lng >= UK_BOUNDS.minLng &&
    lng <= UK_BOUNDS.maxLng
  );
}

function asResult(lat: unknown, lng: unknown): GeocodeResult | null {
  const nextLat = Number(lat);
  const nextLng = Number(lng);

  if (!isLikelyUkCoordinate(nextLat, nextLng)) {
    return null;
  }

  return { lat: nextLat, lng: nextLng };
}

async function geocodeWithPostcodesIo(
  postcode: string
): Promise<GeocodeResult | null> {
  const normalized = normalisePostcode(postcode);
  if (!normalized) return null;

  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(normalized)}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return null;

  const json = await res.json().catch(() => null);
  return asResult(json?.result?.latitude, json?.result?.longitude);
}

async function geocodeWithOpenRouteService(
  address: string
): Promise<GeocodeResult | null> {
  const apiKey = String(process.env.ORS_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const url =
    "https://api.openrouteservice.org/geocode/search?" +
    new URLSearchParams({
      api_key: apiKey,
      text: address,
      size: "1",
      boundary_country: "GB",
    }).toString();

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return null;

  const json = await res.json().catch(() => null);
  const feature = json?.features?.[0];
  const coords = feature?.geometry?.coordinates;

  if (!Array.isArray(coords) || coords.length < 2) return null;

  return asResult(coords[1], coords[0]);
}

async function geocodeWithNominatim(
  address: string
): Promise<GeocodeResult | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: address,
      format: "jsonv2",
      limit: "1",
      countrycodes: "gb",
      addressdetails: "1",
    }).toString();

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "anns-crane-crm/1.0",
    },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return null;

  const json = await res.json().catch(() => null);
  const item = Array.isArray(json) ? json[0] : null;

  return asResult(item?.lat, item?.lon);
}

async function geocodeFreeText(address: string): Promise<GeocodeResult | null> {
  const attempts = Array.from(
    new Set(
      [
        cleanAddress(address),
        cleanAddress(address).includes("United Kingdom")
          ? cleanAddress(address)
          : `${cleanAddress(address)}, United Kingdom`,
      ].filter(Boolean)
    )
  );

  for (const attempt of attempts) {
    const ors = await geocodeWithOpenRouteService(attempt);
    if (ors) return ors;

    const nominatim = await geocodeWithNominatim(attempt);
    if (nominatim) return nominatim;
  }

  return null;
}

export async function geocodeAddress(
  rawAddress: string
): Promise<GeocodeResult | null> {
  const address = cleanAddress(rawAddress);
  if (!address) return null;

  const postcodeOnly = tryExtractPostcode(address);

  if (postcodeOnly) {
    const postcodeResult = await geocodeWithPostcodesIo(postcodeOnly);
    if (postcodeResult) return postcodeResult;

    const postcodeFallback = await geocodeFreeText(postcodeOnly);
    if (postcodeFallback) return postcodeFallback;
  }

  return geocodeFreeText(address);
}
