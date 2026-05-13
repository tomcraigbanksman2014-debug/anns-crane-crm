import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { defaultBlocksAssignment } from "../../../lib/staffAvailability";
import { countWorkingDaysInclusive } from "../../../lib/workingDays";

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

function parsePersonKey(value: unknown) {
  const raw = String(value ?? "").trim();
  const [type, id] = raw.split(":");
  if (type === "office") return { personType: "office", id: clean(id) };
  if (type === "operator") return { personType: "operator", id: clean(id) };
  return { personType: "operator", id: clean(raw) };
}

async function resolveAvailabilityPerson(supabase: any, body: any) {
  const parsed = parsePersonKey(body.person_key ?? body.staff_key ?? body.operator_id);

  if (parsed.personType === "office") {
    let staffMemberId = clean(body.staff_member_id) ?? parsed.id;
    const officeStaffName = clean(body.office_staff_name) ?? clean(body.staff_member_name);

    if (!staffMemberId || staffMemberId === "new") {
      if (!officeStaffName) {
        throw new Error("Office staff name is required.");
      }

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

export async function POST(req: Request) {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const person = await resolveAvailabilityPerson(supabase, body);
    const startDate = clean(body.start_date);
    const endDate = clean(body.end_date) ?? startDate;
    const startTime = clean(body.start_time);
    const endTime = clean(body.end_time);
    const status = cleanStatus(body.status);
    const notes = clean(body.notes);
    const blocksAssignment = boolValue(body.blocks_assignment, defaultBlocksAssignment(status));

    if (!startDate) return NextResponse.json({ error: "Start date is required." }, { status: 400 });
    if (!endDate) return NextResponse.json({ error: "End date is required." }, { status: 400 });
    if (endDate < startDate) {
      return NextResponse.json({ error: "End date cannot be earlier than start date." }, { status: 400 });
    }

    const payload = {
      operator_id: person.operator_id,
      staff_member_id: person.staff_member_id,
      person_type: person.person_type,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      status,
      notes,
      blocks_assignment: blocksAssignment,
      working_day_count: status === "holiday" ? countWorkingDaysInclusive(startDate, endDate) : null,
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
