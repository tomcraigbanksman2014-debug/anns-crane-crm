export async function geocodeAddress(address: string) {

  if (!address) return null;

  try {

    const url =
      "https://nominatim.openstreetmap.org/search?format=json&q=" +
      encodeURIComponent(address);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "anns-crane-crm"
      }
    });

    const data = await res.json();

    if (!data || data.length === 0) return null;

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon)
    };

  } catch (error) {

    console.error("Geocode failed", error);
    return null;

  }
}
