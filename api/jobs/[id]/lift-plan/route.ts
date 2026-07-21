import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanText(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function cleanBool(value: unknown) {
  return value === true;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("lift_plans")
      .select("*")
      .eq("job_id", params.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data ?? null);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load lift plan." },
      { status: 400 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const { data: existing, error: existingError } = await supabase
      .from("lift_plans")
      .select("id, paperwork_locked")
      .eq("job_id", params.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (existing?.paperwork_locked) {
      return NextResponse.json(
        { error: "Paperwork is locked and can no longer be edited." },
        { status: 403 }
      );
    }

    const payload = {
      job_id: params.id,
      load_description: cleanText(body.load_description),
      load_weight: cleanNumber(body.load_weight),
      lift_radius: cleanNumber(body.lift_radius),
      lift_height: cleanNumber(body.lift_height),
      crane_configuration: cleanText(body.crane_configuration),
      outrigger_setup: cleanText(body.outrigger_setup),
      ground_conditions: cleanText(body.ground_conditions),
      sling_type: cleanText(body.sling_type),
      lifting_accessories: cleanText(body.lifting_accessories),
      method_statement: cleanText(body.method_statement),
      risk_assessment: cleanText(body.risk_assessment),
      site_hazards: cleanText(body.site_hazards),
      control_measures: cleanText(body.control_measures),
      ppe_required: cleanText(body.ppe_required),
      exclusion_zone_details: cleanText(body.exclusion_zone_details),
      weather_limitations: cleanText(body.weather_limitations),
      emergency_procedures: cleanText(body.emergency_procedures),
      lift_supervisor: cleanText(body.lift_supervisor),
      appointed_person: cleanText(body.appointed_person),
      crane_operator: cleanText(body.crane_operator),
      rams_complete: cleanBool(body.rams_complete),
      lift_plan_complete: cleanBool(body.lift_plan_complete),
      approved_by: cleanText(body.approved_by),
      approved_at: body.approved_at ? new Date(body.approved_at).toISOString() : null,
      approval_notes: cleanText(body.approval_notes),
      customer_signed_by: cleanText(body.customer_signed_by),
      operator_signed_by: cleanText(body.operator_signed_by),
      office_signed_by: cleanText(body.office_signed_by),
      finalised_at: body.finalised_at ? new Date(body.finalised_at).toISOString() : null,
      paperwork_locked: cleanBool(body.paperwork_locked),
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("lift_plans")
        .update(payload)
        .eq("job_id", params.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "update",
        entity_type: "lift_plan",
        entity_id: existing.id,
        meta: { job_id: params.id },
      });
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("lift_plans")
        .insert({
          ...payload,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "create",
        entity_type: "lift_plan",
        entity_id: inserted.id,
        meta: { job_id: params.id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not save lift plan." },
      { status: 400 }
    );
  }
}
