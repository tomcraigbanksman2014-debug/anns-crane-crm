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

const fieldNames: Array<keyof PackSectionsPayload> = [
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
];

function normaliseText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function sanitiseSections(input: Partial<Record<keyof PackSectionsPayload, unknown>>) {
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
      const body = (await request.json()) as PackSectionsPayload;
      sections = sanitiseSections(body);
    } else {
      const formData = await request.formData();
      const formValues: Partial<Record<keyof PackSectionsPayload, unknown>> = {};
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
