export type CranePackSections = Record<string, string | null>;

export type CraneLiftPlanColumnPatch = Record<
  string,
  string | number | null
>;

function text(value: unknown) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned.length ? cleaned : null;
}

function number(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(value: unknown) {
  const match = String(value ?? "")
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function weightKg(value: unknown) {
  const source = String(value ?? "").replace(/,/g, "").trim();
  if (!source) return null;

  const kg = source.match(/(-?\d+(?:\.\d+)?)\s*kg\b/i);
  if (kg) {
    const parsed = Number(kg[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const tonnes = source.match(
    /(-?\d+(?:\.\d+)?)\s*(?:t|tonne|tonnes)\b/i,
  );
  if (tonnes) {
    const parsed = Number(tonnes[1]);
    return Number.isFinite(parsed) ? parsed * 1000 : null;
  }

  return number(source);
}

function changedValue(
  sections: CranePackSections,
  changedKeys: Set<string>,
  keys: string[],
) {
  const key = keys.find((candidate) => changedKeys.has(candidate));
  return key ? { key, value: sections[key] } : null;
}

function setTextColumn(
  patch: CraneLiftPlanColumnPatch,
  column: string,
  sections: CranePackSections,
  changedKeys: Set<string>,
  keys: string[],
) {
  const changed = changedValue(sections, changedKeys, keys);
  if (changed) patch[column] = text(changed.value);
}

function setNumberColumn(
  patch: CraneLiftPlanColumnPatch,
  column: string,
  sections: CranePackSections,
  changedKeys: Set<string>,
  keys: string[],
  parser: (value: unknown) => number | null = number,
) {
  const changed = changedValue(sections, changedKeys, keys);
  if (changed) patch[column] = parser(changed.value);
}

export function parsePackEditChangedKeys(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((item) => String(item).trim()).filter(Boolean)),
    );
  }

  const source = String(value ?? "").trim();
  if (!source) return [];

  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) {
      return Array.from(
        new Set(parsed.map((item) => String(item).trim()).filter(Boolean)),
      );
    }
  } catch {
    // Older clients may send a comma-separated list.
  }

  return Array.from(
    new Set(source.split(",").map((item) => item.trim()).filter(Boolean)),
  );
}

function appendVerificationNote(
  current: string | null | undefined,
  note: string,
) {
  const existing = String(current ?? "").trim();
  if (!existing) return note;
  if (existing.toLowerCase().includes(note.toLowerCase())) return existing;
  return `${existing}\n${note}`;
}

function inferredPlanningGrossWeight(sections: CranePackSections) {
  const bearingLoad = number(sections.range_chart_bearing_load_kg);
  const load = number(sections.range_chart_load_weight_kg) ?? 0;
  const accessories = number(sections.range_chart_accessory_weight_kg) ?? 0;
  const totalLifted = load + accessories;
  const source = String(sections.range_chart_bearing_source ?? "").toLowerCase();
  const method = String(sections.range_chart_bearing_method ?? "").toLowerCase();
  const isPlanningEstimate =
    source.includes("planning estimate") ||
    source.includes("worst-case ground-bearing") ||
    source.includes("planning/gross weight") ||
    source.includes("existing lift-plan formula");

  if (
    bearingLoad === null ||
    bearingLoad <= 0 ||
    totalLifted <= 0 ||
    method !== "automatic" ||
    !isPlanningEstimate
  ) {
    return null;
  }

  const planningGrossWeight = bearingLoad / 0.75 - totalLifted;
  return planningGrossWeight > 0 && Number.isFinite(planningGrossWeight)
    ? planningGrossWeight
    : null;
}

const TECHNICAL_PACK_EDIT_KEYS = new Set([
  "crane_load_weight",
  "crane_lifting_accessories_weight_text",
  "crane_max_capacity",
  "boom_length",
  "ground_bearing_mat_size",
  "ground_bearing_mat_count",
  "ground_bearing_bearing_load",
  "ground_bearing_result",
]);

