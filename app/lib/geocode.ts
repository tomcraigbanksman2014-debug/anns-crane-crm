import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { geocodeAddress } from "../../../lib/geocode";

const UK_BOUNDS = {
  minLat: 49.5,
  maxLat: 61.5,
  minLng: -8.8,
  maxLng: 2.5,
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasUkPostcode(value: string) {
  return /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i.test(clean(value));
}

function isLikelyUkCoordinate(lat: any, lng: any) {
  const nextLat = toNumber(lat);
  const nextLng = toNumber(lng);

  return (
    nextLat !== null &&
    nextLng !== null &&
    nextLat >= UK_BOUNDS.minLat &&
    nextLat <= UK_BOUNDS.maxLat &&
    nextLng >= UK_BOUNDS.minLng &&
    nextLng <= UK_BOUNDS.maxLng
  );
}

function shouldRefreshPoint(address: string, lat: any, lng: any) {
  if (toNumber(lat) === null || toNumber(lng) === null) return true;
  if (hasUkPostcode(address) && !isLikelyUkCoordinate(lat, lng)) return true;
  return false;
}

async function requireAdmin() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: "Not signed in", status: 401 };
  }

  const role = String((user.user_metadata as any)?.role ?? "").toLowerCase();
  const email = String(user.email ?? "").toLowerCase();
  const masterAdminEmail = String(process.env.MASTER_ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();

  if (role !== "admin" && email !== masterAdminEmail) {
    return { ok: false as const, error: "Admin only", status: 403 };
  }

  return { ok: true as const, supabase };
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = auth.supabase;
    const body = await req.json().catch(() => null);
    const force = body?.force !== false;

    const { data: rows, error } = await supabase
      .from("transport_jobs")
      .select(`
        id,
        collection_address,
        delivery_address,
        collection_lat,
        collection_lng,
        delivery_lat,
        delivery_lng,
        created_at
      `)
      .order("created_at", { ascending: false })
      .limit(force ? 1000 : 500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    let updated = 0;
    let skipped = 0;
    const failures: Array<{ id: string; reason: string }> = [];

    for (const row of rows ?? []) {
      const pickupAddress = clean((row as any).collection_address);
      const deliveryAddress = clean((row as any).delivery_address);

      const refreshPickup =
        !!pickupAddress &&
        (force ||
          shouldRefreshPoint(
            pickupAddress,
            (row as any).collection_lat,
            (row as any).collection_lng
          ));

      const refreshDelivery =
        !!deliveryAddress &&
        (force ||
          shouldRefreshPoint(
            deliveryAddress,
            (row as any).delivery_lat,
            (row as any).delivery_lng
          ));

      if (!refreshPickup && !refreshDelivery) {
        skipped += 1;
        continue;
      }

      const pickupCoords = refreshPickup
        ? await geocodeAddress(pickupAddress)
        : null;
      const deliveryCoords = refreshDelivery
        ? await geocodeAddress(deliveryAddress)
        : null;

      const nextCollectionLat = refreshPickup
        ? pickupCoords?.lat ?? null
        : (row as any).collection_lat;
      const nextCollectionLng = refreshPickup
        ? pickupCoords?.lng ?? null
        : (row as any).collection_lng;

      const nextDeliveryLat = refreshDelivery
        ? deliveryCoords?.lat ?? null
        : (row as any).delivery_lat;
      const nextDeliveryLng = refreshDelivery
        ? deliveryCoords?.lng ?? null
        : (row as any).delivery_lng;

      const changed =
        nextCollectionLat !== (row as any).collection_lat ||
        nextCollectionLng !== (row as any).collection_lng ||
        nextDeliveryLat !== (row as any).delivery_lat ||
        nextDeliveryLng !== (row as any).delivery_lng;

      if (!changed) {
        skipped += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from("transport_jobs")
        .update({
          collection_lat: nextCollectionLat,
          collection_lng: nextCollectionLng,
          delivery_lat: nextDeliveryLat,
          delivery_lng: nextDeliveryLng,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (row as any).id);

      if (updateError) {
        failures.push({
          id: String((row as any).id),
          reason: updateError.message,
        });
        continue;
      }

      updated += 1;
    }

    return NextResponse.json({
      success: true,
      checked: (rows ?? []).length,
      updated,
      skipped,
      force,
      failures,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
