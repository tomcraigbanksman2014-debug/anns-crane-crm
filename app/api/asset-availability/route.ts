import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/apiAuth";
import { normaliseAssetAvailabilityRow } from "../../lib/assetAvailability";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function isIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isTime(value: string | null) {
  return !value || /^\d{2}:\d{2}$/.test(value);
}

function normaliseStatus(value: unknown) {
  const raw = String(value ?? "maintenance").trim().toLowerCase();
  const allowed = new Set(["maintenance", "mot", "service", "inspection", "repair", "breakdown", "unavailable", "other"]);
  return allowed.has(raw) ? raw : "maintenance";
}

export async function POST(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => ({}));

    const assetType = clean(body?.asset_type);
    const assetId = clean(body?.asset_id);
    const startDate = clean(body?.start_date);
    const endDate = clean(body?.end_date) ?? startDate;
    const startTime = clean(body?.start_time);
    const endTime = clean(body?.end_time);
    const status = normaliseStatus(body?.status);
    const notes = clean(body?.notes);
    const blocksAssignment = body?.blocks_assignment !== false;

    if (assetType !== "crane" && assetType !== "vehicle") {
      return NextResponse.json({ error: "Asset type must be crane or vehicle." }, { status: 400 });
    }

    if (!assetId) {
      return NextResponse.json({ error: "Asset id is required." }, { status: 400 });
    }

    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return NextResponse.json({ error: "Start and end dates are required." }, { status: 400 });
    }

    if (String(endDate) < String(startDate)) {
      return NextResponse.json({ error: "End date cannot be before start date." }, { status: 400 });
    }

    if (!isTime(startTime) || !isTime(endTime)) {
      return NextResponse.json({ error: "Times must use HH:MM format." }, { status: 400 });
    }

    const assetTable = assetType === "crane" ? "cranes" : "vehicles";
    const { data: asset, error: assetError } = await supabase
      .from(assetTable)
      .select("id")
      .eq("id", assetId)
      .maybeSingle();

    if (assetError) {
      return NextResponse.json({ error: assetError.message }, { status: 400 });
    }

    if (!asset) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("asset_availability")
      .insert({
        asset_type: assetType,
        asset_id: assetId,
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        status,
        notes,
        blocks_assignment: blocksAssignment,
      })
      .select("id, asset_type, asset_id, start_date, end_date, start_time, end_time, status, notes, blocks_assignment, created_at, updated_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Could not add asset downtime." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, entry: normaliseAssetAvailabilityRow(data) });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not add asset downtime." },
      { status: 400 }
    );
  }
}
