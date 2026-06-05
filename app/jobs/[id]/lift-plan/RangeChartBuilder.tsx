"use client";

import type { CSSProperties, MutableRefObject, PointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CraneSetupOption } from "../../../lib/ai/equipmentProfiles";
import { calculateRangeChartBearingLoad, calculateRangeChartCapacity, getRangeChartLimits, getRangeChartSpecOptions } from "../../../lib/rangeChartSpecs";

type StringMap = Record<string, string | null | undefined>;

type ExternalSpecOption = {
  id: string;
  title: string;
  document_type?: string | null;
};

type RangeChartState = {
  enabled: boolean;
  clientName: string;
  craneName: string;
  notes: string;
  craneSourceMode: string;
  externalSpecDocumentId: string;
  externalSpecDocumentTitle: string;
  selectedSetupKey: string;
  selectedSetupLabel: string;
  selectedJibOptionKey: string;
  selectedJibOptionLabel: string;
  boomLengthM: string;
  boomAngleDeg: string;
  radiusM: string;
  tipHeightM: string;
  jibLengthM: string;
  jibAngleDeg: string;
  objectDistanceM: string;
  objectHeightM: string;
  objectWidthM: string;
  loadWeightKg: string;
  accessoryWeightKg: string;
  chartCapacityKg: string;
  matLengthM: string;
  matWidthM: string;
  matCount: string;
  bearingLoadKg: string;
  verificationNote: string;
};

type ChartNumbers = {
  radiusM: number;
  tipHeightM: number;
  objectDistanceM: number;
  objectHeightM: number;
  objectWidthM: number;
  jibLengthM: number;
  jibAngleDeg: number;
  loadWeightKg: number | null;
  accessoryWeightKg: number | null;
  chartCapacityKg: number | null;
  matLengthM: number | null;
  matWidthM: number | null;
  matCount: number;
  bearingLoadKg: number | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function tidyDisplayLabel(value: unknown) {
  const text = clean(value).replace(/\s+/g, " ");
  if (!text) return "";
  const words = text.split(" ").filter(Boolean);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const key = word.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result.join(" ").trim();
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

function savedCraneLooksStale(savedCraneName: unknown, defaultCraneName: unknown) {
  const saved = normaliseCraneForCompare(savedCraneName);
  const current = normaliseCraneForCompare(defaultCraneName);
  if (!saved || !current) return false;
  if (saved === current) return false;
  if (saved.includes(current) || current.includes(saved)) return false;
  return true;
}

function findFirstSetup(setupOptions: CraneSetupOption[], selectedKey: string) {
  const selected = clean(selectedKey);
  if (selected) {
    const exact = setupOptions.find((setup) => setup.key === selected);
    if (exact) return exact;
  }
  return setupOptions[0] ?? null;
}


function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function hasEnteredMatSpread(lengthM: number | null | undefined, widthM: number | null | undefined) {
  const length = Number(lengthM ?? 0);
  const width = Number(widthM ?? 0);
  return Number.isFinite(length) && Number.isFinite(width) && length > 0 && width > 0;
}

function numberForInput(value: unknown, fallback = "") {
  const n = numberOrNull(value);
  return n === null ? fallback : String(n);
}

function round(value: number, dp = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, dp);
  return Math.round(value * factor) / factor;
}

function fmt(value: number | null | undefined, suffix = "m") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${round(value, 2).toLocaleString("en-GB", { maximumFractionDigits: 2 })}${suffix ? ` ${suffix}` : ""}`;
}

function fmtKg(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("en-GB")} kg`;
}

function fmtArea(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return "—";
  return `${round(value, 3).toLocaleString("en-GB", { maximumFractionDigits: 3 })} m²`;
}

function fmtPressure(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return "—";
  return `${Math.round(value).toLocaleString("en-GB")} kg/m² / ${round(value / 1000, 2)} t/m²`;
}

function fmtLimit(value: number | null | undefined, suffix = "m") {
  return value !== null && value !== undefined && Number.isFinite(value) ? fmt(value, suffix) : "No structured limit";
}

function formatComputedSource(method: string, source: string) {
  return `${method === "automatic" ? "Auto" : "Manual check"}: ${source}`;
}

function clampNumberForInput(value: string, maxValue: number | null | undefined) {
  const parsed = numberOrNull(value);
  if (parsed === null || maxValue === null || maxValue === undefined || !Number.isFinite(maxValue) || parsed <= maxValue) return value;
  return String(maxValue);
}

function maybeNumber(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? null : value;
}


function inferPhysicalJibLengthFromText(value: unknown) {
  const text = clean(value).toLowerCase();
  if (!text) return null;
  const patterns = [
    /(\d+(?:\.\d+)?)\s*m\s*(?:jib|fly\s*jib|fly-jib|swingaway|swing-away|extension)/i,
    /(?:jib|fly\s*jib|fly-jib|swingaway|swing-away|extension)\s*(?:-|–|—|:)?\s*(\d+(?:\.\d+)?)\s*m/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = numberOrNull(match[1]);
      if (parsed && parsed > 0) return parsed;
    }
  }
  return null;
}

function inferPhysicalJibLength(setup?: CraneSetupOption | null) {
  if (!setup) return null;
  return inferPhysicalJibLengthFromText([setup.label, setup.boomConfiguration, setup.configurationNote, setup.chartNote].filter(Boolean).join(" "));
}

function normalisePhysicalJibLength(rawValue: number | null, radiusM: number | null, boomLengthM: number | null, inferredValue: number | null) {
  const raw = rawValue && rawValue > 0 ? rawValue : null;
  const inferred = inferredValue && inferredValue > 0 ? inferredValue : null;
  if (!raw) return inferred ?? 0;

  // Some extracted spec data stores max jib outreach / max radius in the jib field.
  // That makes the drawing fold back on itself. Prefer a physical jib length parsed from the setup label when available.
  const tooLargeForBoom = boomLengthM && raw > boomLengthM * 1.05;
  const tooLargeForRadius = radiusM && raw > radiusM * 1.35;
  if ((tooLargeForBoom || tooLargeForRadius) && inferred && inferred < raw) return inferred;

  return raw;
}

function parseBool(value: unknown) {
  const text = clean(value).toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(text);
}

function firstNoneOrFirstJib(jibOptions: ReturnType<typeof getRangeChartSpecOptions>["jibOptions"]) {
  return jibOptions.find((item) => item.key === "none" || /no\s+jib|main\s+boom\s+only/i.test(item.label)) ?? jibOptions[0] ?? null;
}

function profileMatchesKey(profileKey: string | null | undefined, selectedKey: string) {
  const cleanProfile = clean(profileKey);
  const cleanSelected = clean(selectedKey);
  if (!cleanProfile || !cleanSelected) return false;
  return cleanSelected === cleanProfile || cleanSelected === `profile:${cleanProfile}`;
}

function textMentionsDifferentKnownCrane(value: unknown, currentCraneName: unknown) {
  const text = normaliseCraneForCompare(value);
  const current = normaliseCraneForCompare(currentCraneName);
  if (!text || !current) return false;

  const known = [
    { key: "bocker", aliases: ["bocker", "ak46", "ak 46"] },
    { key: "jekko", aliases: ["jekko", "spx532", "spx 532"] },
    { key: "grove", aliases: ["grove", "gmk4080", "gmk 4080"] },
    { key: "mtk35", aliases: ["marchetti", "mtk35", "mtk 35"] },
    { key: "hk40", aliases: ["tadano", "faun", "hk40", "hk 40"] },
  ];

  const currentKeys = new Set(
    known
      .filter((item) => item.aliases.some((alias) => current.includes(alias.replace(/\s+/g, " "))))
      .map((item) => item.key)
  );

  if (!currentKeys.size) return false;

  return known.some((item) => {
    if (currentKeys.has(item.key)) return false;
    return item.aliases.some((alias) => text.includes(alias.replace(/\s+/g, " ")));
  });
}

function currentCraneIsAk46(value: unknown) {
  const current = normaliseCraneForCompare(value);
  return /(?:^| )(?:bocker|ak46|ak 46)(?: |$)/.test(current);
}

function ak46SavedSetupShouldBeReset({
  defaultCraneName,
  selectedSetupKey,
  selectedSetupLabel,
  selectedJibKey,
  selectedJibLabel,
}: {
  defaultCraneName: unknown;
  selectedSetupKey: unknown;
  selectedSetupLabel: unknown;
  selectedJibKey: unknown;
  selectedJibLabel: unknown;
}) {
  if (!currentCraneIsAk46(defaultCraneName)) return false;

  const setupText = clean([selectedSetupKey, selectedSetupLabel, selectedJibKey, selectedJibLabel].filter(Boolean).join(" ")).toLowerCase();
  if (!setupText) return false;

  // Older emergency builds auto-saved the AK46 as the optional 46 m + 11 m hydraulic-jib setup.
  // That made normal Böcker jobs jump out to a huge radius and show 500 kg capacity.
  // Treat those saved selector values as stale defaults and return to the AK46 crane-operation table.
  return /ak46-main-46|optional\s+max\s+extension|max\s+extension\s+up\s+to\s+46|ak46-jib-|hydraulic\s+jib|11\.0\s*m\s+hydraulic\s+jib/.test(setupText);
}

