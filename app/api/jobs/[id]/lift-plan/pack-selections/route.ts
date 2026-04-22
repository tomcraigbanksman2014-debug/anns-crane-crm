import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

const fieldNames = [
  "cover_project",
  "lift_classification",
  "boom_configuration",
  "boom_length",
  "introduction",
  "client_responsibilities",
  "contract_lift_arrival",
  "scope_of_works",
  "communication",
  "weather_conditions",
  "site_access_egress",
  "ground_conditions",
  "overhead_obstructions",
  "traffic_pedestrian_management",
  "lifting_equipment_certification",
  "crane_details",
  "crane_setup_procedure",
  "lifting_procedure",
  "de_rig_procedure",
  "emergency_procedure",
  "risk_assessment_summary",
  "emergency_contacts",
  "equipment_list",
  "toolbox_notes",
  "site_inspection",
  "roles_responsibilities",
  "appointed_person_name",
  "prepared_by_name",
  "approved_by_name",
  "approved_at_text",
  "lift_supervisor_name",
  "crane_operator_name",
  "client_site_contact_name",
  "sling_type_text",
  "lifting_accessories_text",
  "configuration_outrigger_note",
  "load_chart_note",
  "outrigger_setup_note",
  "site_hazards",
  "control_measures",
  "ppe_required",
  "wind_speed_lift_supervisor",
] as const;

type PackSectionsPayload = Partial<Record<(typeof fieldNames)[number], string | null>>;

function normaliseText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function sanitiseSections(input: Record<string, unknown>) {
  const next: Record<string, string | null> = {};
  fieldNames.forEach((field) => {
    next[field] = normaliseText(input[field]);
  });
  return next as PackSectionsPayload;
}

async function saveSections(jobId: string, sections: PackSectionsPayload) {
  const supabase = createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("lift_plans")
    .select("id, pack_sections")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
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

    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("lift_plans")
      .insert({
        job_id: jobId,
        pack_sections: mergedSections,
      });

    if (error) throw new Error(error.message);
  }

  return mergedSections;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const contentType = String(request.headers.get("content-type") ?? "").toLowerCase();
  const wantsJson = contentType.includes("application/json");

  try {
    let sections: PackSectionsPayload;

    if (wantsJson) {
      const body = (await request.json()) as Record<string, unknown>;
      sections = sanitiseSections(body);
    } else {
      const formData = await request.formData();
      const formValues: Record<string, unknown> = {};
      fieldNames.forEach((field) => {
        formValues[field] = formData.get(field);
      });
      sections = sanitiseSections(formValues);
    }

    const mergedSections = await saveSections(params.id, sections);

    if (wantsJson) {
      return NextResponse.json({ ok: true, pack_sections: mergedSections });
    }

    const redirectUrl = new URL(`/jobs/${params.id}/lift-plan/pack?saved=1`, request.url);
    return NextResponse.redirect(redirectUrl, 303);
  } catch (error: any) {
    if (wantsJson) {
      return NextResponse.json(
        { error: error?.message || "Failed to save section content" },
        { status: 500 }
      );
    }

    const redirectUrl = new URL(`/jobs/${params.id}/lift-plan/pack?error=${encodeURIComponent(error?.message || "Failed to save pack edits")}`, request.url);
    return NextResponse.redirect(redirectUrl, 303);
  }
}
