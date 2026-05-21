import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

type DynamicPackSectionsPayload = Record<string, string | null>;

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function roundForStorage(value: number | null, decimals = 3) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  const factor = Math.pow(10, decimals);
  return String(Math.round(value * factor) / factor);
}

function formatKgOnly(valueKg: number | null) {
  if (valueKg === null || valueKg === undefined || !Number.isFinite(valueKg) || valueKg <= 0) return null;
  return `${valueKg.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kg`;
}

function formatKgAndTonnes(valueKg: number | null) {
  if (valueKg === null || valueKg === undefined || !Number.isFinite(valueKg) || valueKg <= 0) return null;
  const tonnes = valueKg / 1000;
  return `${valueKg.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kg / ${tonnes.toLocaleString("en-GB", { maximumFractionDigits: 2 })} t`;
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null;
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: value < 10 ? 1 : 0 })}%`;
}

function inferredRangeTotalLiftedWeight(sections: DynamicPackSectionsPayload) {
  const storedTotal = cleanNumber(sections.range_chart_total_lifted_weight_kg);
  if (storedTotal !== null) return storedTotal;

  const load = cleanNumber(sections.range_chart_load_weight_kg) ?? 0;
  const accessories = cleanNumber(sections.range_chart_accessory_weight_kg) ?? 0;
  const total = load + accessories;
  return total > 0 ? total : null;
}

function inferredPlanningGrossWeightFromRangeChart(sections: DynamicPackSectionsPayload) {
  const bearingLoad = cleanNumber(sections.range_chart_bearing_load_kg);
  const totalLifted = inferredRangeTotalLiftedWeight(sections);
  const source = String(sections.range_chart_bearing_source ?? "").toLowerCase();
  const method = String(sections.range_chart_bearing_method ?? "").toLowerCase();

  // Only reverse the lift-plan estimate when the bearing value came from the planning formula.
  // Do not reverse-calculate published outrigger/reaction values such as a spec-sheet reaction.
  const isPlanningEstimate = source.includes("planning estimate") || source.includes("planning/gross weight") || source.includes("existing lift-plan formula");
  if (bearingLoad === null || totalLifted === null || method !== "automatic" || !isPlanningEstimate) return null;

  const planningGrossWeight = bearingLoad / 0.75 - totalLifted;
  return planningGrossWeight > 0 && Number.isFinite(planningGrossWeight) ? planningGrossWeight : null;
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

function containsRangeChartData(sections: DynamicPackSectionsPayload) {
  return Object.keys(sections).some((key) => key.startsWith("range_chart_"));
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
  if (!containsRangeChartData(sections)) return sections;

  const next: DynamicPackSectionsPayload = { ...sections };
  const boomLength = cleanNumber(sections.range_chart_boom_length_m);
  const jibLength = cleanNumber(sections.range_chart_jib_length_m);
  const loadWeight = cleanNumber(sections.range_chart_load_weight_kg);
  const accessoryWeight = cleanNumber(sections.range_chart_accessory_weight_kg);
  const totalLiftedWeight = inferredRangeTotalLiftedWeight(sections);
  const planningGrossWeight = inferredPlanningGrossWeightFromRangeChart(sections);
  const chartCapacity = cleanNumber(sections.range_chart_chart_capacity_kg);
  const utilisationPercent = cleanNumber(sections.range_chart_utilisation_percent);
  const bearingLoad = cleanNumber(sections.range_chart_bearing_load_kg);
  const matArea = cleanNumber(sections.range_chart_mat_area_m2);
  const bearingPressureKgM2 = cleanNumber(sections.range_chart_bearing_pressure_kg_m2);

  if (sections.range_chart_selected_setup_key) next.selected_crane_setup_key = sections.range_chart_selected_setup_key;
  if (sections.range_chart_selected_setup_label) next.selected_crane_setup_label = sections.range_chart_selected_setup_label;
  if (boomLength !== null) next.boom_length = `${boomLength} m boom`;
  if (jibLength !== null && jibLength > 0) next.crane_jib_reference = `${jibLength} m physical jib / extension`;
  if (loadWeight !== null) next.crane_load_weight = formatKgOnly(loadWeight);
  if (accessoryWeight !== null) next.crane_lifting_accessories_weight_text = formatKgOnly(accessoryWeight);
  if (chartCapacity !== null) next.crane_max_capacity = formatKgAndTonnes(chartCapacity);
  if (utilisationPercent !== null) next.crane_utilisation = formatPercent(utilisationPercent);
  if (planningGrossWeight !== null) next.crane_gross_weight = formatKgAndTonnes(planningGrossWeight);

  // Keep the older pack table fields in step with the range-chart calculation so stale/manual
  // values cannot carry through to the printed ground-bearing table.
  if (planningGrossWeight !== null) next.ground_bearing_crane_max_weight = formatKgAndTonnes(planningGrossWeight);
  if (totalLiftedWeight !== null) next.ground_bearing_load_max_weight = formatKgAndTonnes(totalLiftedWeight);
  if (planningGrossWeight !== null && totalLiftedWeight !== null) next.ground_bearing_combined_weight = formatKgAndTonnes(planningGrossWeight + totalLiftedWeight);
  if (bearingLoad !== null) next.ground_bearing_result = formatKgAndTonnes(bearingLoad);

  if (sections.range_chart_mat_length_m) next.ground_bearing_mat_length_m = sections.range_chart_mat_length_m;
  if (sections.range_chart_mat_width_m) next.ground_bearing_mat_width_m = sections.range_chart_mat_width_m;
  if (matArea !== null) next.ground_bearing_mat_area_m2 = roundForStorage(matArea, 3);
  if (bearingLoad !== null) next.ground_bearing_bearing_load = formatKgAndTonnes(bearingLoad);
  if (sections.range_chart_bearing_pressure) next.ground_bearing_pressure = sections.range_chart_bearing_pressure;
  if (bearingPressureKgM2 !== null) next.ground_bearing_pressure_kg_m2 = roundForStorage(bearingPressureKgM2, 2);
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