function defaultRangeState({
  sections,
  defaultClientName,
  defaultCraneName,
  defaultNotes,
  liftRadiusM,
  liftHeightM,
  loadWeightKg,
  setupOptions,
}: {
  sections: StringMap;
  defaultClientName: string;
  defaultCraneName: string;
  defaultNotes: string;
  liftRadiusM?: number | null;
  liftHeightM?: number | null;
  loadWeightKg?: number | null;
  setupOptions: CraneSetupOption[];
}): RangeChartState {
  const currentSpecOptions = getRangeChartSpecOptions({ craneName: defaultCraneName });
  const structuredProfiles = currentSpecOptions.profileOptions;
  const structuredJibs = currentSpecOptions.jibOptions;
  const firstStructuredProfile = structuredProfiles[0] ?? null;
  const firstStructuredJib = firstNoneOrFirstJib(structuredJibs);

  const savedCraneName = firstText(sections.range_chart_crane_name, sections.custom_crane_name);
  const forceCurrentJobCrane = savedCraneLooksStale(savedCraneName, defaultCraneName);

  const rawSelectedSetupKey = clean(sections.range_chart_selected_setup_key || sections.selected_crane_setup_key);
  const rawSelectedSetupLabel = firstText(sections.range_chart_selected_setup_label, sections.selected_crane_setup_label);
  const rawJibKey = clean(sections.range_chart_selected_jib_option_key);
  const rawJibLabel = firstText(sections.range_chart_selected_jib_option_label);

  const selectedStructuredProfile =
    structuredProfiles.find((profile) => profileMatchesKey(profile.key, rawSelectedSetupKey)) ?? null;
  const selectedStructuredJib = structuredJibs.find((jib) => clean(jib.key) === rawJibKey) ?? null;

  const recognisedStructuredCrane = Boolean(currentSpecOptions.rule);
  const ak46SavedExtensionSetup = ak46SavedSetupShouldBeReset({
    defaultCraneName,
    selectedSetupKey: rawSelectedSetupKey,
    selectedSetupLabel: rawSelectedSetupLabel,
    selectedJibKey: rawJibKey,
    selectedJibLabel: rawJibLabel,
  });

  const selectedSetupFromPack = forceCurrentJobCrane || ak46SavedExtensionSetup ? "" : rawSelectedSetupKey;
  const firstSetup = findFirstSetup(setupOptions, selectedSetupFromPack);
  const selectedSetupStillValid =
    Boolean(selectedStructuredProfile) ||
    (!structuredProfiles.length && Boolean(firstSetup && (!rawSelectedSetupKey || firstSetup.key === rawSelectedSetupKey)));

  const staleSavedSetup =
    forceCurrentJobCrane ||
    ak46SavedExtensionSetup ||
    textMentionsDifferentKnownCrane(rawSelectedSetupLabel || rawSelectedSetupKey, defaultCraneName) ||
    textMentionsDifferentKnownCrane(rawJibLabel || rawJibKey, defaultCraneName) ||
    (recognisedStructuredCrane && structuredProfiles.length > 0 && !selectedSetupStillValid) ||
    (recognisedStructuredCrane && rawJibKey && structuredJibs.length > 0 && !selectedStructuredJib);

  const useStructuredDefaults = recognisedStructuredCrane && (staleSavedSetup || !rawSelectedSetupKey || structuredProfiles.length > 0);
  const activeStructuredProfile = useStructuredDefaults
    ? (selectedStructuredProfile && !staleSavedSetup ? selectedStructuredProfile : firstStructuredProfile)
    : null;
  const activeStructuredJib = useStructuredDefaults
    ? (selectedStructuredJib && !staleSavedSetup ? selectedStructuredJib : firstStructuredJib)
    : null;

  const setupBoomLength = activeStructuredProfile ? null : numberOrNull(firstSetup?.boomLengthM);
  const setupJibLength = activeStructuredJib ? activeStructuredJib.lengthM : inferPhysicalJibLength(firstSetup);
  const resetRangeGeometry = staleSavedSetup || forceCurrentJobCrane || ak46SavedExtensionSetup;

  const radius = resetRangeGeometry ? (liftRadiusM ?? 8) : (numberOrNull(sections.range_chart_radius_m) ?? liftRadiusM ?? 12);
  const tipHeight = resetRangeGeometry ? (liftHeightM ?? Math.max(6, radius * 0.75)) : (numberOrNull(sections.range_chart_tip_height_m) ?? liftHeightM ?? Math.max(6, radius * 0.75));
  const objectHeight = resetRangeGeometry ? Math.max(1, Math.min(tipHeight - 1, liftHeightM ?? tipHeight * 0.6)) : (numberOrNull(sections.range_chart_object_height_m) ?? Math.max(1, Math.min(tipHeight - 1, liftHeightM ?? tipHeight * 0.6)));
  const objectDistance = resetRangeGeometry ? Math.max(1, radius - 4) : (numberOrNull(sections.range_chart_object_distance_m) ?? Math.max(1, radius - 4));

  const selectedSetupKey = activeStructuredProfile
    ? `profile:${activeStructuredProfile.key}`
    : firstText(staleSavedSetup ? "" : rawSelectedSetupKey, firstSetup?.key);
  const selectedSetupLabel = activeStructuredProfile
    ? activeStructuredProfile.label
    : firstText(staleSavedSetup ? "" : rawSelectedSetupLabel, firstSetup?.label);
  const selectedJibOptionKey = activeStructuredJib ? activeStructuredJib.key : (staleSavedSetup ? "" : rawJibKey);
  const selectedJibOptionLabel = activeStructuredJib ? activeStructuredJib.label : (staleSavedSetup ? "" : rawJibLabel);

  const clearStoredComputedValues = recognisedStructuredCrane || staleSavedSetup || forceCurrentJobCrane || resetRangeGeometry;
  const clearBoomGeometry = staleSavedSetup || forceCurrentJobCrane || resetRangeGeometry;

  return {
    enabled: parseBool(sections.range_chart_enabled) || Boolean(sections.range_chart_radius_m || sections.range_chart_tip_height_m),
    clientName: firstText(sections.range_chart_client, defaultClientName),
    craneName: tidyDisplayLabel(forceCurrentJobCrane ? defaultCraneName : firstText(sections.range_chart_crane_name, sections.custom_crane_name, defaultCraneName)),
    notes: firstText(sections.range_chart_notes, defaultNotes),
    craneSourceMode: recognisedStructuredCrane || forceCurrentJobCrane ? "selected_crm_crane" : firstText(sections.range_chart_crane_source_mode, "selected_crm_crane"),
    externalSpecDocumentId: recognisedStructuredCrane || forceCurrentJobCrane ? "" : firstText(sections.range_chart_external_spec_document_id),
    externalSpecDocumentTitle: recognisedStructuredCrane || forceCurrentJobCrane ? "" : firstText(sections.range_chart_external_spec_document_title),
    selectedSetupKey,
    selectedSetupLabel,
    selectedJibOptionKey,
    selectedJibOptionLabel,
    boomLengthM: clearBoomGeometry ? "" : numberForInput(sections.range_chart_boom_length_m, setupBoomLength ? String(setupBoomLength) : ""),
    boomAngleDeg: clearBoomGeometry ? "" : numberForInput(sections.range_chart_boom_angle_deg, ""),
    radiusM: numberForInput(radius, "12"),
    tipHeightM: numberForInput(tipHeight, "10"),
    jibLengthM: numberForInput(
      clearBoomGeometry
        ? (activeStructuredJib?.lengthM ?? 0)
        : normalisePhysicalJibLength(numberOrNull(sections.range_chart_jib_length_m), radius, setupBoomLength, setupJibLength),
      setupJibLength ? String(setupJibLength) : "0"
    ),
    jibAngleDeg: clearBoomGeometry ? "20" : numberForInput(sections.range_chart_jib_angle_deg, "20"),
    objectDistanceM: numberForInput(objectDistance, "8"),
    objectHeightM: numberForInput(objectHeight, "4"),
    objectWidthM: numberForInput(sections.range_chart_object_width_m, "8"),
    loadWeightKg: numberForInput(sections.range_chart_load_weight_kg, loadWeightKg ? String(loadWeightKg) : ""),
    accessoryWeightKg: numberForInput(sections.range_chart_accessory_weight_kg, ""),
    chartCapacityKg: clearStoredComputedValues ? "" : numberForInput(sections.range_chart_chart_capacity_kg, ""),
    matLengthM: numberForInput(sections.range_chart_mat_length_m, numberForInput(sections.ground_bearing_mat_length_m, "")),
    matWidthM: numberForInput(sections.range_chart_mat_width_m, numberForInput(sections.ground_bearing_mat_width_m, "")),
    matCount: numberForInput(
      sections.range_chart_mats_under_loaded_outrigger,
      numberForInput(sections.ground_bearing_mats_under_loaded_outrigger, "1")
    ),
    bearingLoadKg: clearStoredComputedValues ? "" : numberForInput(sections.range_chart_bearing_load_kg, numberForInput(sections.ground_bearing_bearing_load, "")),
    verificationNote: firstText(
      activeStructuredProfile?.source,
      firstSetup?.chartNote,
      sections.range_chart_verification_note,
      "Planning sketch only. Appointed person must verify the manufacturer/supplier load chart, exact radius, boom/jib configuration, counterweight/ballast, outrigger setup, accessories and ground bearing before approval."
    ),
  };
}

