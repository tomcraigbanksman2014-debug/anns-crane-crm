import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";


function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

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

function cleanSectionText(value: unknown) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

const PACK_SECTION_KEYS = [
  "selected_crane_setup_key",
  "selected_crane_setup_label",
  "boom_configuration",
  "boom_length",
  "crane_outreach_reference",
  "crane_jib_reference",
  "crane_details",
  "configuration_outrigger_note",
  "load_chart_note",
  "ground_bearing_mat_preset",
  "ground_bearing_mat_length_m",
  "ground_bearing_mat_width_m",
  "ground_bearing_mat_area_m2",
  "ground_bearing_bearing_load",
  "ground_bearing_pressure",
  "ground_bearing_notes",
  "custom_crane_name",
  "custom_crane_make",
  "custom_crane_model",
  "custom_crane_capacity",
  "custom_crane_capacity_kg",
  "custom_crane_boom_length_m",
  "custom_crane_hydraulic_outreach_m",
  "custom_crane_jib_outreach_m",
  "custom_crane_max_radius_m",
  "custom_crane_summary",
  "custom_crane_configuration_note",
  "custom_crane_outrigger_note",
  "custom_crane_weather_note",
  "custom_crane_chart_note",
  "external_crane_hydraulic_outreach_m",
  "external_crane_jib_outreach_m",
  "multi_crane_enabled",
  "multi_crane_lift_type",
  "multi_crane_notes",
  "additional_cranes_json",
];

function packSectionsFromBody(body: Record<string, unknown>) {
  const out: Record<string, string | null> = {};
  for (const key of PACK_SECTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = cleanSectionText(body[key]);
    }
  }
  return out;
}

function cleanUuid(value: unknown) {
  const s = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
    ? s
    : null;
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


async function safeCreateLiftPlanVersion({
  admin,
  existing,
  user,
  reason,
}: {
  admin: ReturnType<typeof getAdminClient>;
  existing: any;
  user: any;
  reason: string;
}) {
  if (!existing?.id) return false;
  try {
    const { error } = await admin.from("lift_plan_versions").insert({
      lift_plan_id: existing.id,
      job_id: existing.job_id,
      snapshot_data: existing,
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
      reason,
    });
    if (error) return false;
    return true;
  } catch {
    // Version history is a safety feature. If the migration has not been run yet,
    // do not block saving the lift plan.
    return false;
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const admin = getAdminClient();

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
      .select("*")
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

    const packSectionsFromPayload = packSectionsFromBody(body);

    const payload = {
      job_id: params.id,
      selected_job_equipment_id: cleanUuid(body.selected_job_equipment_id),
      selected_crane_id: cleanUuid(body.selected_crane_id),
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

    let versionSaved = false;

    if (existing?.id) {
      const mergedPackSections = {
        ...((existing?.pack_sections as Record<string, unknown> | null) ?? {}),
        ...packSectionsFromPayload,
      };

      versionSaved = await safeCreateLiftPlanVersion({ admin, existing, user, reason: "before_save_draft" });

      const { error: updateError } = await supabase
        .from("lift_plans")
        .update({
          ...payload,
          pack_sections: mergedPackSections,
        })
        .eq("job_id", params.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "lift_plan_updated",
        entity_type: "lift_plan",
        entity_id: existing.id,
        meta: { job_id: params.id, selected_job_equipment_id: payload.selected_job_equipment_id, selected_crane_id: payload.selected_crane_id },
      });
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("lift_plans")
        .insert({
          ...payload,
          pack_sections: packSectionsFromPayload,
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
        action: "lift_plan_created",
        entity_type: "lift_plan",
        entity_id: inserted.id,
        meta: { job_id: params.id, selected_job_equipment_id: payload.selected_job_equipment_id, selected_crane_id: payload.selected_crane_id },
      });
    }

    return NextResponse.json({ ok: true, previous_version_saved: typeof versionSaved === "boolean" ? versionSaved : false });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not save lift plan." },
      { status: 400 }
    );
  }
}
