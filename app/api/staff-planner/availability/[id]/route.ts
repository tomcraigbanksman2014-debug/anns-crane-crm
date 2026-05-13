import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/apiAuth";
import { defaultBlocksAssignment } from "../../../../lib/staffAvailability";
import { countWorkingDaysInclusive } from "../../../../lib/workingDays";

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
  return null;
}

function boolValue(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

function parsePersonKey(value: unknown) {
  const raw = String(value ?? "").trim();
  const [type, id] = raw.split(":");
  if (type === "office") return { personType: "office", id: clean(id) };
  if (type === "operator") return { personType: "operator", id: clean(id) };
  return { personType: "operator", id: clean(raw) };
}

async function resolveAvailabilityPerson(supabase: any, body: any, existing: any) {
  if (body.person_key === undefined && body.staff_key === undefined && body.operator_id === undefined && body.staff_member_id === undefined) {
    return {
      person_type: clean(existing.person_type) ?? (existing.staff_member_id ? "office" : "operator"),
      operator_id: existing.operator_id ?? null,
      staff_member_id: existing.staff_member_id ?? null,
    };
  }

  const parsed = parsePersonKey(body.person_key ?? body.staff_key ?? body.operator_id);

  if (parsed.personType === "office") {
    let staffMemberId = clean(body.staff_member_id) ?? parsed.id;
    const officeStaffName = clean(body.office_staff_name) ?? clean(body.staff_member_name);

    if (!staffMemberId || staffMemberId === "new") {
      if (!officeStaffName) throw new Error("Office staff name is required.");

      const { data, error } = await supabase
        .from("staff_planner_people")
        .insert({
          full_name: officeStaffName,
          staff_type: "office",
          archived: false,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      staffMemberId = data?.id ?? null;
    }

    if (!staffMemberId) throw new Error("Office staff member is required.");
    return { person_type: "office", operator_id: null, staff_member_id: staffMemberId };
  }

  const operatorId = clean(body.operator_id) ?? parsed.id;
  if (!operatorId) throw new Error("Staff member is required.");
  return { person_type: "operator", operator_id: operatorId, staff_member_id: null };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

    const { data: existing, error: existingError } = await supabase
      .from("operator_availability")
      .select("*")
      .eq("id", params.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "Availability entry not found." }, { status: 404 });
    }

    const status = cleanStatus(body.status) ?? String(existing.status ?? "holiday");
    const person = await resolveAvailabilityPerson(supabase, body, existing);
    const payload = {
      operator_id: person.operator_id,
      staff_member_id: person.staff_member_id,
      person_type: person.person_type,
      start_date: body.start_date !== undefined ? clean(body.start_date) : existing.start_date,
      end_date: body.end_date !== undefined ? clean(body.end_date) : existing.end_date,
      start_time: body.start_time !== undefined ? clean(body.start_time) : existing.start_time,
      end_time: body.end_time !== undefined ? clean(body.end_time) : existing.end_time,
      status,
      notes: body.notes !== undefined ? clean(body.notes) : existing.notes,
      blocks_assignment: boolValue(
        body.blocks_assignment,
        typeof existing.blocks_assignment === "boolean" ? existing.blocks_assignment : defaultBlocksAssignment(status)
      ),
      working_day_count: null as number | null,
      updated_at: new Date().toISOString(),
    };

    if (!payload.operator_id && !payload.staff_member_id) return NextResponse.json({ error: "Staff member is required." }, { status: 400 });
    if (!payload.start_date) return NextResponse.json({ error: "Start date is required." }, { status: 400 });
    if (!payload.end_date) payload.end_date = payload.start_date;
    if (payload.end_date < payload.start_date) {
      return NextResponse.json({ error: "End date cannot be earlier than start date." }, { status: 400 });
    }

    payload.working_day_count = status === "holiday" ? countWorkingDaysInclusive(payload.start_date, payload.end_date) : null;

    const { data, error } = await supabase
      .from("operator_availability")
      .update(payload)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, entry: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not update availability entry." }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const { error } = await supabase.from("operator_availability").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not delete availability entry." }, { status: 400 });
  }
}