function chartNumbers(chart: RangeChartState): ChartNumbers {
  return {
    radiusM: Math.max(0.5, numberOrNull(chart.radiusM) ?? 12),
    tipHeightM: Math.max(0.5, numberOrNull(chart.tipHeightM) ?? 10),
    objectDistanceM: Math.max(0, numberOrNull(chart.objectDistanceM) ?? 8),
    objectHeightM: Math.max(0.1, numberOrNull(chart.objectHeightM) ?? 4),
    objectWidthM: Math.max(0.5, numberOrNull(chart.objectWidthM) ?? 8),
    jibLengthM: Math.max(
      0,
      normalisePhysicalJibLength(
        numberOrNull(chart.jibLengthM),
        Math.max(0.5, numberOrNull(chart.radiusM) ?? 12),
        numberOrNull(chart.boomLengthM),
        inferPhysicalJibLengthFromText(chart.selectedSetupLabel)
      )
    ),
    jibAngleDeg: numberOrNull(chart.jibAngleDeg) ?? 20,
    loadWeightKg: numberOrNull(chart.loadWeightKg),
    accessoryWeightKg: numberOrNull(chart.accessoryWeightKg),
    chartCapacityKg: numberOrNull(chart.chartCapacityKg),
    matLengthM: numberOrNull(chart.matLengthM),
    matWidthM: numberOrNull(chart.matWidthM),
    matCount: Math.max(1, Math.round(numberOrNull(chart.matCount) ?? 1)),
    bearingLoadKg: numberOrNull(chart.bearingLoadKg),
  };
}

function calculatedFrom(numbers: ChartNumbers) {
  const pivotHeight = 1.1;
  const jibAngleRad = (numbers.jibAngleDeg * Math.PI) / 180;
  const hookX = numbers.radiusM;
  const hookY = numbers.tipHeightM;
  const jibBackX = numbers.jibLengthM > 0 ? numbers.jibLengthM * Math.cos(jibAngleRad) : 0;
  const jibBackY = numbers.jibLengthM > 0 ? numbers.jibLengthM * Math.sin(jibAngleRad) : 0;
  const boomEndX = Math.max(0.1, hookX - jibBackX);
  const boomEndY = Math.max(pivotHeight, hookY - jibBackY);
  const boomLength = Math.sqrt(Math.pow(boomEndX, 2) + Math.pow(boomEndY - pivotHeight, 2));
  const boomAngle = (Math.atan2(boomEndY - pivotHeight, boomEndX) * 180) / Math.PI;
  const clearance = hookY - numbers.objectHeightM;
  const totalLiftedWeight = (numbers.loadWeightKg ?? 0) + (numbers.accessoryWeightKg ?? 0);
  const utilisation = totalLiftedWeight && numbers.chartCapacityKg ? (totalLiftedWeight / numbers.chartCapacityKg) * 100 : null;
  const enteredMatSpread = hasEnteredMatSpread(numbers.matLengthM, numbers.matWidthM);
  const singleMatArea = enteredMatSpread && numbers.matLengthM && numbers.matWidthM ? numbers.matLengthM * numbers.matWidthM : null;
  const matArea = singleMatArea ? singleMatArea * Math.max(1, numbers.matCount || 1) : null;
  const pressureKgM2 = numbers.bearingLoadKg && matArea ? numbers.bearingLoadKg / matArea : null;

  return {
    pivotHeight,
    hookX,
    hookY,
    boomEndX,
    boomEndY,
    boomLength,
    boomAngle,
    clearance,
    totalLiftedWeight: totalLiftedWeight || null,
    utilisation,
    singleMatArea,
    matArea,
    pressureKgM2,
  };
}


function hookFromBoomGeometry({
  boomLengthM,
  boomAngleDeg,
  jibLengthM,
  jibAngleDeg,
}: {
  boomLengthM: number;
  boomAngleDeg: number;
  jibLengthM: number;
  jibAngleDeg: number;
}) {
  const pivotHeight = 1.1;
  const boomAngleRad = (boomAngleDeg * Math.PI) / 180;
  const jibAngleRad = (jibAngleDeg * Math.PI) / 180;
  const boomEndX = Math.max(0.1, boomLengthM * Math.cos(boomAngleRad));
  const boomEndY = Math.max(pivotHeight, pivotHeight + boomLengthM * Math.sin(boomAngleRad));
  const hookX = boomEndX + Math.max(0, jibLengthM) * Math.cos(jibAngleRad);
  const hookY = boomEndY + Math.max(0, jibLengthM) * Math.sin(jibAngleRad);
  return {
    radiusM: round(Math.max(0.5, hookX), 2),
    tipHeightM: round(Math.max(0.5, hookY), 2),
  };
}

function boomFromHookGeometry({
  radiusM,
  tipHeightM,
  jibLengthM,
  jibAngleDeg,
}: {
  radiusM: number;
  tipHeightM: number;
  jibLengthM: number;
  jibAngleDeg: number;
}) {
  const pivotHeight = 1.1;
  const jibAngleRad = (jibAngleDeg * Math.PI) / 180;
  const boomEndX = Math.max(0.1, radiusM - Math.max(0, jibLengthM) * Math.cos(jibAngleRad));
  const boomEndY = Math.max(pivotHeight, tipHeightM - Math.max(0, jibLengthM) * Math.sin(jibAngleRad));
  const boomLengthM = Math.sqrt(Math.pow(boomEndX, 2) + Math.pow(boomEndY - pivotHeight, 2));
  const boomAngleDeg = (Math.atan2(boomEndY - pivotHeight, boomEndX) * 180) / Math.PI;
  return {
    boomLengthM: round(boomLengthM, 2),
    boomAngleDeg: round(boomAngleDeg, 2),
  };
}

function clampNumber(value: number, maxValue: number | null | undefined) {
  if (!Number.isFinite(value)) return value;
  return maxValue && value > maxValue ? maxValue : value;
}

function calcScale(numbers: ChartNumbers) {
  const maxX = Math.max(numbers.radiusM + 4, numbers.objectDistanceM + numbers.objectWidthM + 4, 12);
  const maxY = Math.max(numbers.tipHeightM + 4, numbers.objectHeightM + 4, 8);
  return { maxX, maxY };
}

