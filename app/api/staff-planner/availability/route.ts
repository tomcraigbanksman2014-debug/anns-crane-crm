import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/apiAuth";
import { defaultBlocksAssignment } from "../../../../lib/staffAvailability";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function cleanStatus(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "available" ||
    raw === "holiday" ||
    raw === "training" ||
    raw === "sick" ||
    raw === "day_off" ||
    raw === "unavailable" ||
    raw === "other"
  ) {
    return raw;
  }
  return "holiday";
}

function boolValue(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

export async function POST(req: Request) {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const operatorId = clean(body.operator_id);
    const startDate = clean(body.start_date);
    const endDate = clean(body.end_date) ?? startDate;
    const startTime = clean(body.start_time);
    const endTime = clean(body.end_time);
    const status = cleanStatus(body.status);
    const notes = clean(body.notes);
    const blocksAssignment = boolValue(body.blocks_assignment, defaultBlocksAssignment(status));

    if (!operatorId) return NextResponse.json({ error: "Operator is required." }, { status: 400 });
    if (!startDate) return NextResponse.json({ error: "Start date is required." }, { status: 400 });
    if (!endDate) return NextResponse.json({ error: "End date is required." }, { status: 400 });
    if (endDate < startDate) {
      return NextResponse.json({ error: "End date cannot be earlier than start date." }, { status: 400 });
    }

    const payload = {
      operator_id: operatorId,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      status,
      notes,
      blocks_assignment: blocksAssignment,
      created_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("operator_availability")
      .insert(payload)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, entry: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not create availability entry." }, { status: 400 });
  }
}