function recalculateTechnicalTotals(sections: CranePackSections) {
  const next: CranePackSections = { ...sections };
  const load = number(next.range_chart_load_weight_kg) ?? 0;
  const accessories = number(next.range_chart_accessory_weight_kg) ?? 0;
  const total = load + accessories;
  next.range_chart_total_lifted_weight_kg =
    total > 0 ? String(Math.round(total * 1000) / 1000) : null;

  const capacity = number(next.range_chart_chart_capacity_kg);
  next.range_chart_utilisation_percent =
    total > 0 && capacity && capacity > 0
      ? String(Math.round((total / capacity) * 10000) / 100)
      : null;

  const bearingLoad = number(next.range_chart_bearing_load_kg);
  const matLength = number(next.range_chart_mat_length_m);
  const matWidth = number(next.range_chart_mat_width_m);
  const matCount = Math.max(
    1,
    Math.round(number(next.range_chart_mats_under_loaded_outrigger) ?? 1),
  );
  if (
    bearingLoad !== null &&
    bearingLoad > 0 &&
    matLength !== null &&
    matLength > 0 &&
    matWidth !== null &&
    matWidth > 0
  ) {
    const area = matLength * matWidth * matCount;
    next.range_chart_mat_count = String(matCount);
    next.range_chart_mats_under_loaded_outrigger = String(matCount);
    next.range_chart_single_mat_area_m2 = String(
      Math.round(matLength * matWidth * 1000) / 1000,
    );
    next.range_chart_mat_area_m2 = String(
      Math.round(area * 1000) / 1000,
    );
    next.range_chart_mat_total_area_m2 = next.range_chart_mat_area_m2;
    next.range_chart_bearing_pressure_kg_m2 = String(
      Math.round((bearingLoad / area) * 100) / 100,
    );
    next.range_chart_bearing_pressure_t_m2 = String(
      Math.round((bearingLoad / area / 1000) * 10000) / 10000,
    );
    next.range_chart_bearing_pressure = `${(
      bearingLoad / area
    ).toLocaleString("en-GB", {
      maximumFractionDigits: 0,
    })} kg/m²`;
  } else {
    next.range_chart_single_mat_area_m2 = null;
    next.range_chart_mat_area_m2 = null;
    next.range_chart_mat_total_area_m2 = null;
    next.range_chart_bearing_pressure_kg_m2 = null;
    next.range_chart_bearing_pressure_t_m2 = null;
    next.range_chart_bearing_pressure = null;
  }

  return next;
}

/**
 * Promotes technical values edited in the PDF pack back into the canonical
 * range-chart fields before the existing calculation synchroniser runs.
 */
