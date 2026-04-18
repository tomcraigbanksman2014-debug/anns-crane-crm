import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

type PackSectionsPayload = {
  cover_project?: string | null;
  lift_classification?: string | null;
  boom_configuration?: string | null;
  boom_length?: string | null;
  introduction?: string | null;
  client_responsibilities?: string | null;
  contract_lift_arrival?: string | null;
  scope_of_works?: string | null;
  communication?: string | null;
  weather_conditions?: string | null;
  site_access_egress?: string | null;
  ground_conditions?: string | null;
  overhead_obstructions?: string | null;
  traffic_pedestrian_management?: string | null;
  lifting_equipment_certification?: string | null;
  crane_details?: string | null;
  crane_setup_procedure?: string | null;
  lifting_procedure?: string | null;
  de_rig_procedure?: string | null;
  emergency_procedure?: string | null;
  risk_assessment_summary?: string | null;
  emergency_contacts?: string | null;
  equipment_list?: string | null;
  toolbox_notes?: string | null;
};

function normaliseText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function sanitiseSections(input: PackSectionsPayload) {
  return {
    cover_project: normaliseText(input.cover_project),
    lift_classification: normaliseText(input.lift_classification),
    boom_configuration: normaliseText(input.boom_configuration),
    boom_length: normaliseText(input.boom_length),
    introduction: normaliseText(input.introduction),
    client_responsibilities: normaliseText(input.client_responsibilities),
    contract_lift_arrival: normaliseText(input.contract_lift_arrival),
    scope_of_works: normaliseText(input.scope_of_works),
    communication: normaliseText(input.communication),
    weather_conditions: normaliseText(input.weather_conditions),
    site_access_egress: normaliseText(input.site_access_egress),
    ground_conditions: normaliseText(input.ground_conditions),
    overhead_obstructions: normaliseText(input.overhead_obstructions),
    traffic_pedestrian_management: normaliseText(input.traffic_pedestrian_management),
    lifting_equipment_certification: normaliseText(input.lifting_equipment_certification),
    crane_details: normaliseText(input.crane_details),
    crane_setup_procedure: normaliseText(input.crane_setup_procedure),
    lifting_procedure: normaliseText(input.lifting_procedure),
    de_rig_procedure: normaliseText(input.de_rig_procedure),
    emergency_procedure: normaliseText(input.emergency_procedure),
    risk_assessment_summary: normaliseText(input.risk_assessment_summary),
    emergency_contacts: normaliseText(input.emergency_contacts),
    equipment_list: normaliseText(input.equipment_list),
    toolbox_notes: normaliseText(input.toolbox_notes),
  };
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const body = (await request.json()) as PackSectionsPayload;
    const sections = sanitiseSections(body);

    const { data: existing, error: existingError } = await supabase
      .from("lift_plans")
      .select("id, pack_sections")
      .eq("job_id", params.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    const mergedSections = {
      ...((existing?.pack_sections as Record<string, unknown> | null) ?? {}),
      ...sections,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("lift_plans")
        .update({
          pack_sections: mergedSections,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      const { error } = await supabase
        .from("lift_plans")
        .insert({
          job_id: params.id,
          pack_sections: mergedSections,
        });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, pack_sections: mergedSections });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save section content" },
      { status: 500 }
    );
  }
}
