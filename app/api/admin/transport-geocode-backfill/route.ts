import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { geocodeAddress } from "../../../lib/geocode";

function clean(value: any) {
  return String(value ?? "").trim();
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

export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = auth.supabase;

    const { data: rows, error } = await supabase
      .from("transport_jobs")
      .select(`
        id,
        collection_address,
        delivery_address,
        collection_lat,
        collection_lng,
        delivery_lat,
        delivery_lng
      `)
      .or(
        [
          "collection_lat.is.null",
          "collection_lng.is.null",
          "delivery_lat.is.null",
          "delivery_lng.is.null",
        ].join(",")
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    let updated = 0;
    let skipped = 0;
    const failures: Array<{ id: string; reason: string }> = [];

    for (const row of rows ?? []) {
      const pickupAddress = clean((row as any).collection_address);
      const deliveryAddress = clean((row as any).delivery_address);

      const currentPickupOk =
        (row as any).collection_lat != null && (row as any).collection_lng != null;

      const currentDeliveryOk =
        (row as any).delivery_lat != null && (row as any).delivery_lng != null;

      const pickupCoords =
        !currentPickupOk && pickupAddress ? await geocodeAddress(pickupAddress) : null;

      const deliveryCoords =
        !currentDeliveryOk && deliveryAddress ? await geocodeAddress(deliveryAddress) : null;

      const nextCollectionLat =
        currentPickupOk ? (row as any).collection_lat : pickupCoords?.lat ?? null;
      const nextCollectionLng =
        currentPickupOk ? (row as any).collection_lng : pickupCoords?.lng ?? null;

      const nextDeliveryLat =
        currentDeliveryOk ? (row as any).delivery_lat : deliveryCoords?.lat ?? null;
      const nextDeliveryLng =
        currentDeliveryOk ? (row as any).delivery_lng : deliveryCoords?.lng ?? null;

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
      failures,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
