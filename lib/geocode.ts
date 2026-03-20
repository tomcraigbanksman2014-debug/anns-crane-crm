export type GeocodeResult = {
  lat: number;
  lng: number;
};

function cleanAddress(address: string) {
  return String(address || "")
    .replace(/\s+/g, " ")
    .trim();
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
  });

  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  const feature = json?.features?.[0];

  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const lng = Number(coords[0]);
  const lat = Number(coords[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
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
    }).toString();

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "anns-crane-crm/1.0",
    },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  const item = Array.isArray(json) ? json[0] : null;

  const lat = Number(item?.lat);
  const lng = Number(item?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

function tryExtractPostcode(address: string) {
  const match = cleanAddress(address).match(
    /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i
  );
  return match ? match[1].toUpperCase() : "";
}

export async function geocodeAddress(
  rawAddress: string
): Promise<GeocodeResult | null> {
  const address = cleanAddress(rawAddress);
  if (!address) return null;

  const postcodeOnly = tryExtractPostcode(address);

  const attempts = [
    address,
    postcodeOnly,
  ].filter(Boolean);

  for (const attempt of attempts) {
    const ors = await geocodeWithOpenRouteService(attempt);
    if (ors) return ors;

    const nominatim = await geocodeWithNominatim(attempt);
    if (nominatim) return nominatim;
  }

  return null;
}