export default function RangeChartBuilder({
  jobId,
  initialSections,
  defaultClientName,
  defaultCraneName,
  defaultNotes,
  liftRadiusM,
  liftHeightM,
  loadWeightKg,
  setupOptions,
  externalSpecOptions,
}: {
  jobId: string;
  initialSections: StringMap;
  defaultClientName: string;
  defaultCraneName: string;
  defaultNotes?: string | null;
  liftRadiusM?: number | null;
  liftHeightM?: number | null;
  loadWeightKg?: number | null;
  setupOptions?: CraneSetupOption[];
  externalSpecOptions?: ExternalSpecOption[];
}) {
  const normalisedSetups = useMemo(() => {
    const seen = new Set<string>();
    return (setupOptions ?? []).filter((setup) => {
      const key = clean(setup.key || setup.label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [setupOptions]);

  const initialSavedCraneWasStale = useMemo(
    () => savedCraneLooksStale(firstText(initialSections.range_chart_crane_name, initialSections.custom_crane_name), defaultCraneName),
    [initialSections, defaultCraneName]
  );
  const initialRangeDataNeedsReset = useMemo(
    () => initialSavedCraneWasStale || ak46SavedSetupShouldBeReset({
      defaultCraneName,
      selectedSetupKey: initialSections.range_chart_selected_setup_key || initialSections.selected_crane_setup_key,
      selectedSetupLabel: initialSections.range_chart_selected_setup_label || initialSections.selected_crane_setup_label,
      selectedJibKey: initialSections.range_chart_selected_jib_option_key,
      selectedJibLabel: initialSections.range_chart_selected_jib_option_label,
    }),
    [initialSavedCraneWasStale, initialSections, defaultCraneName]
  );

  const [chart, setChart] = useState<RangeChartState>(() =>
    defaultRangeState({
      sections: initialSections,
      defaultClientName,
      defaultCraneName,
      defaultNotes: defaultNotes ?? "",
      liftRadiusM,
      liftHeightM,
      loadWeightKg,
      setupOptions: normalisedSetups,
    })
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [autoSyncMessage, setAutoSyncMessage] = useState("");
  const [dragging, setDragging] = useState<"hook" | "boom" | "object" | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSyncStartedRef = useRef(false);
  const lastAutoSyncPayloadRef = useRef("");
  const currentJobCraneKey = useMemo(() => normaliseCraneForCompare(defaultCraneName), [defaultCraneName]);

  useEffect(() => {
    if (!currentJobCraneKey) return;
    if (!savedCraneLooksStale(chart.craneName, defaultCraneName)) return;

    setChart((prev) => {
      const firstSetup = normalisedSetups[0] ?? null;
      return {
        ...prev,
        craneName: tidyDisplayLabel(defaultCraneName),
        craneSourceMode: "selected_crm_crane",
        externalSpecDocumentId: "",
        externalSpecDocumentTitle: "",
        selectedSetupKey: firstSetup?.key ?? "",
        selectedSetupLabel: firstSetup?.label ?? "",
        selectedJibOptionKey: "",
        selectedJibOptionLabel: "",
        chartCapacityKg: "",
        bearingLoadKg: "",
        verificationNote:
          firstSetup?.chartNote ||
          prev.verificationNote ||
          "Planning sketch only. Appointed person must verify the manufacturer/supplier load chart, exact radius, boom/jib configuration, counterweight/ballast, outrigger setup, accessories and ground bearing before approval.",
      };
    });
  }, [currentJobCraneKey, defaultCraneName, normalisedSetups, chart.craneName]);

  const activeSetup = normalisedSetups.find((item) => item.key === chart.selectedSetupKey) ?? null;
  const cleanCraneName = tidyDisplayLabel(chart.craneName);
  const specOptions = getRangeChartSpecOptions({ craneName: cleanCraneName, setupLabel: chart.selectedSetupLabel, sourceLabel: chart.externalSpecDocumentTitle });
  const structuredProfileOptions = specOptions.profileOptions;
  const structuredJibOptions = specOptions.jibOptions;
  const activeStructuredProfile = structuredProfileOptions.find((item) => chart.selectedSetupKey === `profile:${item.key}` || chart.selectedSetupKey === item.key) ?? null;
  const activeJibOption = structuredJibOptions.find((item) => item.key === chart.selectedJibOptionKey) ?? null;
  const numbers = chartNumbers(chart);
  const calc = calculatedFrom(numbers);
  const inferredSetupJibLength = activeJibOption ? activeJibOption.lengthM : (inferPhysicalJibLength(activeSetup) ?? inferPhysicalJibLengthFromText(chart.selectedSetupLabel));
  const setupMaxBoom = activeStructuredProfile?.maxBoomLengthM ?? activeStructuredProfile?.defaultBoomLengthM ?? maybeNumber(activeSetup?.boomLengthM);
  const setupMaxRadius = activeStructuredProfile?.maxRadiusM ?? activeJibOption?.maxRadiusM ?? maybeNumber(activeSetup?.maxRadiusM);
  const setupMaxTipHeight = activeStructuredProfile?.maxTipHeightM ?? activeJibOption?.maxTipHeightM ?? maybeNumber(activeSetup?.maxTipHeightM);
  const setupMaxJib = activeJibOption ? activeJibOption.lengthM : inferredSetupJibLength;
  const setupSelectOptions = structuredProfileOptions.length
    ? structuredProfileOptions.map((profile) => ({ value: `profile:${profile.key}`, label: profile.label }))
    : normalisedSetups.map((setup) => ({ value: setup.key, label: setup.label }));
  const limits = getRangeChartLimits({
    craneName: cleanCraneName,
    setupLabel: chart.selectedSetupLabel,
    sourceLabel: chart.externalSpecDocumentTitle,
    setupMaxBoomLengthM: maybeNumber(setupMaxBoom),
    setupMaxRadiusM: maybeNumber(setupMaxRadius),
    setupMaxTipHeightM: maybeNumber(setupMaxTipHeight),
    setupMaxPhysicalJibLengthM: maybeNumber(setupMaxJib),
  });
  const enteredBoomLength = numberOrNull(chart.boomLengthM);
  const enteredBoomAngle = numberOrNull(chart.boomAngleDeg);
  const displayedBoomLength = enteredBoomLength ?? calc.boomLength;
  const displayedBoomAngle = enteredBoomAngle ?? calc.boomAngle;
  const capacityResult = calculateRangeChartCapacity({
    craneName: cleanCraneName,
    setupLabel: chart.selectedSetupLabel,
    sourceLabel: chart.externalSpecDocumentTitle,
    radiusM: numbers.radiusM,
    boomLengthM: displayedBoomLength,
    jibLengthM: numbers.jibLengthM,
    jibAngleDeg: numbers.jibAngleDeg,
    totalLiftedWeightKg: calc.totalLiftedWeight,
  });
  const bearingResult = calculateRangeChartBearingLoad({
    craneName: cleanCraneName,
    setupLabel: chart.selectedSetupLabel,
    sourceLabel: chart.externalSpecDocumentTitle,
    totalLiftedWeightKg: calc.totalLiftedWeight,
  });
  const storedManualChartCapacityKg = numberOrNull(chart.chartCapacityKg);
  const effectiveChartCapacityKg = capacityResult.capacityKg ?? (capacityResult.allowManualCapacityFallback ? storedManualChartCapacityKg : null);
  const effectiveBearingLoadKg = bearingResult.bearingLoadKg ?? numberOrNull(chart.bearingLoadKg);
  const effectiveUtilisation = calc.totalLiftedWeight && effectiveChartCapacityKg ? (calc.totalLiftedWeight / effectiveChartCapacityKg) * 100 : null;
  const effectivePressureKgM2 = effectiveBearingLoadKg && calc.matArea ? effectiveBearingLoadKg / calc.matArea : null;
  const scale = calcScale(numbers);
  const totalWeightText = calc.totalLiftedWeight ? fmtKg(calc.totalLiftedWeight) : "—";
  const chartCapacityText = effectiveChartCapacityKg ? fmtKg(effectiveChartCapacityKg) : "Manual chart check";
  const bearingLoadText = effectiveBearingLoadKg ? fmtKg(effectiveBearingLoadKg) : "Manual reaction check";
  const rawJibLength = numberOrNull(chart.jibLengthM);
  const correctedJibLength = rawJibLength !== null && Math.abs(rawJibLength - numbers.jibLengthM) > 0.1;
  const matPressureText = fmtPressure(effectivePressureKgM2);
  const matAreaText = fmtArea(calc.matArea);
  const estimatedBearingFactor = limits.estimatedBearingFactor ?? 0.75;
  const planningEstimateKg = limits.planningWeightKg && calc.totalLiftedWeight
    ? (limits.planningWeightKg + calc.totalLiftedWeight) * estimatedBearingFactor
    : null;
  const bearingSourceLower = String(bearingResult.source ?? "").toLowerCase();
  const isPublishedBearingReference = Boolean(effectiveBearingLoadKg && /published|static outrigger|outrigger load|reaction/.test(bearingSourceLower));
  const bearingFormulaBase = effectiveBearingLoadKg && isPublishedBearingReference
    ? [
        `Manufacturer/supplier outrigger reaction/load reference used: ${fmtKg(effectiveBearingLoadKg)}`,
        planningEstimateKg ? `Planning estimate would be (${fmtKg(limits.planningWeightKg)} + ${fmtKg(calc.totalLiftedWeight)}) × ${estimatedBearingFactor} = ${fmtKg(planningEstimateKg)}` : "",
      ].filter(Boolean).join(". ")
    : effectiveBearingLoadKg && planningEstimateKg
      ? `(${fmtKg(limits.planningWeightKg)} + ${fmtKg(calc.totalLiftedWeight)}) × ${estimatedBearingFactor} = ${fmtKg(effectiveBearingLoadKg)}`
      : effectiveBearingLoadKg
        ? `Estimated max outrigger load = ${fmtKg(effectiveBearingLoadKg)}`
        : "Estimated max outrigger load requires crane and load details";
  const matPressureFormulaText = effectiveBearingLoadKg && calc.matArea && effectivePressureKgM2
    ? `${bearingFormulaBase}. ${fmtKg(effectiveBearingLoadKg)} ÷ ${fmtArea(calc.matArea)} = ${fmtPressure(effectivePressureKgM2)}`
    : bearingFormulaBase;
  const horizontalGapM = numbers.radiusM - numbers.objectDistanceM;
  const maxBoomExceeded = limits.maxBoomLengthM ? displayedBoomLength > limits.maxBoomLengthM + 0.01 : false;
  const requiredBoomExceeded = limits.maxBoomLengthM ? calc.boomLength > limits.maxBoomLengthM + 0.01 : false;
  const maxJibExceeded = limits.maxPhysicalJibLengthM ? numbers.jibLengthM > limits.maxPhysicalJibLengthM + 0.01 : false;
  const maxRadiusExceeded = limits.maxRadiusM ? numbers.radiusM > limits.maxRadiusM + 0.01 : false;
  const maxTipHeightExceeded = limits.maxTipHeightM ? numbers.tipHeightM > limits.maxTipHeightM + 0.01 : false;
  const chartDangerWarnings = [
    calc.clearance < 0 ? `Hook/tip point is ${fmt(Math.abs(calc.clearance))} below the top of the object. Raise the hook point, lower the object height, or choose another crane/setup.` : "",
    horizontalGapM < 0 ? `Hook/radius is ${fmt(Math.abs(horizontalGapM))} short of the object face. Increase radius/reposition the crane, or reduce the object distance.` : "",
    requiredBoomExceeded ? `Required boom length is ${fmt(calc.boomLength)}, which is over the ${fmt(limits.maxBoomLengthM)} maximum for this crane/setup.` : "",
    maxBoomExceeded ? `Entered boom length is over the ${fmt(limits.maxBoomLengthM)} maximum for this crane/setup.` : "",
    maxJibExceeded ? `Entered physical jib length is over the ${fmt(limits.maxPhysicalJibLengthM)} maximum for this crane/setup.` : "",
    maxRadiusExceeded ? `Radius is over the ${fmt(limits.maxRadiusM)} structured maximum for this crane/setup.` : "",
    maxTipHeightExceeded ? `Tip/hook height is over the ${fmt(limits.maxTipHeightM)} structured maximum for this crane/setup.` : "",
    effectiveUtilisation && effectiveUtilisation > 100 ? `Total lifted weight is over the calculated/entered chart capacity by ${round(effectiveUtilisation - 100, 1)}%. Do not approve without selecting a valid setup/chart.` : "",
    capacityResult.warning && effectiveUtilisation && effectiveUtilisation > 100 ? capacityResult.warning : "",
    correctedJibLength ? `Jib value looked like a max outreach/radius, so the sketch is using ${fmt(numbers.jibLengthM)} as the physical jib length. Enter the actual jib length if different.` : "",
  ].filter(Boolean);

  const chartAdvisories = [
    capacityResult.setupAdvice || "",
    capacityResult.warning && !(effectiveUtilisation && effectiveUtilisation > 100) ? capacityResult.warning : "",
    bearingResult.warning || "",
    calc.totalLiftedWeight && !effectiveChartCapacityKg ? "Total lifted weight is entered, but chart capacity at radius is not available automatically for this setup. Check the exact load chart before approval." : "",
  ].filter(Boolean);

  const chartWarnings = [...chartDangerWarnings, ...chartAdvisories];

  function update(key: keyof RangeChartState, value: string | boolean) {
    const nextValue = key === "craneName" ? tidyDisplayLabel(value) : value;
    setChart((prev) => ({ ...prev, [key]: nextValue }));
  }

  function limitedValueForKey(key: keyof RangeChartState, value: string) {
    let nextValue = value;
    if (key === "boomLengthM") nextValue = clampNumberForInput(value, limits.maxBoomLengthM);
    if (key === "jibLengthM") nextValue = clampNumberForInput(value, limits.maxPhysicalJibLengthM);
    if (key === "radiusM") nextValue = clampNumberForInput(value, limits.maxRadiusM);
    if (key === "tipHeightM") nextValue = clampNumberForInput(value, limits.maxTipHeightM);
    return nextValue;
  }

  function syncHookFromBoom(next: RangeChartState) {
    const boomLength = numberOrNull(next.boomLengthM);
    const boomAngle = numberOrNull(next.boomAngleDeg);
    if (boomLength === null || boomAngle === null) return next;
    const hook = hookFromBoomGeometry({
      boomLengthM: boomLength,
      boomAngleDeg: boomAngle,
      jibLengthM: numberOrNull(next.jibLengthM) ?? 0,
      jibAngleDeg: numberOrNull(next.jibAngleDeg) ?? 0,
    });
    return { ...next, radiusM: String(hook.radiusM), tipHeightM: String(hook.tipHeightM) };
  }

  function syncBoomFromHook(next: RangeChartState) {
    const radius = numberOrNull(next.radiusM);
    const tipHeight = numberOrNull(next.tipHeightM);
    if (radius === null || tipHeight === null) return next;
    const derived = boomFromHookGeometry({
      radiusM: radius,
      tipHeightM: tipHeight,
      jibLengthM: numberOrNull(next.jibLengthM) ?? 0,
      jibAngleDeg: numberOrNull(next.jibAngleDeg) ?? 0,
    });
    const limitedBoomLength = clampNumber(derived.boomLengthM, limits.maxBoomLengthM);
    const afterBoom = { ...next, boomLengthM: String(limitedBoomLength), boomAngleDeg: String(derived.boomAngleDeg) };
    return limitedBoomLength !== derived.boomLengthM ? syncHookFromBoom(afterBoom) : afterBoom;
  }

  function updateLimitedNumber(key: keyof RangeChartState, value: string) {
    const nextValue = limitedValueForKey(key, value);
    setChart((prev) => {
      const next = { ...prev, [key]: nextValue } as RangeChartState;
      if (["boomLengthM", "boomAngleDeg", "jibLengthM", "jibAngleDeg"].includes(String(key))) return syncHookFromBoom(next);
      if (["radiusM", "tipHeightM"].includes(String(key))) return syncBoomFromHook(next);
      return next;
    });
  }

  function applySetup(setupKey: string) {
    const structuredKey = setupKey.startsWith("profile:") ? setupKey.slice("profile:".length) : setupKey;
    const profile = structuredProfileOptions.find((item) => item.key === structuredKey) ?? null;
    const setup = normalisedSetups.find((item) => item.key === setupKey) ?? null;
    setChart((prev) => {
      if (profile) {
        const next = {
          ...prev,
          selectedSetupKey: `profile:${profile.key}`,
          selectedSetupLabel: profile.label,
          craneSourceMode: "selected_crm_crane",
          externalSpecDocumentId: "",
          externalSpecDocumentTitle: "",
          chartCapacityKg: "",
          bearingLoadKg: "",
          // Selecting a profile sets the limit/chart family only. Do not force the actual boom length to the profile maximum,
          // otherwise small lifts jump to a huge radius/height and the sketch becomes unusable.
          boomLengthM: prev.boomLengthM,
          verificationNote:
            profile.source ||
            prev.verificationNote ||
            "Planning sketch only. Appointed person must verify the exact manufacturer/supplier chart before approval.",
        };
        return syncHookFromBoom(next);
      }
      if (!setup) {
        return { ...prev, selectedSetupKey: "", selectedSetupLabel: "" };
      }
      const inferredJibLength = inferPhysicalJibLength(setup);
      const setupLimits = [
        setup.maxRadiusM ? `max radius/outreach ${setup.maxRadiusM}m` : "",
        setup.maxTipHeightM ? `max tip height ${setup.maxTipHeightM}m` : "",
      ].filter(Boolean).join(", ");
      const next = {
        ...prev,
        selectedSetupKey: setup.key,
        selectedSetupLabel: setup.label,
        craneSourceMode: prev.craneSourceMode || "selected_crm_crane",
        boomLengthM: setup.boomLengthM ? String(setup.boomLengthM) : prev.boomLengthM,
        jibLengthM: inferredJibLength ? String(inferredJibLength) : prev.jibLengthM,
        verificationNote:
          setup.chartNote ||
          (setupLimits ? `Selected setup/profile limits: ${setupLimits}. Enter the actual planned radius and hook height for this lift, then verify against the manufacturer/supplier chart.` : "") ||
          prev.verificationNote ||
          "Planning sketch only. Appointed person must verify the exact manufacturer/supplier chart before approval.",
      };
      return syncHookFromBoom(next);
    });
  }

  function applyJibOption(jibKey: string) {
    const option = structuredJibOptions.find((item) => item.key === jibKey) ?? null;
    setChart((prev) => {
      if (!option) return { ...prev, selectedJibOptionKey: "", selectedJibOptionLabel: "" };
      const next = {
        ...prev,
        selectedJibOptionKey: option.key,
        selectedJibOptionLabel: option.label,
        jibLengthM: String(option.lengthM),
        verificationNote: option.source || prev.verificationNote,
      };
      return syncHookFromBoom(next);
    });
  }

  function applyExternalSpec(documentId: string) {
    const selected = externalSpecOptions?.find((item) => item.id === documentId) ?? null;
    setChart((prev) => ({
      ...prev,
      craneSourceMode: "external_spec_sheet",
      externalSpecDocumentId: selected?.id ?? "",
      externalSpecDocumentTitle: selected?.title ?? "",
    }));
  }

  function svgToMetres(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const viewWidth = 900;
    const viewHeight = 620;
    const left = 74;
    const right = 32;
    const top = 132;
    const bottom = 72;
    const plotW = viewWidth - left - right;
    const plotH = viewHeight - top - bottom;
    const xPx = ((event.clientX - rect.left) / rect.width) * viewWidth;
    const yPx = ((event.clientY - rect.top) / rect.height) * viewHeight;
    const xM = ((xPx - left) / plotW) * scale.maxX;
    const yM = ((viewHeight - bottom - yPx) / plotH) * scale.maxY;
    return { xM: Math.max(0, round(xM, 2)), yM: Math.max(0, round(yM, 2)) };
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!dragging) return;
    const point = svgToMetres(event);
    if (!point) return;
    event.preventDefault();
    if (dragging === "hook") {
      setChart((prev) => syncBoomFromHook({ ...prev, radiusM: String(point.xM), tipHeightM: String(point.yM) }));
    } else if (dragging === "boom") {
      setChart((prev) => {
        const pivotHeight = 1.1;
        const boomLength = Math.sqrt(Math.pow(point.xM, 2) + Math.pow(point.yM - pivotHeight, 2));
        const boomAngle = (Math.atan2(point.yM - pivotHeight, point.xM) * 180) / Math.PI;
        const limitedBoomLength = clampNumber(round(boomLength, 2), limits.maxBoomLengthM);
        return syncHookFromBoom({ ...prev, boomLengthM: String(limitedBoomLength), boomAngleDeg: String(round(boomAngle, 2)) });
      });
    } else {
      setChart((prev) => ({ ...prev, objectDistanceM: String(point.xM), objectHeightM: String(point.yM) }));
    }
  }

  function buildRangeChartPayload(includePackFlag: boolean) {
    const payload: Record<string, string> = {
      range_chart_client: chart.clientName,
      range_chart_crane_name: cleanCraneName,
      range_chart_notes: chart.notes,
      range_chart_crane_source_mode: chart.craneSourceMode,
      range_chart_external_spec_document_id: chart.externalSpecDocumentId,
      range_chart_external_spec_document_title: chart.externalSpecDocumentTitle,
      range_chart_selected_setup_key: chart.selectedSetupKey,
      range_chart_selected_setup_label: chart.selectedSetupLabel,
      range_chart_selected_jib_option_key: chart.selectedJibOptionKey,
      range_chart_selected_jib_option_label: chart.selectedJibOptionLabel,
      range_chart_boom_length_m: String(round(displayedBoomLength, 2)),
      range_chart_boom_angle_deg: String(round(displayedBoomAngle, 2)),
      range_chart_radius_m: chart.radiusM,
      range_chart_tip_height_m: chart.tipHeightM,
      range_chart_jib_length_m: String(round(numbers.jibLengthM, 2)),
      range_chart_jib_angle_deg: chart.jibAngleDeg,
      range_chart_object_distance_m: chart.objectDistanceM,
      range_chart_object_height_m: chart.objectHeightM,
      range_chart_object_width_m: chart.objectWidthM,
      range_chart_clearance_m: String(round(calc.clearance, 2)),
      range_chart_load_weight_kg: chart.loadWeightKg,
      range_chart_accessory_weight_kg: chart.accessoryWeightKg,
      range_chart_total_lifted_weight_kg: calc.totalLiftedWeight ? String(round(calc.totalLiftedWeight, 2)) : "",
      range_chart_chart_capacity_kg: effectiveChartCapacityKg ? String(round(effectiveChartCapacityKg, 2)) : "",
      range_chart_capacity_method: capacityResult.method,
      range_chart_capacity_source: capacityResult.source,
      range_chart_utilisation_percent: effectiveUtilisation ? String(round(effectiveUtilisation, 1)) : "",
      range_chart_mat_length_m: chart.matLengthM,
      range_chart_mat_width_m: chart.matWidthM,
      range_chart_mat_count: chart.matCount,
      range_chart_mats_under_loaded_outrigger: chart.matCount,
      range_chart_single_mat_area_m2: calc.singleMatArea ? String(round(calc.singleMatArea, 3)) : "",
      range_chart_mat_area_m2: calc.matArea ? String(round(calc.matArea, 3)) : "",
      range_chart_mat_total_area_m2: calc.matArea ? String(round(calc.matArea, 3)) : "",
      range_chart_bearing_load_kg: effectiveBearingLoadKg ? String(round(effectiveBearingLoadKg, 2)) : "",
      range_chart_bearing_method: bearingResult.method,
      range_chart_bearing_source: bearingResult.source,
      range_chart_bearing_pressure_kg_m2: effectivePressureKgM2 ? String(round(effectivePressureKgM2, 2)) : "",
      range_chart_bearing_pressure_t_m2: effectivePressureKgM2 ? String(round(effectivePressureKgM2 / 1000, 4)) : "",
      range_chart_bearing_pressure: matPressureText === "—" ? "" : matPressureText,
      range_chart_bearing_pressure_formula: effectivePressureKgM2
        ? `${matPressureFormulaText}. Reference only — estimated max outrigger load is calculated as (crane planning/gross weight + gross lifted load) × 0.75. Mat/spreader pressure is calculated only from the dimensions entered; no standard mats are assumed.`
        : "",
      range_chart_limit_warning: chartWarnings.join(" "),
      range_chart_verification_note: chart.verificationNote,
    };

    if (includePackFlag) payload.range_chart_saved_at = new Date().toISOString();

    // The include flag is deliberately saved only by the explicit chart save button.
    // All core lift-plan data above is auto-synced separately so the lift plan pack fields stay up to date
    // even when the sketch page itself is not included in the pack.
    if (includePackFlag) payload.range_chart_enabled = chart.enabled ? "true" : "false";

    return payload;
  }

  async function postRangeChartPayload(payload: Record<string, string>) {
    const res = await fetch(`/api/jobs/${jobId}/lift-plan/pack-selections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Could not save range chart data.");
    return data;
  }

  useEffect(() => {
    const payload = buildRangeChartPayload(false);
    const payloadKey = JSON.stringify(payload);

    if (!autoSyncStartedRef.current) {
      autoSyncStartedRef.current = true;
      lastAutoSyncPayloadRef.current = payloadKey;
      if (!initialRangeDataNeedsReset) return;
    }

    if (!initialRangeDataNeedsReset && lastAutoSyncPayloadRef.current === payloadKey) return;

    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    setAutoSyncMessage("Lift plan data syncing…");

    autoSyncTimerRef.current = setTimeout(() => {
      postRangeChartPayload(payload)
        .then(() => {
          lastAutoSyncPayloadRef.current = payloadKey;
          setAutoSyncMessage("Lift plan data auto-saved");
        })
        .catch((error: any) => {
          setAutoSyncMessage(error?.message || "Could not auto-save lift plan data");
        });
    }, 900);

    return () => {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    };
  }, [
    jobId,
    chart,
    cleanCraneName,
    displayedBoomLength,
    displayedBoomAngle,
    numbers.jibLengthM,
    calc.clearance,
    calc.totalLiftedWeight,
    calc.matArea,
    effectiveChartCapacityKg,
    capacityResult.method,
    capacityResult.source,
    effectiveUtilisation,
    effectiveBearingLoadKg,
    bearingResult.method,
    bearingResult.source,
    effectivePressureKgM2,
    matPressureText,
    matPressureFormulaText,
    chartWarnings,
    initialRangeDataNeedsReset,
  ]);

  async function saveRangeChart() {
    setSaving(true);
    setMessage("");
    try {
      await postRangeChartPayload(buildRangeChartPayload(true));
      lastAutoSyncPayloadRef.current = JSON.stringify(buildRangeChartPayload(false));
      setMessage(chart.enabled ? "Range chart saved and will appear as a page in the full lift plan pack." : "Range chart data saved. The sketch page will stay out of the pack until Include in pack is ticked and saved.");
    } catch (e: any) {
      setMessage(e?.message || "Could not save range chart.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={cardStyle} id="range-chart-builder">
      <div style={topRowStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24 }}>Range chart / lift sketch builder</h2>
          <div style={helperText}>
            Build an AnnS side-on planning sketch. Core lift details auto-save into the lift plan; use Include in pack + Save range chart only when you want the sketch page included in the pack.
          </div>
        </div>
        <div style={buttonRowStyle}>
          <label style={togglePillStyle}>
            <input type="checkbox" checked={chart.enabled} onChange={(event) => update("enabled", event.target.checked)} /> Include in pack
          </label>
          <button type="button" onClick={saveRangeChart} disabled={saving} style={primaryBtnStyle}>{saving ? "Saving…" : "Save range chart"}</button>
        </div>
      </div>

      {message ? <div style={messageBoxStyle}>{message}</div> : null}
      {autoSyncMessage ? <div style={autoSyncBoxStyle}>{autoSyncMessage}</div> : null}

      <div style={builderGridStyle}>
        <div style={controlsStyle}>
          <Section title="Job and crane source">
            <Field label="Client" value={chart.clientName} onChange={(value) => update("clientName", value)} />
            <Field label="Crane" value={chart.craneName} onChange={(value) => update("craneName", value)} />
            <TextArea label="Notes" value={chart.notes} onChange={(value) => update("notes", value)} rows={2} />
            <SelectField
              label="Crane/spec source"
              value={chart.craneSourceMode}
              onChange={(value) => update("craneSourceMode", value)}
              options={[
                { value: "selected_crm_crane", label: "Selected CRM crane spec sheets" },
                { value: "external_spec_sheet", label: "Another / external crane spec sheet" },
                { value: "manual", label: "Manual entry / not linked to spec" },
              ]}
            />
            {chart.craneSourceMode === "external_spec_sheet" ? (
              <SelectField
                label="External/job spec sheet"
                value={chart.externalSpecDocumentId}
                onChange={applyExternalSpec}
                options={[
                  { value: "", label: externalSpecOptions?.length ? "Select uploaded job spec sheet…" : "No job spec sheets uploaded yet" },
                  ...(externalSpecOptions ?? []).map((item) => ({ value: item.id, label: item.title })),
                ]}
              />
            ) : null}
            <SelectField
              label="Main boom / profile"
              value={chart.selectedSetupKey}
              onChange={applySetup}
              options={[
                { value: "", label: setupSelectOptions.length ? "Select main boom/profile…" : "No setup options found yet" },
                ...setupSelectOptions,
              ]}
            />
            {structuredJibOptions.length ? (
              <SelectField
                label="Fly jib / extension option"
                value={chart.selectedJibOptionKey}
                onChange={applyJibOption}
                options={[
                  { value: "", label: "Select fly jib/extension…" },
                  ...structuredJibOptions.map((option) => ({ value: option.key, label: option.label })),
                ]}
              />
            ) : null}
            <div style={miniHelpStyle}>Main boom/profile and fly jib/extension are selected separately. Drag the boom-head red dot to set boom length/angle, or drag the hook red dot to set the final hook/radius point.</div>
          </Section>

          <Section title="Chart dimensions">
            <div style={smallGridStyle}>
              <Field label="Radius (m)" type="number" value={chart.radiusM} max={limits.maxRadiusM ?? undefined} helper={limits.maxRadiusM ? `Max ${fmt(limits.maxRadiusM)}` : undefined} onChange={(value) => updateLimitedNumber("radiusM", value)} />
              <Field label="Tip / hook height (m)" type="number" value={chart.tipHeightM} max={limits.maxTipHeightM ?? undefined} helper={limits.maxTipHeightM ? `Max ${fmt(limits.maxTipHeightM)}` : undefined} onChange={(value) => updateLimitedNumber("tipHeightM", value)} />
              <Field label="Boom length (m)" type="number" value={chart.boomLengthM} max={limits.maxBoomLengthM ?? undefined} helper={limits.maxBoomLengthM ? `Max ${fmt(limits.maxBoomLengthM)}` : undefined} onChange={(value) => updateLimitedNumber("boomLengthM", value)} />
              <Field label="Boom angle (deg)" type="number" value={chart.boomAngleDeg} onChange={(value) => updateLimitedNumber("boomAngleDeg", value)} />
              <Field label="Physical jib length (m)" type="number" value={chart.jibLengthM} max={limits.maxPhysicalJibLengthM ?? undefined} helper={limits.maxPhysicalJibLengthM ? `Max ${fmt(limits.maxPhysicalJibLengthM)}` : undefined} onChange={(value) => updateLimitedNumber("jibLengthM", value)} />
              <Field label="Jib angle (deg)" type="number" value={chart.jibAngleDeg} onChange={(value) => updateLimitedNumber("jibAngleDeg", value)} />
              <Field label="Object distance (m)" type="number" value={chart.objectDistanceM} onChange={(value) => update("objectDistanceM", value)} />
              <Field label="Object height (m)" type="number" value={chart.objectHeightM} onChange={(value) => update("objectHeightM", value)} />
              <Field label="Object width (m)" type="number" value={chart.objectWidthM} onChange={(value) => update("objectWidthM", value)} />
            </div>
          </Section>

          <Section title="Load, chart and ground bearing">
            <div style={smallGridStyle}>
              <Field label="Load weight (kg)" type="number" value={chart.loadWeightKg} onChange={(value) => update("loadWeightKg", value)} />
              <Field label="Accessory weight (kg)" type="number" value={chart.accessoryWeightKg} onChange={(value) => update("accessoryWeightKg", value)} />
              <ReadOnlyInfo label="Chart capacity at radius" value={chartCapacityText} helper={formatComputedSource(capacityResult.method, capacityResult.source)} />
              <Field label="Mat/spreader length (m)" type="number" value={chart.matLengthM} onChange={(value) => update("matLengthM", value)} helper="Enter only when you want the CRM to calculate bearing pressure from a support area." />
              <Field label="Mat/spreader width (m)" type="number" value={chart.matWidthM} onChange={(value) => update("matWidthM", value)} helper="Any entered support size is used in the bearing pressure calculation." />
              <Field label="Mats/spreader pieces under worst-case loaded outrigger" type="number" value={chart.matCount} onChange={(value) => update("matCount", value)} helper="This is the number of support pieces under the one calculated worst-case outrigger, not the total pieces across the whole crane." />
              <ReadOnlyInfo label="Mat/spreader bearing area" value={matAreaText} helper="Blank means no support-area pressure calculation has been entered." />
              <ReadOnlyInfo label="Estimated max outrigger load" value={bearingLoadText} helper={formatComputedSource(bearingResult.method, bearingResult.source)} />
              <ReadOnlyInfo label="Mat/spreader pressure reference" value={matPressureText} helper={matPressureFormulaText} />
            </div>
            <TextArea label="Verification note" value={chart.verificationNote} onChange={(value) => update("verificationNote", value)} rows={3} />
          </Section>
        </div>

        <div style={previewWrapStyle}>
          <RangeChartSvg
            refEl={svgRef}
            chart={chart}
            numbers={numbers}
            calc={calc}
            displayedBoomLength={displayedBoomLength}
            displayedBoomAngle={displayedBoomAngle}
            scale={scale}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDragging(null)}
            onStartDrag={(mode) => setDragging(mode)}
          />
          {chartDangerWarnings.length ? (
            <div style={dangerBoxStyle}>
              <strong>Chart warning:</strong> {chartDangerWarnings.join(" ")}
            </div>
          ) : null}
          {chartAdvisories.length ? (
            <div style={adviceBoxStyle}>
              <strong>Setup / chart advice:</strong> {chartAdvisories.join(" ")}
            </div>
          ) : null}
          <div style={metricGridStyle}>
            <Metric label="Boom length" value={fmt(displayedBoomLength)} />
            <Metric label="Boom angle" value={fmt(displayedBoomAngle, "°")} />
            <Metric label="Radius" value={fmt(numbers.radiusM)} />
            <Metric label="Tip height" value={fmt(numbers.tipHeightM)} />
            <Metric label="Physical jib length" value={fmt(numbers.jibLengthM)} />
            <Metric label="Jib angle" value={fmt(numbers.jibAngleDeg, "°")} />
            <Metric label="Object distance" value={fmt(numbers.objectDistanceM)} />
            <Metric label="Object height" value={fmt(numbers.objectHeightM)} />
            <Metric label="Clearance" value={fmt(calc.clearance)} tone={calc.clearance < 0 ? "danger" : "normal"} />
            <Metric label="Total lifted weight" value={totalWeightText} />
            <Metric label="Chart capacity" value={chartCapacityText} tone={effectiveChartCapacityKg && calc.totalLiftedWeight && calc.totalLiftedWeight > effectiveChartCapacityKg ? "danger" : "normal"} />
            <Metric label="Estimated max outrigger load" value={bearingLoadText} />
            {calc.matArea ? <Metric label="Mat/spreader bearing area" value={matAreaText} /> : null}
            <Metric label="Chart utilisation" value={effectiveUtilisation ? `${round(effectiveUtilisation, 1)}%` : "Manual check"} tone={effectiveUtilisation && effectiveUtilisation > 100 ? "danger" : "normal"} />
            {effectivePressureKgM2 ? <Metric label="Mat/spreader pressure" value={matPressureText} /> : null}
          </div>
          <div style={warningBoxStyle}>
            Planning sketch only. Estimated max outrigger load uses the appointed-person planning formula: (crane planning/gross weight + gross lifted load) × 0.75. Mat/spreader bearing pressure is only calculated where mat/spreader dimensions are entered: {matPressureFormulaText}. Final ground suitability, support area and outrigger reactions must be verified before lifting.
          </div>
        </div>
      </div>
    </div>
  );
}

function RangeChartSvg({
  refEl,
  chart,
  numbers,
  calc,
  displayedBoomLength,
  displayedBoomAngle,
  scale,
  onPointerMove,
  onPointerUp,
  onStartDrag,
}: {
  refEl: MutableRefObject<SVGSVGElement | null>;
  chart: RangeChartState;
  numbers: ChartNumbers;
  calc: ReturnType<typeof calculatedFrom>;
  displayedBoomLength: number;
  displayedBoomAngle: number;
  scale: { maxX: number; maxY: number };
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp: () => void;
  onStartDrag: (mode: "hook" | "boom" | "object") => void;
}) {
  const viewWidth = 900;
  const viewHeight = 620;
  const left = 74;
  const right = 32;
  const top = 132;
  const bottom = 72;
  const plotW = viewWidth - left - right;
  const plotH = viewHeight - top - bottom;
  const x = (metres: number) => left + (metres / scale.maxX) * plotW;
  const y = (metres: number) => viewHeight - bottom - (metres / scale.maxY) * plotH;
  const pivotX = x(0);
  const pivotY = y(calc.pivotHeight);
  const hookX = x(calc.hookX);
  const hookY = y(calc.hookY);
  const boomEndX = x(calc.boomEndX);
  const boomEndY = y(calc.boomEndY);
  const objectX = x(numbers.objectDistanceM);
  const objectY = y(numbers.objectHeightM);
  const objectW = Math.max(12, x(numbers.objectDistanceM + numbers.objectWidthM) - objectX);
  const objectH = y(0) - objectY;
  const groundY = y(0);
  const majorStep = scale.maxX > 60 ? 10 : scale.maxX > 30 ? 5 : 1;
  const minorStep = majorStep === 1 ? 0.5 : majorStep / 5;
  const verticalLines: number[] = [];
  const horizontalLines: number[] = [];
  const horizontalGapM = numbers.radiusM - numbers.objectDistanceM;
  const clearanceM = calc.clearance;
  for (let value = 0; value <= scale.maxX + 0.001; value += minorStep) verticalLines.push(round(value, 2));
  for (let value = 0; value <= scale.maxY + 0.001; value += minorStep) horizontalLines.push(round(value, 2));

  const clientLines = splitSvgText(chart.clientName || "—", 42, 1);
  const svgCraneName = tidyDisplayLabel(chart.craneName);
  const craneLines = splitSvgText(svgCraneName || "—", 42, 2);
  const noteLines = splitSvgText(chart.notes || chart.selectedSetupLabel || "Lift sketch", 58, 1);
  const setupLines = splitSvgText(chart.selectedSetupLabel || "Manual check", 34, 2);
  const gapLabel = horizontalGapM >= 0 ? fmt(horizontalGapM) : `${fmt(Math.abs(horizontalGapM))} short`;
  const clearanceLabel = clearanceM >= 0 ? fmt(clearanceM) : `${fmt(Math.abs(clearanceM))} low`;
  const dangerStroke = clearanceM < 0 || horizontalGapM < 0 ? "#d12c2c" : "#ea5151";

  return (
    <div style={svgFrameStyle}>
      <svg
        ref={refEl}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        width="100%"
        role="img"
        aria-label="Range chart lift sketch"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ touchAction: "none", display: "block" }}
      >
        <rect x="0" y="0" width={viewWidth} height={viewHeight} fill="#ffffff" />
        <rect x="16" y="16" width={viewWidth - 32} height={viewHeight - 32} fill="#f6fbff" stroke="#3aa6c8" strokeWidth="2" />

        <text x="34" y="44" fontSize="18" fontWeight="800" fill="#3aa6c8">Client:</text>
        {clientLines.map((line, index) => <text key={`client-${index}`} x="116" y={44 + index * 18} fontSize="18" fontWeight="800" fill="#237fa0">{line}</text>)}
        <text x="34" y="70" fontSize="18" fontWeight="800" fill="#3aa6c8">Crane:</text>
        {craneLines.map((line, index) => <text key={`crane-${index}`} x="116" y={70 + index * 18} fontSize="17" fontWeight="800" fill="#237fa0">{line}</text>)}
        <text x="34" y="106" fontSize="18" fontWeight="800" fill="#3aa6c8">Notes:</text>
        {noteLines.map((line, index) => <text key={`notes-${index}`} x="116" y={106 + index * 18} fontSize="17" fontWeight="800" fill="#237fa0">{line}</text>)}
        <text x={viewWidth - 34} y="44" fontSize="14" fontWeight="800" fill="#3aa6c8" textAnchor="end">Setup / profile</text>
        {setupLines.map((line, index) => <text key={`setup-${index}`} x={viewWidth - 34} y={66 + index * 17} fontSize="15" fontWeight="800" fill="#237fa0" textAnchor="end">{line}</text>)}
        <line x1="16" y1="120" x2={viewWidth - 16} y2="120" stroke="#3aa6c8" strokeWidth="2" />

        <rect x={left} y={top} width={plotW} height={plotH} fill="#eef7fb" stroke="#d7e7ee" />
        {verticalLines.map((value) => {
          const isMajor = Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001;
          return <line key={`x-${value}`} x1={x(value)} y1={top} x2={x(value)} y2={viewHeight - bottom} stroke={isMajor ? "#c3d3db" : "#e1edf2"} strokeWidth={isMajor ? 1.4 : 0.7} />;
        })}
        {horizontalLines.map((value) => {
          const isMajor = Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001;
          return <line key={`y-${value}`} x1={left} y1={y(value)} x2={viewWidth - right} y2={y(value)} stroke={isMajor ? "#c3d3db" : "#e1edf2"} strokeWidth={isMajor ? 1.4 : 0.7} />;
        })}
        {verticalLines.filter((value) => Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001).map((value) => (
          <text key={`xl-${value}`} x={x(value)} y={viewHeight - bottom + 20} fontSize="12" fill="#4f5d64" textAnchor="middle">{value}</text>
        ))}
        {horizontalLines.filter((value) => Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001).map((value) => (
          <text key={`yl-${value}`} x={left - 10} y={y(value) + 4} fontSize="12" fill="#4f5d64" textAnchor="end">{value}</text>
        ))}

        <rect
          x={objectX}
          y={objectY}
          width={objectW}
          height={objectH}
          fill="#36a6c9"
          opacity="0.95"
          onPointerDown={(event) => { event.preventDefault(); onStartDrag("object"); }}
          style={{ cursor: "grab" }}
        />
        <line x1={Math.min(objectX, hookX)} y1={objectY} x2={Math.max(objectX, hookX)} y2={objectY} stroke={dangerStroke} strokeWidth="2" />
        <line x1={hookX} y1={Math.min(objectY, hookY)} x2={hookX} y2={Math.max(objectY, hookY)} stroke={dangerStroke} strokeWidth="2" />
        <line x1={pivotX} y1={groundY} x2={hookX} y2={groundY} stroke="#ea5151" strokeWidth="2" />
        <text x={(objectX + hookX) / 2} y={Math.min(objectY, hookY) - 8} fontSize="12" fontWeight="800" fill={dangerStroke} textAnchor="middle">{gapLabel}</text>
        <text x={hookX + 10} y={(objectY + hookY) / 2} fontSize="12" fontWeight="800" fill={dangerStroke}>{clearanceLabel}</text>
        <text x={(pivotX + hookX) / 2} y={groundY - 8} fontSize="12" fontWeight="800" fill="#ea5151" textAnchor="middle">{fmt(numbers.radiusM)}</text>

        <g transform={`translate(${pivotX - 60} ${groundY - 28})`}>
          <rect x="0" y="16" width="88" height="20" rx="4" fill="#f6a31a" stroke="#8d6500" strokeWidth="1.5" />
          <rect x="20" y="0" width="30" height="19" rx="3" fill="#f6a31a" stroke="#8d6500" strokeWidth="1.5" />
          <rect x="51" y="12" width="36" height="10" rx="2" fill="#f6a31a" stroke="#8d6500" strokeWidth="1.5" />
          <line x1="-10" y1="38" x2="102" y2="38" stroke="#6f6f6f" strokeWidth="7" strokeLinecap="round" />
          <circle cx="18" cy="42" r="9" fill="#858585" stroke="#4f4f4f" />
          <circle cx="56" cy="42" r="9" fill="#858585" stroke="#4f4f4f" />
          <circle cx="84" cy="42" r="9" fill="#858585" stroke="#4f4f4f" />
          <line x1="58" y1="15" x2="72" y2="-10" stroke="#f6a31a" strokeWidth="8" strokeLinecap="round" />
          <line x1="58" y1="15" x2="72" y2="-10" stroke="#8d6500" strokeWidth="2" strokeLinecap="round" />
        </g>

        <line x1={pivotX} y1={pivotY} x2={boomEndX} y2={boomEndY} stroke="#777" strokeWidth="9" strokeLinecap="round" />
        <line x1={pivotX} y1={pivotY} x2={boomEndX} y2={boomEndY} stroke="#4a4a4a" strokeWidth="2" strokeLinecap="round" />
        {numbers.jibLengthM > 0 ? (
          <>
            <line x1={boomEndX} y1={boomEndY} x2={hookX} y2={hookY} stroke="#777" strokeWidth="5" strokeLinecap="round" />
            <circle cx={boomEndX} cy={boomEndY} r="7" fill="#e11d1d" stroke="#940c0c" strokeWidth="2" onPointerDown={(event) => { event.preventDefault(); onStartDrag("boom"); }} style={{ cursor: "grab" }} />
          </>
        ) : null}
        <circle cx={hookX} cy={hookY} r="9" fill="#e11d1d" stroke="#940c0c" strokeWidth="2" onPointerDown={(event) => { event.preventDefault(); onStartDrag("hook"); }} style={{ cursor: "grab" }} />
        <line x1={hookX} y1={hookY} x2={hookX} y2={hookY + 26} stroke="#333" strokeWidth="2" />
        <path d={`M ${hookX - 7} ${hookY + 26} Q ${hookX} ${hookY + 38} ${hookX + 7} ${hookY + 26}`} stroke="#333" strokeWidth="2" fill="none" />

        <rect x={left} y={viewHeight - bottom} width={plotW} height="2" fill="#4f5d64" />
        <rect x={left} y={top} width="2" height={plotH} fill="#4f5d64" />
        <text x={viewWidth - 36} y={viewHeight - 20} fontSize="11" fill="#888" textAnchor="end">AnnS CRM range chart • planning aid only</text>
      </svg>
    </div>
  );
}

function splitSvgText(value: string, maxChars: number, maxLines: number) {
  const text = clean(value) || "—";
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  const originalLineCount = words.join(" ").length;
  const joined = lines.join(" ");
  if (joined.length < originalLineCount && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(0, maxChars - 1)).trim()}…`;
  }
  return lines.length ? lines : ["—"];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div style={sectionStyle}><div style={sectionTitleStyle}>{title}</div><div style={{ display: "grid", gap: 10 }}>{children}</div></div>;
}

function Field({ label, value, onChange, type = "text", max, helper }: { label: string; value: string; onChange: (value: string) => void; type?: string; max?: number; helper?: string }) {
  return (
    <label style={fieldWrapStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <input type={type} step="0.01" max={max} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
      {helper ? <span style={fieldHelperStyle}>{helper}</span> : null}
    </label>
  );
}

function ReadOnlyInfo({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div style={fieldWrapStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <div style={readOnlyInfoStyle}>{value}</div>
      {helper ? <span style={fieldHelperStyle}>{helper}</span> : null}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label style={fieldWrapStyle}><span style={fieldLabelStyle}>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function TextArea({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return <label style={fieldWrapStyle}><span style={fieldLabelStyle}>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} style={textAreaStyle} /></label>;
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "danger" }) {
  const style = tone === "danger" ? dangerMetricStyle : metricStyle;
  return <div style={style}><div style={metricLabelStyle}>{label}</div><div style={metricValueStyle}>{value}</div></div>;
}

const cardStyle: CSSProperties = { background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16, display: "grid", gap: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.08)" };
const topRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" };
const buttonRowStyle: CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
const helperText: CSSProperties = { marginTop: 6, opacity: 0.74, fontSize: 13, lineHeight: 1.4 };
const miniHelpStyle: CSSProperties = { fontSize: 12, lineHeight: 1.35, opacity: 0.72, background: "rgba(58,166,200,0.08)", border: "1px solid rgba(58,166,200,0.16)", borderRadius: 8, padding: "8px 9px" };
const builderGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)", gap: 16, alignItems: "start" };
const controlsStyle: CSSProperties = { display: "grid", gap: 12, maxHeight: "calc(100vh - 190px)", overflowY: "auto", paddingRight: 4 };
const sectionStyle: CSSProperties = { border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.75)" };
const sectionTitleStyle: CSSProperties = { fontWeight: 900, marginBottom: 10 };
const smallGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };
const previewWrapStyle: CSSProperties = { display: "grid", gap: 12, minWidth: 0 };
const svgFrameStyle: CSSProperties = { border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, overflow: "hidden", background: "#fff" };
const metricGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 };
const metricStyle: CSSProperties = { border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.8)" };
const dangerMetricStyle: CSSProperties = { border: "1px solid rgba(209,44,44,0.28)", borderRadius: 10, padding: 10, background: "rgba(209,44,44,0.08)" };
const metricLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 800, opacity: 0.72 };
const metricValueStyle: CSSProperties = { marginTop: 4, fontWeight: 900 };
const fieldWrapStyle: CSSProperties = { display: "grid", gap: 5 };
const fieldLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 900, opacity: 0.78 };
const fieldHelperStyle: CSSProperties = { fontSize: 11, lineHeight: 1.25, opacity: 0.68 };
const readOnlyInfoStyle: CSSProperties = { minHeight: 38, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 9, padding: "9px 10px", fontSize: 14, boxSizing: "border-box", background: "rgba(0,0,0,0.035)", fontWeight: 900 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 38, border: "1px solid rgba(0,0,0,0.14)", borderRadius: 9, padding: "0 10px", fontSize: 14, boxSizing: "border-box", background: "#fff" };
const textAreaStyle: CSSProperties = { width: "100%", border: "1px solid rgba(0,0,0,0.14)", borderRadius: 9, padding: 10, fontSize: 14, boxSizing: "border-box", background: "#fff", resize: "vertical" };
const primaryBtnStyle: CSSProperties = { padding: "10px 14px", borderRadius: 10, border: 0, background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer" };
const togglePillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 999, padding: "8px 12px", background: "#fff", fontWeight: 900 };
const messageBoxStyle: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(0,120,255,0.08)", border: "1px solid rgba(0,120,255,0.18)", fontWeight: 700 };
const autoSyncBoxStyle: CSSProperties = { padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.62)", border: "1px solid rgba(0,0,0,0.08)", fontSize: 12, fontWeight: 800, color: "#24536a" };
const warningBoxStyle: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(255,168,0,0.14)", border: "1px solid rgba(255,168,0,0.22)", fontSize: 13, lineHeight: 1.45, fontWeight: 700 };
const adviceBoxStyle: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(58,166,200,0.10)", border: "1px solid rgba(58,166,200,0.24)", color: "#14536b", fontSize: 13, lineHeight: 1.45, fontWeight: 800 };
const dangerBoxStyle: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(209,44,44,0.09)", border: "1px solid rgba(209,44,44,0.24)", color: "#7a1515", fontSize: 13, lineHeight: 1.45, fontWeight: 800 };
