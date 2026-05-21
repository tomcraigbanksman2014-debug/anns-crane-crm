import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

type DynamicPackSectionsPayload = Record<string, string | null>;

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const LONG_TEXT_SECTION_KEYS = new Set([
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
  "range_chart_verification_note",
]);

function normaliseDuplicateKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9.%/()'" -]/g, "")
    .trim();
}

function tidyRepeatedTextBlock(value: string) {
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const seenParagraphs = new Set<string>();
  const uniqueParagraphs: string[] = [];

  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    const sentenceParts = paragraph
      .replace(/([.!?])\s+(?=[A-Z0-9])/g, "$1\n")
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const seenSentences = new Set<string>();
    const uniqueSentences: string[] = [];
    for (const sentence of sentenceParts.length ? sentenceParts : [paragraph]) {
      const key = normaliseDuplicateKey(sentence);
      if (!key || seenSentences.has(key)) continue;
      seenSentences.add(key);
      uniqueSentences.push(sentence);
    }
    const cleanedParagraph = uniqueSentences.join(" ").trim();
    const paragraphKey = normaliseDuplicateKey(cleanedParagraph);
    if (!paragraphKey || seenParagraphs.has(paragraphKey)) continue;
    seenParagraphs.add(paragraphKey);
    uniqueParagraphs.push(cleanedParagraph);
  }

  return uniqueParagraphs.join("\n\n").trim();
}

function normaliseText(key: string, value: unknown) {
  if (value === null || value === undefined) return null;
  let text = String(value).trim();
  if (LONG_TEXT_SECTION_KEYS.has(key)) text = tidyRepeatedTextBlock(text);
  return text.length ? text : null;
}

function sanitiseSections(input: Record<string, unknown>) {
  const next: DynamicPackSectionsPayload = {};

  Object.entries(input).forEach(([key, value]) => {
    if (!key) return;
    if (key.startsWith("$ACTION_")) return;
    next[key] = normaliseText(key, value);
  });

  return next;
}

function liftPlanColumnPatchFromRangeChart(sections: DynamicPackSectionsPayload) {
  const patch: Record<string, number | string> = {};
  const loadWeight = cleanNumber(sections.range_chart_load_weight_kg);
  const liftRadius = cleanNumber(sections.range_chart_radius_m);
  const liftHeight = cleanNumber(sections.range_chart_tip_height_m);

  if (loadWeight !== null) patch.load_weight = loadWeight;
  if (liftRadius !== null) patch.lift_radius = liftRadius;
  if (liftHeight !== null) patch.lift_height = liftHeight;

  return patch;
}

function withRangeChartPackSync(sections: DynamicPackSectionsPayload) {
  if (!Object.prototype.hasOwnProperty.call(sections, "range_chart_enabled")) return sections;

  const next: DynamicPackSectionsPayload = { ...sections };
  const boomLength = cleanNumber(sections.range_chart_boom_length_m);
  const jibLength = cleanNumber(sections.range_chart_jib_length_m);

  if (sections.range_chart_selected_setup_key) next.selected_crane_setup_key = sections.range_chart_selected_setup_key;
  if (sections.range_chart_selected_setup_label) next.selected_crane_setup_label = sections.range_chart_selected_setup_label;
  if (boomLength !== null) next.boom_length = `${boomLength} m boom`;
  if (jibLength !== null && jibLength > 0) next.crane_jib_reference = `${jibLength} m physical jib / extension`;
  if (sections.range_chart_mat_length_m) next.ground_bearing_mat_length_m = sections.range_chart_mat_length_m;
  if (sections.range_chart_mat_width_m) next.ground_bearing_mat_width_m = sections.range_chart_mat_width_m;
  if (sections.range_chart_mat_area_m2) next.ground_bearing_mat_area_m2 = sections.range_chart_mat_area_m2;
  if (sections.range_chart_bearing_load_kg) next.ground_bearing_bearing_load = sections.range_chart_bearing_load_kg;
  if (sections.range_chart_bearing_pressure) next.ground_bearing_pressure = sections.range_chart_bearing_pressure;
  if (sections.range_chart_bearing_pressure_formula) next.ground_bearing_notes = sections.range_chart_bearing_pressure_formula;

  return next;
}

async function saveSections(jobId: string, sections: DynamicPackSectionsPayload) {
  const supabase = createSupabaseServerClient();
  const syncedSections = withRangeChartPackSync(sections);

  const { data: existing, error: existingError } = await supabase
    .from("lift_plans")
    .select("id, pack_sections, paperwork_locked")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.paperwork_locked) {
    throw new Error("This lift plan is locked and cannot be edited.");
  }

  const mergedSections = {
    ...((existing?.pack_sections as Record<string, unknown> | null) ?? {}),
    ...syncedSections,
  };
  const liftPlanPatch = liftPlanColumnPatchFromRangeChart(syncedSections);

  if (existing?.id) {
    const { error } = await supabase
      .from("lift_plans")
      .update({
        pack_sections: mergedSections,
        ...liftPlanPatch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("lift_plans").insert({
      job_id: jobId,
      pack_sections: mergedSections,
      ...liftPlanPatch,
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
    let sections: DynamicPackSectionsPayload;

    if (wantsJson) {
      const body = (await request.json()) as Record<string, unknown>;
      sections = sanitiseSections(body);
    } else {
      const formData = await request.formData();
      const formValues: Record<string, unknown> = {};
      formData.forEach((value, key) => {
        formValues[key] = value;
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
        { error: error?.message || "Failed to save pack edits" },
        { status: 500 }
      );
    }

    const redirectUrl = new URL(
      `/jobs/${params.id}/lift-plan/pack?error=${encodeURIComponent(
        error?.message || "Failed to save pack edits"
      )}`,
      request.url
    );
    return NextResponse.redirect(redirectUrl, 303);
  }
}