export function promoteChangedPackTechnicalInputs(
  sections: CranePackSections,
  changedKeyList: string[],
) {
  const changedKeys = new Set(changedKeyList);
  const next: CranePackSections = { ...sections };
  const technicalEditRequested = changedKeyList.some((key) =>
    TECHNICAL_PACK_EDIT_KEYS.has(key),
  );
  if (!technicalEditRequested) return next;

  const planningGrossWeight = inferredPlanningGrossWeight(sections);
  let technicalDutyChanged = false;

  if (changedKeys.has("crane_load_weight")) {
    const value = weightKg(sections.crane_load_weight);
    next.range_chart_load_weight_kg =
      value === null ? null : String(value);
    technicalDutyChanged = true;
  }

  if (changedKeys.has("crane_lifting_accessories_weight_text")) {
    const value = weightKg(
      sections.crane_lifting_accessories_weight_text,
    );
    next.range_chart_accessory_weight_kg =
      value === null ? null : String(value);
    technicalDutyChanged = true;
  }

  if (changedKeys.has("crane_max_capacity")) {
    const value = weightKg(sections.crane_max_capacity);
    next.range_chart_chart_capacity_kg =
      value === null ? null : String(value);
    next.range_chart_capacity_method = value === null ? null : "manual";
    next.range_chart_capacity_source =
      value === null
        ? null
        : "AP-entered chart capacity from the editable PDF pack";
    next.range_chart_verification_note = appendVerificationNote(
      next.range_chart_verification_note,
      "Chart capacity was edited from the PDF pack and must be verified against the exact manufacturer or supplier chart.",
    );
  }

  if (changedKeys.has("boom_length")) {
    const value = firstNumber(sections.boom_length);
    next.range_chart_boom_length_m =
      value === null ? null : String(value);
    next.range_chart_chart_capacity_kg = null;
    next.range_chart_utilisation_percent = null;
    next.range_chart_capacity_source = null;
    next.range_chart_verification_note = appendVerificationNote(
      next.range_chart_verification_note,
      "Boom length was edited from the PDF pack. Re-select or verify the applicable chart capacity before approval.",
    );
    technicalDutyChanged = true;
  }

  if (changedKeys.has("ground_bearing_mat_size")) {
    const source = String(sections.ground_bearing_mat_size ?? "")
      .replace(/,/g, ".")
      .trim();
    const dimensions = source.match(
      /(\d+(?:\.\d+)?)\s*(?:m|metres?)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:m|metres?)?/i,
    );
    if (dimensions) {
      next.range_chart_mat_length_m = dimensions[1];
      next.range_chart_mat_width_m = dimensions[2];
      const countMatch = source.match(
        /(?:x|×)\s*(\d+)\s*(?:under|piece|pieces|mat|mats|spreader|spreaders)/i,
      );
      if (countMatch) {
        next.range_chart_mat_count = countMatch[1];
        next.range_chart_mats_under_loaded_outrigger = countMatch[1];
      }
    } else {
      next.range_chart_mat_length_m = null;
      next.range_chart_mat_width_m = null;
    }
  }

  if (changedKeys.has("ground_bearing_mat_count")) {
    const value = firstNumber(sections.ground_bearing_mat_count);
    const count = value === null ? null : String(Math.max(1, Math.round(value)));
    next.range_chart_mat_count = count;
    next.range_chart_mats_under_loaded_outrigger = count;
  }

  const bearingChanged = changedValue(sections, changedKeys, [
    "ground_bearing_bearing_load",
    "ground_bearing_result",
  ]);
  if (bearingChanged) {
    const value = weightKg(bearingChanged.value);
    next.range_chart_bearing_load_kg =
      value === null ? null : String(value);
    next.range_chart_bearing_method = value === null ? null : "manual";
    next.range_chart_bearing_source =
      value === null
        ? null
        : "AP-entered reaction / bearing load from the editable PDF pack";
  }

  if (technicalDutyChanged && planningGrossWeight !== null) {
    const revisedLoad = number(next.range_chart_load_weight_kg) ?? 0;
    const revisedAccessories = number(next.range_chart_accessory_weight_kg) ?? 0;
    const revisedTotal = revisedLoad + revisedAccessories;
    next.range_chart_bearing_load_kg =
      revisedTotal > 0
        ? String(
            Math.round((planningGrossWeight + revisedTotal) * 0.75 * 100) /
              100,
          )
        : null;
  }

  if (
    technicalDutyChanged &&
    !changedKeys.has("crane_max_capacity")
  ) {
    next.range_chart_chart_capacity_kg = null;
    next.range_chart_utilisation_percent = null;
    next.range_chart_capacity_source = null;
    next.range_chart_verification_note = appendVerificationNote(
      next.range_chart_verification_note,
      "The lifted duty was changed from the PDF pack. The chart capacity and utilisation must be checked again before approval.",
    );
  }

  return recalculateTechnicalTotals(next);
}

