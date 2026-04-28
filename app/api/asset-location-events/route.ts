import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { writeAuditLog } from "../../lib/audit";
import { getAccessContext } from "../../lib/access";

const VALID_ASSET_CATEGORIES = new Set([
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

const VALID_OWNERSHIP_TYPES = new Set([
  "owned",
  "hired_in",
  "subcontractor_supplied",
  "customer_supplied",
  "unknown",
]);

const VALID_STATUSES = new Set([
  "in_yard",
  "on_job",
  "dropped_on_site",
  "in_transit",
  "with_subcontractor",
  "at_supplier_repair",
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

function cleanDateTime(value: unknown) {
  const text = clean(value);
  if (!text) return null;

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString();
}

function cleanNumber(value: unknown) {
  const text = clean(value);
  if (!text) return null;

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
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

    const access = await getAccessContext();

    if (access.role !== "admin" && access.role !== "staff") {
      return NextResponse.json({ error: "Office access required." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const admin = createSupabaseAdminClient();

    const assetCategory = String(body?.asset_category ?? "other").trim().toLowerCase();
    const assetType = String(body?.asset_type ?? "other").trim().toLowerCase();
    const ownershipType = String(body?.ownership_type ?? "unknown").trim().toLowerCase();
    const status = String(body?.status ?? "unknown").trim().toLowerCase();

    const assetId = cleanUuid(body?.asset_id);
    const fallbackAssetLabel = clean(body?.asset_label);

    if (!VALID_ASSET_CATEGORIES.has(assetCategory)) {
      return NextResponse.json({ error: "Choose a valid asset category." }, { status: 400 });
    }

    if (!VALID_ASSET_TYPES.has(assetType)) {
      return NextResponse.json({ error: "Choose a valid asset type." }, { status: 400 });
    }

    if (!VALID_OWNERSHIP_TYPES.has(ownershipType)) {
      return NextResponse.json({ error: "Choose a valid ownership type." }, { status: 400 });
    }

    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Choose a valid location status." }, { status: 400 });
    }

    if (assetType !== "other" && !assetId && !fallbackAssetLabel) {
      return NextResponse.json({ error: "Choose the asset or type the asset name manually." }, { status: 400 });
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

    const payload = {
      asset_category: assetCategory,
      asset_type: assetType,
      asset_id: assetId,
      asset_label: assetLabel,

      ownership_type: ownershipType,
      owner_company_name: clean(body?.owner_company_name),
      owner_contact_name: clean(body?.owner_contact_name),
      owner_phone: clean(body?.owner_phone),
      owner_email: clean(body?.owner_email),
      owner_reference: clean(body?.owner_reference),

      status,
      location_name: clean(body?.location_name),
      address: clean(body?.address),
      postcode: clean(body?.postcode),
      what3words: clean(body?.what3words),
      latitude: cleanNumber(body?.latitude),
      longitude: cleanNumber(body?.longitude),

      linked_job_id: cleanUuid(body?.linked_job_id),
      linked_transport_job_id: cleanUuid(body?.linked_transport_job_id),
      moved_by_vehicle_id: cleanUuid(body?.moved_by_vehicle_id),
      moved_by_operator_id: cleanUuid(body?.moved_by_operator_id),

      event_time: cleanDateTime(body?.event_time) || new Date().toISOString(),
      collection_due_at: cleanDateTime(body?.collection_due_at),

      notes: clean(body?.notes),

      created_by_user_id: user.id,
      created_by_username: fromAuthEmail(user.email ?? null) || null,
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
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "asset_location_event_created",
      entity_type: "asset_location_event",
      entity_id: data?.id ?? null,
      meta: {
        asset_category: assetCategory,
        asset_type: assetType,
        asset_id: assetId,
        asset_label: assetLabel,
        ownership_type: ownershipType,
        owner_company_name: payload.owner_company_name,
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
