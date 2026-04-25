import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";

const LOG_TYPES = new Set([
  "general",
  "issue",
  "maintenance",
  "breakdown",
  "defect",
  "delay",
  "yard",
  "vehicle",
  "crane",
  "transport",
  "job",
  "other",
]);

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function normaliseType(value: unknown) {
  const type = String(value ?? "general").trim().toLowerCase();
  return LOG_TYPES.has(type) ? type : "general";
}

function normaliseBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on";
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => null);
    const updates: Record<string, any> = {};

    if (Object.prototype.hasOwnProperty.call(body ?? {}, "log_date")) updates.log_date = clean(body?.log_date);
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "log_time")) updates.log_time = clean(body?.log_time);
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "log_type")) updates.log_type = normaliseType(body?.log_type);
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "title")) updates.title = clean(body?.title);
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "notes")) updates.notes = clean(body?.notes);
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "linked_job_id")) updates.linked_job_id = clean(body?.linked_job_id);
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "linked_transport_job_id")) updates.linked_transport_job_id = clean(body?.linked_transport_job_id);
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "linked_operator_id")) updates.linked_operator_id = clean(body?.linked_operator_id);
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "linked_vehicle_id")) updates.linked_vehicle_id = clean(body?.linked_vehicle_id);
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "linked_crane_id")) updates.linked_crane_id = clean(body?.linked_crane_id);
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "linked_equipment_id")) updates.linked_equipment_id = clean(body?.linked_equipment_id);

    if (Object.prototype.hasOwnProperty.call(body ?? {}, "resolved")) {
      const resolved = normaliseBool(body?.resolved);
      updates.resolved = resolved;
      updates.resolved_at = resolved ? new Date().toISOString() : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No changes supplied." }, { status: 400 });
    }

    if (Object.prototype.hasOwnProperty.call(updates, "notes") && !updates.notes) {
      return NextResponse.json({ error: "Notes are required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("daily_log_entries")
      .update(updates)
      .eq("id", params.id)
      .select("id")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Daily log entry not found." }, { status: 404 });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not update daily log entry." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const { error } = await supabase
      .from("daily_log_entries")
      .delete()
      .eq("id", params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not delete daily log entry." }, { status: 500 });
  }
}
