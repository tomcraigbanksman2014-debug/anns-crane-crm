import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import {
  buildLiftPlanPatchFromPackEdits,
  parsePackEditChangedKeys,
  promoteChangedPackTechnicalInputs,
  reapplyChangedPackDisplayOverrides,
} from "../../../../../lib/craneLiftPlanPackSync";

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
  const isPlanningEstimate = source.includes("planning estimate") || source.includes("worst-case ground-bearing") || source.includes("planning/gross weight") || source.includes("existing lift-plan formula");
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


function tidyDisplayLabel(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of text.split(" ")) {
    const key = word.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out.join(" ").trim();
}

function normaliseCraneForCompare(value: unknown) {
  return tidyDisplayLabel(value)
    .toLowerCase()
    .replace(/böcker/g, "bocker")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:crane|mobile|spider|truck|mounted|gt|cdh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function currentCraneIsAk46(value: unknown) {
  const current = normaliseCraneForCompare(value);
  return /(?:^| )(?:bocker|ak46|ak 46)(?: |$)/.test(current);
}

function noJibLabelForCrane(value: unknown) {
  return currentCraneIsAk46(value)
    ? "No separate additive jib — hydraulic extension is included in the 46 m total boom-extension"
    : "No jib / main boom only";
}

function noJibBoomConfigurationForCrane(value: unknown) {
  return currentCraneIsAk46(value) ? "AK46 total boom-extension up to 46 m" : "Main boom";
}

function ak46SavedSetupShouldBeReset(sections: DynamicPackSectionsPayload) {
  const setupText = [
    sections.range_chart_selected_setup_key,
    sections.range_chart_selected_setup_label,
    sections.range_chart_selected_jib_option_key,
    sections.range_chart_selected_jib_option_label,
    sections.selected_crane_setup_key,
    sections.selected_crane_setup_label,
    sections.crane_jib_reference,
    sections.boom_configuration,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /ak46-main-46|optional\s+max\s+extension|max\s+extension\s+up\s+to\s+46|ak46-jib-|hydraulic\s+jib|11\.0\s*m\s+hydraulic\s+jib/.test(setupText);
}

function normaliseForCurrentCrane(sections: DynamicPackSectionsPayload, currentCraneName: unknown) {
  const currentCrane = tidyDisplayLabel(currentCraneName);
  const next: DynamicPackSectionsPayload = { ...sections };
  if (!currentCrane) return next;

  next.range_chart_crane_name = currentCrane;
  next.cover_cranes = currentCrane;
  next.crane_type_value = currentCrane;

  if (currentCraneIsAk46(currentCrane) && ak46SavedSetupShouldBeReset(next)) {
    next.range_chart_selected_setup_key = "profile:ak46-crane-operation";
    next.range_chart_selected_setup_label = "AK46 crane-operation range table / total boom-extension up to 46 m";
    next.selected_crane_setup_key = "profile:ak46-crane-operation";
    next.selected_crane_setup_label = "AK46 crane-operation range table / total boom-extension up to 46 m";
    next.range_chart_selected_jib_option_key = "none";
    next.range_chart_selected_jib_option_label = "No separate additive jib — hydraulic extension is included in the 46 m total boom-extension";
    next.range_chart_jib_length_m = "0";
    next.range_chart_jib_angle_deg = "0";
    next.boom_configuration = "AK46 total boom-extension up to 46 m";
    next.crane_jib_reference = "No separate additive jib — hydraulic extension is included in the 46 m total boom-extension";
    next.boom_length = null;
    next.range_chart_boom_length_m = null;
    next.range_chart_boom_angle_deg = null;
    next.range_chart_chart_capacity_kg = null;
    next.range_chart_capacity_source = null;
    next.range_chart_utilisation_percent = null;
    next.range_chart_limit_warning = null;
  }

  return next;
}

function buildCraneLabel(crane: any, allocation?: any) {
  const name = tidyDisplayLabel([crane?.name, crane?.make, crane?.model].filter(Boolean).join(" ")) || tidyDisplayLabel(allocation?.item_name);
  const capacity = String(crane?.capacity ?? "").trim();
  return [name, capacity && name && !name.toLowerCase().includes(capacity.toLowerCase()) ? capacity : ""].filter(Boolean).join(" ").trim() || null;
}

async function resolveCurrentJobCraneName(supabase: any, jobId: string, selectedJobEquipmentId?: string | null) {
  try {
    const { data } = await supabase
      .from("jobs")
      .select(`
        id,
        cranes:crane_id (id, name, make, model, capacity),
        job_equipment (
          id,
          crane_id,
          item_name,
          start_date,
          created_at,
          cranes:crane_id (id, name, make, model, capacity)
        )
      `)
      .eq("id", jobId)
      .maybeSingle();

    const rows = Array.isArray(data?.job_equipment) ? data.job_equipment : [];
    const selectedId = String(selectedJobEquipmentId ?? "").trim();
    const selected = selectedId ? rows.find((row: any) => String(row?.id ?? "") === selectedId) : null;
    const selectedCrane = Array.isArray(selected?.cranes) ? selected.cranes[0] : selected?.cranes;
    const selectedLabel = buildCraneLabel(selectedCrane, selected);
    if (selectedLabel) return selectedLabel;

    const firstWithCrane = rows.find((row: any) => row?.crane_id || row?.cranes);
    const firstCrane = Array.isArray(firstWithCrane?.cranes) ? firstWithCrane.cranes[0] : firstWithCrane?.cranes;
    const firstLabel = buildCraneLabel(firstCrane, firstWithCrane);
    if (firstLabel) return firstLabel;

    const jobCrane = Array.isArray(data?.cranes) ? data.cranes[0] : data?.cranes;
    return buildCraneLabel(jobCrane) ?? null;
  } catch {
    return null;
  }
}

function sanitiseSections(input: Record<string, unknown>) {
  const next: DynamicPackSectionsPayload = {};

  Object.entries(input).forEach(([key, value]) => {
    if (!key) return;
    if (key.startsWith("$ACTION_")) return;
    if (key === "pack_edit_changed_keys") return;
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
  const syncedCraneName = sections.range_chart_crane_name || sections.cover_cranes || sections.crane_type_value;
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
  const selectedJibLabel = String(sections.range_chart_selected_jib_option_label ?? "").trim();
  if (jibLength !== null && jibLength > 0) {
    next.crane_jib_reference = `${jibLength} m physical jib / extension`;
  } else if (/no\s+jib|main\s+boom\s+only|no\s+separate\s+additive\s+jib/i.test(selectedJibLabel)) {
    next.crane_jib_reference = noJibLabelForCrane(syncedCraneName);
  }
  if (/no\s+jib|main\s+boom\s+only|no\s+separate\s+additive\s+jib/i.test(selectedJibLabel)) next.boom_configuration = noJibBoomConfigurationForCrane(syncedCraneName);

  if (!currentCraneIsAk46(syncedCraneName)) {
    const staleAk46NoJibText = /no\s+separate\s+additive\s+jib|46\s*m\s+total\s+boom-extension|ak46\s+total\s+boom-extension/i;
    if (staleAk46NoJibText.test(String(next.crane_jib_reference ?? ""))) next.crane_jib_reference = "No jib / main boom only";
    if (staleAk46NoJibText.test(String(next.boom_configuration ?? ""))) next.boom_configuration = "Main boom";
  }
  if (loadWeight !== null) next.crane_load_weight = formatKgOnly(loadWeight);
  if (accessoryWeight !== null) next.crane_lifting_accessories_weight_text = formatKgOnly(accessoryWeight);
  if (chartCapacity !== null) {
    next.crane_max_capacity = formatKgAndTonnes(chartCapacity);
  } else if (totalLiftedWeight !== null) {
    next.crane_max_capacity = "Manual chart check required";
  }
  if (utilisationPercent !== null) {
    next.crane_utilisation = formatPercent(utilisationPercent);
  } else if (totalLiftedWeight !== null) {
    next.crane_utilisation = "Manual check required";
  }
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

async function saveSections(
  jobId: string,
  sections: DynamicPackSectionsPayload,
  changedKeys: string[],
) {
  const supabase = createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("lift_plans")
    .select("id, pack_sections, paperwork_locked, selected_job_equipment_id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.paperwork_locked) {
    throw new Error("This lift plan is locked and cannot be edited.");
  }

  const currentCraneName = await resolveCurrentJobCraneName(
    supabase,
    jobId,
    (existing as any)?.selected_job_equipment_id ?? null,
  );
  const existingSections =
    ((existing?.pack_sections as Record<string, unknown> | null) ?? {}) as
      DynamicPackSectionsPayload;
  const incomingSafeSections = normaliseForCurrentCrane(
    sections,
    currentCraneName ??
      sections.range_chart_crane_name ??
      existingSections.range_chart_crane_name,
  );
  const mergedInputSections = {
    ...existingSections,
    ...incomingSafeSections,
  };
  const promotedSections = promoteChangedPackTechnicalInputs(
    mergedInputSections,
    changedKeys,
  );
  const normalisedSections = normaliseForCurrentCrane(
    promotedSections,
    currentCraneName ??
      promotedSections.range_chart_crane_name ??
      existingSections.range_chart_crane_name,
  );
  const syncedSections = withRangeChartPackSync(normalisedSections);
  const mergedSections = reapplyChangedPackDisplayOverrides(
    syncedSections,
    incomingSafeSections,
    changedKeys,
  );
  const isRangeChartPayload =
    changedKeys.length === 0 &&
    Object.keys(sections).some((key) => key.startsWith("range_chart_"));
  const liftPlanPatch = {
    ...(isRangeChartPayload
      ? liftPlanColumnPatchFromRangeChart(mergedSections)
      : {}),
    ...buildLiftPlanPatchFromPackEdits(mergedSections, changedKeys),
  };

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
    let changedKeys: string[] = [];

    if (wantsJson) {
      const body = (await request.json()) as Record<string, unknown>;
      changedKeys = parsePackEditChangedKeys(body.pack_edit_changed_keys);
      sections = sanitiseSections(body);
    } else {
      const formData = await request.formData();
      const formValues: Record<string, unknown> = {};
      formData.forEach((value, key) => {
        formValues[key] = value;
      });
      changedKeys = parsePackEditChangedKeys(
        formValues.pack_edit_changed_keys,
      );
      sections = sanitiseSections(formValues);
    }

    const mergedSections = await saveSections(
      params.id,
      sections,
      changedKeys,
    );

    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        pack_sections: mergedSections,
        synced_lift_plan_fields: changedKeys,
      });
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
