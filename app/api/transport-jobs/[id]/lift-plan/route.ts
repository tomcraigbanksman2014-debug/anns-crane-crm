import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";
import { calculateHiabTechnicalSections } from "../../../../lib/liftPlanTechnicalValidation";
import { liftDrawingApprovalErrors } from "../../../../lib/liftDrawingValidation";

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

function cleanPackSections(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (item === null || item === undefined) return [key, null];
      if (typeof item === "number" || typeof item === "boolean") return [key, item];
      const normalised = String(item).trim();
      return [key, normalised.length ? normalised : null];
    })
  );
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("transport_lift_plans")
      .select("*")
      .eq("transport_job_id", params.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data ?? null);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load transport lift plan." },
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
      .from("transport_lift_plans")
      .select("id, paperwork_locked, pack_sections")
      .eq("transport_job_id", params.id)
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

    const mergedPackSections = {
      ...((existing?.pack_sections as Record<string, unknown> | null) ?? {}),
      ...cleanPackSections(body.pack_sections),
    };

    const technical = calculateHiabTechnicalSections({
      profileId: cleanText(mergedPackSections.hiab_profile_id),
      profileTitle: cleanText(mergedPackSections.hiab_profile_title),
      setupLabel: cleanText(mergedPackSections.hiab_verified_configuration),
      sourceLabel: cleanText(mergedPackSections.hiab_chart_source),
      loadWeightKg: cleanNumber(body.load_weight),
      radiusM: cleanNumber(body.lift_radius),
      sections: mergedPackSections,
    });

    const completionRequested = cleanBool(body.paperwork_locked) || cleanBool(body.lift_plan_complete) || Boolean(body.approved_at);
    const drawingErrors = completionRequested
      ? liftDrawingApprovalErrors(technical.sections.lift_drawing_model_json, {
          loadDescription: cleanText(body.load_description),
          loadWeightKg: technical.loadWeightKg,
          accessoryWeightKg: technical.accessoryWeightKg,
          grossLiftedWeightKg: technical.totalLiftedWeightKg,
          radiusM: technical.radiusM,
          boomLengthM: cleanNumber(technical.sections.hiab_boom_length_m),
          boomAngleDeg: cleanNumber(technical.sections.hiab_boom_angle_deg),
          hookHeightM: cleanNumber(body.lift_height),
          chartCapacityKg: technical.capacityKg,
          chartSource: technical.capacitySource,
          chartPage: cleanText(technical.sections.hiab_chart_page),
          utilisationPercent: technical.utilisationPercent,
          exactConfiguration: technical.selectedSetup,
          stabiliserSetup: cleanText(technical.sections.hiab_stabiliser_position),
          workingSector: cleanText(technical.sections.hiab_working_sector),
          operatingWeightKg: technical.vehicleOperatingWeightKg,
          groundPressureKgM2: technical.pressureKgM2,
          matLengthM: technical.matLengthM,
          matWidthM: technical.matWidthM,
          liftingAccessories: cleanText(body.lifting_accessories),
          siteHazards: cleanText(body.site_hazards),
          controlMeasures: cleanText(body.control_measures),
        })
      : [];
    const approvalErrors = Array.from(new Set([...technical.errors, ...drawingErrors]));
    if (completionRequested && approvalErrors.length) {
      return NextResponse.json(
        { error: `HIAB lift plan cannot be approved or finalised: ${approvalErrors.join(" ")}` },
        { status: 400 }
      );
    }

    const payload = {
      transport_job_id: params.id,
      job_summary: cleanText(body.job_summary),
      load_description: cleanText(body.load_description),
      load_weight: cleanNumber(body.load_weight),
      lift_radius: cleanNumber(body.lift_radius),
      lift_height: cleanNumber(body.lift_height),
      vehicle_configuration: cleanText(body.vehicle_configuration),
      hiab_configuration: cleanText(body.hiab_configuration),
      outrigger_setup: cleanText(body.outrigger_setup),
      ground_conditions: cleanText(body.ground_conditions),
      pickup_method: cleanText(body.pickup_method),
      delivery_method: cleanText(body.delivery_method),
      route_notes: cleanText(body.route_notes),
      access_notes: cleanText(body.access_notes),
      exclusion_zone_details: cleanText(body.exclusion_zone_details),
      traffic_management: cleanText(body.traffic_management),
      load_securing_method: cleanText(body.load_securing_method),
      lifting_accessories: cleanText(body.lifting_accessories),
      site_hazards: cleanText(body.site_hazards),
      control_measures: cleanText(body.control_measures),
      ppe_required: cleanText(body.ppe_required),
      weather_limitations: cleanText(body.weather_limitations),
      emergency_procedures: cleanText(body.emergency_procedures),
      method_statement: cleanText(body.method_statement),
      risk_assessment: cleanText(body.risk_assessment),
      appointed_person: cleanText(body.appointed_person),
      lift_supervisor: cleanText(body.lift_supervisor),
      operator_name: cleanText(body.operator_name),
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
      pack_sections: technical.sections,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("transport_lift_plans")
        .update(payload)
        .eq("transport_job_id", params.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "transport_lift_plan_updated",
        entity_type: "transport_lift_plan",
        entity_id: existing.id,
        meta: { transport_job_id: params.id },
      });
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("transport_lift_plans")
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
        action: "transport_lift_plan_created",
        entity_type: "transport_lift_plan",
        entity_id: inserted.id,
        meta: { transport_job_id: params.id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not save transport lift plan." },
      { status: 400 }
    );
  }
}
