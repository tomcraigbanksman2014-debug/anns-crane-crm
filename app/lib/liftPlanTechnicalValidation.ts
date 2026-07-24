import { calculateRangeChartCapacity } from "./rangeChartSpecs";

export type LiftPlanSections = Record<string, unknown>;

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function truthy(value: unknown) {
  const v = text(value).toLowerCase();
  return value === true || ["true", "1", "yes", "on", "enabled"].includes(v);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function calculateHiabTechnicalSections({
  profileId,
  profileTitle,
  setupLabel,
  sourceLabel,
  loadWeightKg,
  radiusM,
  sections,
}: {
  profileId?: string | null;
  profileTitle?: string | null;
  setupLabel?: string | null;
  sourceLabel?: string | null;
  loadWeightKg?: number | null;
  radiusM?: number | null;
  sections?: LiftPlanSections | null;
}) {
  const current = sections ?? {};
  const accessoryWeightKg = Math.max(0, numberOrNull(current.hiab_accessory_weight_kg) ?? 0);
  const load = numberOrNull(loadWeightKg);
  const radius = numberOrNull(radiusM);
  const totalLiftedWeightKg = load === null ? null : load + accessoryWeightKg;
  const craneName = text(profileTitle || current.hiab_profile_title || current.hiab_verified_configuration);
  const selectedSetup = text(setupLabel || current.hiab_verified_configuration || profileTitle);
  const selectedSource = text(sourceLabel || current.hiab_chart_source);
  const manualCapacityKg = numberOrNull(current.hiab_manual_chart_capacity_kg);
  const manualCapacitySource = text(current.hiab_manual_chart_source);
  const chartVerifiedBy = text(current.hiab_chart_verified_by);

  const structuredCapacityResult = radius && radius > 0
    ? calculateRangeChartCapacity({
        craneName,
        setupLabel: selectedSetup,
        sourceLabel: selectedSource,
        radiusM: radius,
        totalLiftedWeightKg,
      })
    : {
        capacityKg: null,
        method: "manual" as const,
        source: selectedSource || "Exact manufacturer chart",
        warning: "Enter the planned lifting radius before the chart capacity can be checked.",
        allowManualCapacityFallback: false,
        recognisedRuleId: null,
      };

  const isUploadedSpecProfile = String(profileId || current.hiab_profile_id || "").startsWith("spec-sheet-");
  const capacityResult = structuredCapacityResult.capacityKg === null && isUploadedSpecProfile && manualCapacityKg && manualCapacityKg > 0
    ? {
        ...structuredCapacityResult,
        capacityKg: manualCapacityKg,
        method: "manual" as const,
        source: manualCapacitySource || structuredCapacityResult.source || "Uploaded supplier/manufacturer chart",
        warning: undefined,
      }
    : structuredCapacityResult;

  const capacityKg = capacityResult.capacityKg;
  const utilisationPercent = capacityKg && totalLiftedWeightKg !== null
    ? round((totalLiftedWeightKg / capacityKg) * 100, 1)
    : null;

  const vehicleOperatingWeightKg = numberOrNull(current.hiab_vehicle_operating_weight_kg);
  const factor = numberOrNull(current.hiab_ground_bearing_factor) ?? 0.75;
  const worstCaseOutriggerLoadKg = vehicleOperatingWeightKg && totalLiftedWeightKg !== null
    ? round((vehicleOperatingWeightKg + totalLiftedWeightKg) * factor, 0)
    : null;

  const matLengthM = numberOrNull(current.hiab_mat_length_m);
  const matWidthM = numberOrNull(current.hiab_mat_width_m);
  const matCount = Math.max(1, Math.floor(numberOrNull(current.hiab_mats_under_loaded_outrigger) ?? 1));
  const singleMatAreaM2 = matLengthM && matWidthM ? matLengthM * matWidthM : null;
  const totalMatAreaM2 = singleMatAreaM2 ? singleMatAreaM2 * matCount : null;
  const pressureKgM2 = worstCaseOutriggerLoadKg && totalMatAreaM2
    ? round(worstCaseOutriggerLoadKg / totalMatAreaM2, 0)
    : null;
  const pressureTM2 = pressureKgM2 ? round(pressureKgM2 / 1000, 2) : null;

  const errors: string[] = [];
  if (!profileId || !craneName) errors.push("Select a recognised HIAB vehicle/profile.");
  if (load === null || load <= 0) errors.push("Enter the load weight.");
  if (radius === null || radius <= 0) errors.push("Enter the planned lifting radius.");
  if (!text(current.hiab_verified_configuration || selectedSetup)) errors.push("Confirm the verified fitted HIAB configuration.");
  if (!text(current.hiab_stabiliser_position)) errors.push("Record the selected stabiliser/support position.");
  if (!text(current.hiab_working_sector)) errors.push("Record the permitted working sector.");
  if (capacityKg === null) errors.push(capacityResult.warning || "The selected chart capacity could not be confirmed.");
  if (capacityResult.warning && capacityKg !== null) errors.push(capacityResult.warning);
  if (isUploadedSpecProfile) {
    if (!manualCapacityKg || manualCapacityKg <= 0) errors.push("Enter the AP-checked chart capacity for the hired HIAB at the planned radius.");
    if (!manualCapacitySource) errors.push("Record the hired HIAB manufacturer/supplier chart and page used.");
    if (!chartVerifiedBy) errors.push("Record who verified the hired HIAB chart capacity.");
  }
  if (capacityKg !== null && totalLiftedWeightKg !== null && totalLiftedWeightKg > capacityKg) {
    errors.push(`Gross lifted load ${Math.round(totalLiftedWeightKg).toLocaleString("en-GB")} kg exceeds the chart capacity ${Math.round(capacityKg).toLocaleString("en-GB")} kg at the planned radius.`);
  }
  if (vehicleOperatingWeightKg === null || vehicleOperatingWeightKg <= 0) errors.push("Enter the HIAB vehicle operating/gross planning weight for the worst-case ground-bearing calculation.");
  if (!matLengthM || !matWidthM) errors.push("Enter the mat/spreader length and width used under the worst-case loaded stabiliser.");

  return {
    profileId: profileId || text(current.hiab_profile_id) || null,
    craneName,
    selectedSetup,
    radiusM: radius,
    loadWeightKg: load,
    accessoryWeightKg,
    totalLiftedWeightKg,
    capacityKg,
    utilisationPercent,
    capacityMethod: capacityResult.method,
    capacitySource: capacityResult.source,
    chartRuleId: capacityResult.recognisedRuleId,
    vehicleOperatingWeightKg,
    factor,
    worstCaseOutriggerLoadKg,
    matLengthM,
    matWidthM,
    matCount,
    singleMatAreaM2: singleMatAreaM2 ? round(singleMatAreaM2, 3) : null,
    totalMatAreaM2: totalMatAreaM2 ? round(totalMatAreaM2, 3) : null,
    pressureKgM2,
    pressureTM2,
    errors: Array.from(new Set(errors.filter(Boolean))),
    sections: {
      ...current,
      hiab_profile_id: profileId || text(current.hiab_profile_id) || null,
      hiab_profile_title: craneName || null,
      hiab_verified_configuration: selectedSetup || null,
      hiab_chart_rule_id: capacityResult.recognisedRuleId || null,
      hiab_chart_capacity_kg: capacityKg === null ? null : String(Math.round(capacityKg)),
      hiab_chart_capacity_method: capacityResult.method,
      hiab_chart_source: capacityResult.source || selectedSource || null,
      hiab_manual_chart_capacity_kg: manualCapacityKg === null ? null : String(manualCapacityKg),
      hiab_manual_chart_source: manualCapacitySource || null,
      hiab_chart_verified_by: chartVerifiedBy || null,
      hiab_accessory_weight_kg: String(accessoryWeightKg),
      hiab_total_lifted_weight_kg: totalLiftedWeightKg === null ? null : String(round(totalLiftedWeightKg, 1)),
      hiab_utilisation_percent: utilisationPercent === null ? null : String(utilisationPercent),
      hiab_ground_bearing_factor: String(factor),
      hiab_worst_case_outrigger_load_kg: worstCaseOutriggerLoadKg === null ? null : String(worstCaseOutriggerLoadKg),
      hiab_mat_length_m: matLengthM === null ? null : String(matLengthM),
      hiab_mat_width_m: matWidthM === null ? null : String(matWidthM),
      hiab_mats_under_loaded_outrigger: String(matCount),
      hiab_single_mat_area_m2: singleMatAreaM2 === null ? null : String(round(singleMatAreaM2, 3)),
      hiab_total_mat_area_m2: totalMatAreaM2 === null ? null : String(round(totalMatAreaM2, 3)),
      hiab_ground_pressure_kg_m2: pressureKgM2 === null ? null : String(pressureKgM2),
      hiab_ground_pressure_t_m2: pressureTM2 === null ? null : String(pressureTM2),
      hiab_validation_status: errors.length ? "incomplete" : "verified",
      hiab_validation_note: errors.length ? errors.join(" ") : "Structured HIAB chart and worst-case ground-bearing checks complete.",
    } as LiftPlanSections,
  };
}

export function validateMobileCraneApprovalSections(sections: LiftPlanSections | null | undefined) {
  const current = sections ?? {};
  const hasStructuredRangeData = truthy(current.range_chart_enabled) || [
    current.range_chart_selected_setup_label,
    current.range_chart_radius_m,
    current.range_chart_total_lifted_weight_kg,
    current.range_chart_chart_capacity_kg,
  ].some((value) => text(value).length > 0);
  if (!hasStructuredRangeData) return [] as string[];

  const errors: string[] = [];
  const radius = numberOrNull(current.range_chart_radius_m);
  const total = numberOrNull(current.range_chart_total_lifted_weight_kg);
  const capacity = numberOrNull(current.range_chart_chart_capacity_kg);
  const setup = text(current.range_chart_selected_setup_label || current.selected_crane_setup_label);
  if (!setup) errors.push("Select and save the verified crane setup/chart.");
  if (radius === null || radius <= 0) errors.push("Enter and save the lifting radius in the range chart builder.");
  if (total === null || total <= 0) errors.push("Enter and save the gross lifted load in the range chart builder.");
  if (capacity === null || capacity <= 0) errors.push("Confirm and save the chart capacity for the selected setup.");
  if (capacity !== null && total !== null && total > capacity) {
    errors.push(`Gross lifted load ${Math.round(total).toLocaleString("en-GB")} kg exceeds the saved chart capacity ${Math.round(capacity).toLocaleString("en-GB")} kg.`);
  }

  return Array.from(new Set(errors.filter(Boolean)));
}