const PACK_DISPLAY_OVERRIDE_KEYS = new Set([
  "boom_configuration",
  "crane_jib_reference",
  "crane_minimum_required_setup",
  "crane_outreach_reference",
  "crane_details",
  "configuration_outrigger_note",
  "load_chart_note",
  "ground_bearing_notes",
]);

export function reapplyChangedPackDisplayOverrides(
  syncedSections: CranePackSections,
  incomingSections: CranePackSections,
  changedKeyList: string[],
) {
  const next = { ...syncedSections };
  for (const key of changedKeyList) {
    if (!PACK_DISPLAY_OVERRIDE_KEYS.has(key)) continue;
    next[key] = incomingSections[key] ?? null;
  }
  return next;
}

/**
 * Builds the underlying lift_plans column update for source fields that were
 * actually changed in the editable PDF pack.
 */
export function buildLiftPlanPatchFromPackEdits(
  sections: CranePackSections,
  changedKeyList: string[],
) {
  const changedKeys = new Set(changedKeyList);
  const patch: CraneLiftPlanColumnPatch = {};

  setTextColumn(patch, "load_description", sections, changedKeys, [
    "scope_of_works",
  ]);
  setNumberColumn(patch, "load_weight", sections, changedKeys, [
    "range_chart_load_weight_kg",
    "crane_load_weight",
  ], weightKg);
  setNumberColumn(patch, "lift_radius", sections, changedKeys, [
    "range_chart_radius_m",
  ]);
  setNumberColumn(patch, "lift_height", sections, changedKeys, [
    "range_chart_tip_height_m",
  ]);
  setTextColumn(patch, "crane_configuration", sections, changedKeys, [
    "boom_configuration",
  ]);
  setTextColumn(patch, "outrigger_setup", sections, changedKeys, [
    "configuration_outrigger_note",
    "outrigger_setup_note",
  ]);
  setTextColumn(patch, "ground_conditions", sections, changedKeys, [
    "ground_conditions",
  ]);
  setTextColumn(patch, "sling_type", sections, changedKeys, [
    "equipment_sling_type",
  ]);
  setTextColumn(patch, "lifting_accessories", sections, changedKeys, [
    "equipment_lifting_accessories",
  ]);
  setTextColumn(patch, "method_statement", sections, changedKeys, [
    "lifting_procedure",
  ]);
  setTextColumn(patch, "risk_assessment", sections, changedKeys, [
    "risk_assessment_summary",
  ]);
  setTextColumn(patch, "site_hazards", sections, changedKeys, [
    "site_hazards",
    "overhead_obstructions",
  ]);
  setTextColumn(patch, "control_measures", sections, changedKeys, [
    "control_measures",
  ]);
  setTextColumn(patch, "ppe_required", sections, changedKeys, [
    "ppe_required",
  ]);
  setTextColumn(patch, "exclusion_zone_details", sections, changedKeys, [
    "traffic_pedestrian_management",
  ]);
  setTextColumn(patch, "weather_limitations", sections, changedKeys, [
    "weather_conditions",
  ]);
  setTextColumn(patch, "emergency_procedures", sections, changedKeys, [
    "emergency_procedure",
  ]);
  setTextColumn(patch, "lift_supervisor", sections, changedKeys, [
    "personnel_lift_supervisor",
    "delegation_lift_supervisor",
    "wind_lift_supervisor",
    "signature_ls_name",
  ]);
  setTextColumn(patch, "appointed_person", sections, changedKeys, [
    "cover_appointed_person",
    "ap_decl_name",
    "personnel_appointed_person",
    "delegation_appointed_person",
    "signature_ap_name",
  ]);
  setTextColumn(patch, "crane_operator", sections, changedKeys, [
    "personnel_crane_operator",
    "delegation_crane_operator",
    "signature_operator_name",
  ]);
  setTextColumn(patch, "approval_notes", sections, changedKeys, [
    "signoff_approval_notes",
  ]);

  return patch;
}
