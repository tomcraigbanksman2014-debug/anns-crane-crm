import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { getAccessContext } from "../../lib/access";
import { isMasterAdminEmail } from "../../lib/admin";
import { writeAuditLog } from "../../lib/audit";

const VALID_CATEGORIES = new Set([
  "trailer",
  "vehicle",
  "crane",
  "mats",
  "attachment",
  "rigging_gear",
  "plant_equipment",
  "other",
]);

const VALID_ASSET_TYPES = new Set(["equipment", "vehicle", "crane", "other"]);

const VALID_OWNERSHIP = new Set([
  "owned",
  "hired_in",
  "subcontractor_supplied",
  "customer_supplied",
  "unknown",
]);

const VALID_STATUSES = new Set([
  "in_yard",
  "dropped_on_site",
  "on_job",
  "in_transit",
  "at_supplier_repair",
  "with_subcontractor",
  "unknown",
]);

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function cleanUuid(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function cleanNumber(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function cleanDateTime(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function inferAssetType(category: string, requestedAssetType: string | null) {
  if (requestedAssetType && VALID_ASSET_TYPES.has(requestedAssetType)) return requestedAssetType;
  if (category === "trailer" || category === "vehicle") return "vehicle";
  if (category === "crane") return "crane";
  if (category === "mats" || category === "attachment" || category === "rigging_gear" || category === "plant_equipment") {
    return "equipment";
  }
  return "other";
}

async function readAssetLabel(args: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  assetType: string;
  assetId: string | null;
  fallbackLabel: string | null;
}) {
  if (!args.assetId) return args.fallbackLabel || "Other asset";

  if (args.assetType === "equipment") {
    const { data } = await args.admin
      .from("equipment")
      .select("name, asset_number, type")
      .eq("id", args.assetId)
      .maybeSingle();

    return [data?.name, data?.asset_number, data?.type].filter(Boolean).join(" • ") || args.fallbackLabel || "Equipment";
  }

  if (args.assetType === "vehicle") {
    const { data } = await args.admin
      .from("vehicles")
      .select("name, reg_number, vehicle_type")
      .eq("id", args.assetId)
      .maybeSingle();

    return [data?.name, data?.reg_number, data?.vehicle_type].filter(Boolean).join(" • ") || args.fallbackLabel || "Vehicle";
  }

  if (args.assetType === "crane") {
    const { data } = await args.admin
      .from("cranes")
      .select("name, reg_number, fleet_number, capacity")
      .eq("id", args.assetId)
      .maybeSingle();

    return [data?.name, data?.reg_number, data?.fleet_number, data?.capacity].filter(Boolean).join(" • ") || args.fallbackLabel || "Crane";
  }

  return args.fallbackLabel || "Other asset";
}

async function requireMasterAdmin() {
  const access = await getAccessContext();
  const email = String(access.user?.email ?? "").trim().toLowerCase();

  if (!access.user) {
    return { access, error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  if (!isMasterAdminEmail(email)) {
    return { access, error: NextResponse.json({ error: "Asset locations are restricted to master admin while testing." }, { status: 403 }) };
  }

  return { access, error: null };
}

export async function POST(req: Request) {
  try {
    const { access, error: accessError } = await requireMasterAdmin();
    if (accessError) return accessError;

    const body = await req.json().catch(() => ({}));
    const admin = createSupabaseAdminClient();

    const assetCategory = String(body?.asset_category ?? "other").trim().toLowerCase();
    const requestedAssetType = clean(body?.asset_type)?.toLowerCase() ?? null;
    const assetType = inferAssetType(assetCategory, requestedAssetType);
    const assetId = cleanUuid(body?.asset_id);
    const fallbackAssetLabel = clean(body?.asset_label);
    const ownershipType = String(body?.ownership_type ?? "owned").trim().toLowerCase();
    const status = String(body?.status ?? "unknown").trim().toLowerCase();

    if (!VALID_CATEGORIES.has(assetCategory)) {
      return NextResponse.json({ error: "Choose a valid asset category." }, { status: 400 });
    }

    if (!VALID_ASSET_TYPES.has(assetType)) {
      return NextResponse.json({ error: "Choose a valid asset source." }, { status: 400 });
    }

    if (!VALID_OWNERSHIP.has(ownershipType)) {
      return NextResponse.json({ error: "Choose a valid ownership type." }, { status: 400 });
    }

    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Choose a valid location status." }, { status: 400 });
    }

    if (assetType !== "other" && !assetId && !fallbackAssetLabel) {
      return NextResponse.json({ error: "Choose an existing asset or type the asset name manually." }, { status: 400 });
    }

    if (assetType === "other" && !fallbackAssetLabel) {
      return NextResponse.json({ error: "Enter the asset name." }, { status: 400 });
    }

    const assetLabel = await readAssetLabel({
      admin,
      assetType,
      assetId,
      fallbackLabel: fallbackAssetLabel,
    });

    const latitude = cleanNumber(body?.latitude);
    const longitude = cleanNumber(body?.longitude);

    if ((latitude === null) !== (longitude === null)) {
      return NextResponse.json({ error: "Enter both latitude and longitude, or leave both blank." }, { status: 400 });
    }

    if (latitude !== null && (latitude < -90 || latitude > 90)) {
      return NextResponse.json({ error: "Latitude must be between -90 and 90." }, { status: 400 });
    }

    if (longitude !== null && (longitude < -180 || longitude > 180)) {
      return NextResponse.json({ error: "Longitude must be between -180 and 180." }, { status: 400 });
    }

    const payload = {
      asset_category: assetCategory,
      asset_type: assetType,
      asset_id: assetId,
      asset_label: assetLabel,
      ownership_type: ownershipType,
      status,
      location_name: clean(body?.location_name),
      address: clean(body?.address),
      postcode: clean(body?.postcode),
      what3words: clean(body?.what3words)?.replace(/^\/+/, "") ?? null,
      latitude,
      longitude,
      linked_job_id: cleanUuid(body?.linked_job_id),
      linked_transport_job_id: cleanUuid(body?.linked_transport_job_id),
      moved_by_vehicle_id: cleanUuid(body?.moved_by_vehicle_id),
      moved_by_operator_id: cleanUuid(body?.moved_by_operator_id),
      event_time: cleanDateTime(body?.event_time) || new Date().toISOString(),
      collection_due_at: cleanDateTime(body?.collection_due_at),
      notes: clean(body?.notes),
      photo_url: clean(body?.photo_url),
      created_by_user_id: access.user.id,
      created_by_username: fromAuthEmail(access.user.email ?? null) || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("asset_location_events")
      .insert([payload])
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: access.user.id,
      actor_username: fromAuthEmail(access.user.email ?? null) || null,
      action: "asset_location_event_created",
      entity_type: "asset_location_event",
      entity_id: data?.id ?? null,
      meta: {
        asset_category: assetCategory,
        asset_type: assetType,
        asset_id: assetId,
        asset_label: assetLabel,
        ownership_type: ownershipType,
        status,
        location_name: payload.location_name,
        postcode: payload.postcode,
        linked_job_id: payload.linked_job_id,
        linked_transport_job_id: payload.linked_transport_job_id,
      },
    });

    return NextResponse.json({ ok: true, event: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not save asset location." },
      { status: 500 }
    );
  }
}
