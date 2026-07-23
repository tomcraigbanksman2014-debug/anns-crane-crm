"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import type {
  CraneSetupOption,
  EquipmentProfile,
} from "../../lib/ai/equipmentProfiles";
import type { RangeChartProfileOption } from "../../lib/rangeChartSpecs";
import {
  calculateRangeChartBearingLoad,
  calculateRangeChartCapacity,
  getRangeChartLimits,
  getRangeChartSpecOptions,
} from "../../lib/rangeChartSpecs";
import LiftArrangementEditor from "../../components/lift-drawing/LiftArrangementEditor";
import type { LiftMachineType, LiftTechnicalSchedule } from "../../components/lift-drawing/types";
import {
  parseLiftDrawingModel,
  serialiseLiftDrawingModel,
} from "../../lib/liftDrawingPersistence";
import { liftDrawingApprovalErrors } from "../../lib/liftDrawingValidation";

type CraneOption = {
  value: string;
  craneId: string;
  label: string;
};

type PersonOption = {
  value: string;
  label: string;
};

type LiftPlanData = {
  selected_job_equipment_id?: string | null;
  selected_crane_id?: string | null;
  load_description?: string | null;
  load_weight?: number | null;
  lift_radius?: number | null;
  lift_height?: number | null;
  crane_configuration?: string | null;
  outrigger_setup?: string | null;
  ground_conditions?: string | null;
  sling_type?: string | null;
  lifting_accessories?: string | null;
  method_statement?: string | null;
  risk_assessment?: string | null;
  site_hazards?: string | null;
  control_measures?: string | null;
  ppe_required?: string | null;
  exclusion_zone_details?: string | null;
  weather_limitations?: string | null;
  emergency_procedures?: string | null;
  lift_supervisor?: string | null;
  appointed_person?: string | null;
  crane_operator?: string | null;
  rams_complete?: boolean;
  lift_plan_complete?: boolean;
  approved_by?: string | null;
  approved_at?: string | null;
  approval_notes?: string | null;
  customer_signed_by?: string | null;
  operator_signed_by?: string | null;
  office_signed_by?: string | null;
  finalised_at?: string | null;
  paperwork_locked?: boolean;
  pack_sections?: Record<string, string | null> | null;
  selected_crane_setup_key?: string | null;
  selected_crane_setup_label?: string | null;
  boom_configuration?: string | null;
  boom_length?: string | null;
  crane_outreach_reference?: string | null;
  crane_jib_reference?: string | null;
  crane_details?: string | null;
  configuration_outrigger_note?: string | null;
  load_chart_note?: string | null;
  ground_bearing_mat_preset?: string | null;
  ground_bearing_mat_length_m?: string | null;
  ground_bearing_mat_width_m?: string | null;
  ground_bearing_mat_area_m2?: string | null;
  ground_bearing_bearing_load?: string | null;
  ground_bearing_pressure?: string | null;
  ground_bearing_notes?: string | null;
  custom_crane_boom_length_m?: string | null;
  custom_crane_hydraulic_outreach_m?: string | null;
  custom_crane_jib_outreach_m?: string | null;
  custom_crane_max_radius_m?: string | null;
  multi_crane_enabled?: boolean;
  multi_crane_lift_type?: string | null;
  multi_crane_notes?: string | null;
  additional_cranes_json?: string | null;
  range_chart_radius_m?: string | null;
  range_chart_tip_height_m?: string | null;
  range_chart_load_weight_kg?: string | null;
  range_chart_accessory_weight_kg?: string | null;
  range_chart_total_lifted_weight_kg?: string | null;
  range_chart_boom_length_m?: string | null;
  range_chart_boom_angle_deg?: string | null;
  range_chart_chart_capacity_kg?: string | null;
  range_chart_capacity_source?: string | null;
  range_chart_capacity_page?: string | null;
  range_chart_utilisation_percent?: string | null;
  range_chart_bearing_load_kg?: string | null;
  range_chart_bearing_pressure_kg_m2?: string | null;
  range_chart_mat_length_m?: string | null;
  range_chart_mat_width_m?: string | null;
  range_chart_mats_under_loaded_outrigger?: string | null;
  range_chart_verification_note?: string | null;
  lift_drawing_model_json?: string | null;
};

type LiftPlanVersionSummary = {
  id: string;
  created_at: string | null;
  created_by_email?: string | null;
  reason?: string | null;
};

type AdditionalCraneEntry = {
  id: string;
  selected_crane_option_value: string;
  selected_profile_key: string;
  selected_jib_key: string;
  crane_name: string;
  crane_role: string;
  planned_use: string;
  setup_profile: string;
  boom_length_m: string;
  boom_length_m_manual: boolean;
  radius_m: string;
  hook_height_m: string;
  crane_gross_weight_kg: string;
  load_share_kg: string;
  accessory_weight_kg: string;
  chart_capacity_kg: string;
  mat_length_m: string;
  mat_width_m: string;
  spec_sheet_reference: string;
  verification_notes: string;
};

function hasDraftValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  return true;
}

function mergeGeneratedDraft<T extends Record<string, any>>(
  prev: T,
  draft: Partial<T> | null | undefined,
  preserveKeys: string[],
) {
  const next: Record<string, any> = { ...prev };
  const preserve = new Set(preserveKeys);

  for (const [key, value] of Object.entries(draft ?? {})) {
    if (preserve.has(key) && hasDraftValue(prev[key])) {
      continue;
    }
    if (hasDraftValue(value)) {
      next[key] = value;
    }
  }

  return next as T;
}

const MACHINE_NARRATIVE_KEYS: Array<keyof LiftPlanData> = [
  "crane_configuration",
  "outrigger_setup",
  "ground_conditions",
  "method_statement",
  "risk_assessment",
  "site_hazards",
  "control_measures",
  "ppe_required",
  "exclusion_zone_details",
  "weather_limitations",
  "emergency_procedures",
  "crane_operator",
];

function clearMachineNarrativeFields<T extends Record<string, any>>(prev: T) {
  const next: Record<string, any> = { ...prev };
  for (const key of MACHINE_NARRATIVE_KEYS) {
    next[key] = "";
  }
  return next as T;
}

function normaliseCraneTextForCompare(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/böcker/g, "bocker")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:crane|mobile|spider|truck|mounted|gt|cdh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textMentionsDifferentKnownCrane(
  value: unknown,
  currentCraneName: unknown,
) {
  const text = normaliseCraneTextForCompare(value);
  const current = normaliseCraneTextForCompare(currentCraneName);
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
      .filter((item) =>
        item.aliases.some((alias) =>
          current.includes(alias.replace(/\s+/g, " ")),
        ),
      )
      .map((item) => item.key),
  );
  if (!currentKeys.size) return false;

  return known.some((item) => {
    if (currentKeys.has(item.key)) return false;
    return item.aliases.some((alias) =>
      text.includes(alias.replace(/\s+/g, " ")),
    );
  });
}

function sanitiseInitialLiftPlanForCurrentCrane<T extends LiftPlanData>(
  draft: T,
  currentCraneName: unknown,
): T {
  const machineText = [
    draft.crane_configuration,
    draft.outrigger_setup,
    draft.method_statement,
    draft.risk_assessment,
    draft.exclusion_zone_details,
    draft.weather_limitations,
    draft.emergency_procedures,
    draft.selected_crane_setup_key,
    draft.selected_crane_setup_label,
    draft.boom_configuration,
    draft.crane_details,
    draft.configuration_outrigger_note,
    draft.load_chart_note,
  ]
    .filter(Boolean)
    .join("\n");

  if (!textMentionsDifferentKnownCrane(machineText, currentCraneName))
    return draft;

  const next: Record<string, any> = clearMachineNarrativeFields(
    draft as Record<string, any>,
  );
  const currentCrane =
    String(currentCraneName ?? "").trim() || "selected crane";
  next.selected_crane_setup_key = "";
  next.selected_crane_setup_label = "";
  next.boom_configuration = "";
  next.boom_length = "";
  next.crane_outreach_reference = "";
  next.crane_jib_reference = "";
  next.crane_details = "";
  next.configuration_outrigger_note = "";
  next.load_chart_note = "";
  next.custom_crane_boom_length_m = "";
  next.custom_crane_hydraulic_outreach_m = "";
  next.custom_crane_jib_outreach_m = "";
  next.custom_crane_max_radius_m = "";
  next.crane_configuration = `${currentCrane} configuration, boom length, counterweight / ballast, radius and duties must be checked against the uploaded specification / load chart for the actual lift.`;
  next.outrigger_setup =
    "Outrigger, support and mat arrangement must be checked against the uploaded specification / load chart and the actual ground conditions before lifting.";
  next.exclusion_zone_details = `Barrier off the lifting area, slewing area and landing zone for ${currentCrane}. Only authorised personnel are permitted inside the exclusion zone while the crane is being set up, the load is suspended or the lift is being completed.`;
  next.emergency_procedures = `Stop work immediately if unsafe conditions develop, an equipment fault occurs or the load cannot be controlled. Make ${currentCrane} and the load safe where possible, isolate the area, alert site management and emergency services if required, and follow site-specific emergency procedures for injury, instability, contact with services or crane failure.`;
  return next as T;
}

const TIDY_LONG_TEXT_KEYS: Array<keyof LiftPlanData> = [
  "crane_configuration",
  "outrigger_setup",
  "ground_conditions",
  "method_statement",
  "risk_assessment",
  "site_hazards",
  "control_measures",
  "ppe_required",
  "exclusion_zone_details",
  "weather_limitations",
  "emergency_procedures",
  "approval_notes",
  "configuration_outrigger_note",
  "load_chart_note",
  "ground_bearing_notes",
];

function normaliseDuplicateKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9.%/()'" -]/g, "")
    .trim();
}

function tidyRepeatedTextBlock(value: unknown) {
  const text = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) return "";

  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
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

function tidyLiftPlanTextFields<T extends Record<string, any>>(payload: T) {
  const next: Record<string, any> = { ...payload };
  for (const key of TIDY_LONG_TEXT_KEYS) {
    if (key in next) next[key] = tidyRepeatedTextBlock(next[key]);
  }
  return next as T;
}

function toInputDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function safeJsonParseArray(value: unknown): AdditionalCraneEntry[] {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => normaliseAdditionalCrane(item, index))
      .filter(Boolean) as AdditionalCraneEntry[];
  } catch {
    return [];
  }
}

function newAdditionalCraneEntry(): AdditionalCraneEntry {
  const id = `crane-${Date.now()}-${Math.round(Math.random() * 100000)}`;
  return {
    id,
    selected_crane_option_value: "",
    selected_profile_key: "",
    selected_jib_key: "",
    crane_name: "",
    crane_role: "Alternative crane for same work",
    planned_use: "",
    setup_profile: "",
    boom_length_m: "",
    boom_length_m_manual: false,
    radius_m: "",
    hook_height_m: "",
    crane_gross_weight_kg: "",
    load_share_kg: "",
    accessory_weight_kg: "",
    chart_capacity_kg: "",
    mat_length_m: "",
    mat_width_m: "",
    spec_sheet_reference: "",
    verification_notes: "",
  };
}

function normaliseAdditionalCrane(item: any, index = 0): AdditionalCraneEntry {
  const fallback = newAdditionalCraneEntry();
  return {
    ...fallback,
    id: String(item?.id || `crane-${index + 1}`),
    selected_crane_option_value: String(
      item?.selected_crane_option_value ?? item?.selectedCraneOptionValue ?? "",
    ),
    selected_profile_key: String(
      item?.selected_profile_key ?? item?.selectedProfileKey ?? "",
    ),
    selected_jib_key: String(
      item?.selected_jib_key ?? item?.selectedJibKey ?? "",
    ),
    crane_name: String(item?.crane_name ?? item?.craneName ?? ""),
    crane_role: String(
      item?.crane_role ?? item?.craneRole ?? "Alternative crane for same work",
    ),
    planned_use: String(item?.planned_use ?? item?.plannedUse ?? ""),
    setup_profile: String(item?.setup_profile ?? item?.setupProfile ?? ""),
    boom_length_m: String(item?.boom_length_m ?? item?.boomLengthM ?? ""),
    boom_length_m_manual:
      item?.boom_length_m_manual === true ||
      item?.boomLengthMManual === true ||
      item?.boom_length_m_manual === "true" ||
      item?.boomLengthMManual === "true",
    radius_m: String(item?.radius_m ?? item?.radiusM ?? ""),
    hook_height_m: String(item?.hook_height_m ?? item?.hookHeightM ?? ""),
    crane_gross_weight_kg: String(
      item?.crane_gross_weight_kg ?? item?.craneGrossWeightKg ?? "",
    ),
    load_share_kg: String(item?.load_share_kg ?? item?.loadShareKg ?? ""),
    accessory_weight_kg: String(
      item?.accessory_weight_kg ?? item?.accessoryWeightKg ?? "",
    ),
    chart_capacity_kg: String(
      item?.chart_capacity_kg ?? item?.chartCapacityKg ?? "",
    ),
    mat_length_m: String(item?.mat_length_m ?? item?.matLengthM ?? ""),
    mat_width_m: String(item?.mat_width_m ?? item?.matWidthM ?? ""),
    spec_sheet_reference: String(
      item?.spec_sheet_reference ?? item?.specSheetReference ?? "",
    ),
    verification_notes: String(
      item?.verification_notes ?? item?.verificationNotes ?? "",
    ),
  };
}

function stringifyAdditionalCranes(cranes: AdditionalCraneEntry[]) {
  return JSON.stringify(
    cranes.map((item, index) => normaliseAdditionalCrane(item, index)),
  );
}

function additionalCraneTotals(crane: AdditionalCraneEntry) {
  const grossKg = numberOrNull(crane.crane_gross_weight_kg);
  const loadKg = numberOrNull(crane.load_share_kg) ?? 0;
  const accessoryKg = numberOrNull(crane.accessory_weight_kg) ?? 0;
  const totalLiftedKg = loadKg + accessoryKg;
  const chartCapacityKg = numberOrNull(crane.chart_capacity_kg);
  const matLengthM = numberOrNull(crane.mat_length_m);
  const matWidthM = numberOrNull(crane.mat_width_m);
  const matAreaM2 = matLengthM && matWidthM ? matLengthM * matWidthM : null;
  const bearingLoadKg = grossKg ? (grossKg + totalLiftedKg) * 0.75 : null;
  const bearingPressureKgM2 =
    bearingLoadKg && matAreaM2 ? bearingLoadKg / matAreaM2 : null;
  const utilisationPercent =
    chartCapacityKg && totalLiftedKg > 0
      ? (totalLiftedKg / chartCapacityKg) * 100
      : null;
  return {
    grossKg,
    loadKg,
    accessoryKg,
    totalLiftedKg,
    chartCapacityKg,
    matAreaM2,
    bearingLoadKg,
    bearingPressureKgM2,
    utilisationPercent,
  };
}

function formatAutoKgInput(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "";
  return String(Math.round(value));
}

function formatAutoMInput(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "";
  return String(Number(value.toFixed(2)));
}

function buildAdditionalCraneSetupLabel(
  profileLabel: string,
  jibLabel: string,
) {
  return [profileLabel, jibLabel && !/^no jib/i.test(jibLabel) ? jibLabel : ""]
    .filter(Boolean)
    .join(" / ");
}

function profileBoomLengthValue(
  option: RangeChartProfileOption | null | undefined,
) {
  const n = option?.defaultBoomLengthM ?? option?.maxBoomLengthM ?? null;
  return n !== null && n !== undefined && Number.isFinite(n) ? Number(n) : null;
}

function profilesHaveDistinctBoomLengths(options: RangeChartProfileOption[]) {
  const values = options
    .map((option) => profileBoomLengthValue(option))
    .filter((value): value is number => value !== null)
    .map((value) => Number(value.toFixed(2)));
  return new Set(values).size > 1;
}

function findBestProfileForBoomLength(
  options: RangeChartProfileOption[],
  boomLengthM: number | null | undefined,
) {
  if (
    !boomLengthM ||
    !Number.isFinite(boomLengthM) ||
    !profilesHaveDistinctBoomLengths(options)
  ) {
    return null;
  }

  const exactMatches = options
    .map((option) => {
      const profileBoomM = profileBoomLengthValue(option);
      if (!profileBoomM) return null;
      const absoluteDiff = Math.abs(profileBoomM - boomLengthM);
      // Only switch the selected spec/profile automatically when the typed boom length
      // is genuinely close to a manufacturer chart column. Do not silently jump to a
      // longer boom chart because that can keep showing a crane as over-capacity even
      // when the AP meant a shorter telescopic setup.
      if (absoluteDiff > 0.75) return null;
      return { option, score: absoluteDiff };
    })
    .filter(Boolean) as Array<{
    option: RangeChartProfileOption;
    score: number;
  }>;

  return exactMatches.sort((a, b) => a.score - b.score)[0]?.option ?? null;
}

function profileHasExactBoomLength(
  option: RangeChartProfileOption | null | undefined,
  boomLengthM: number | null | undefined,
) {
  const profileBoomM = profileBoomLengthValue(option);
  return Boolean(
    profileBoomM !== null &&
    boomLengthM !== null &&
    boomLengthM !== undefined &&
    Number.isFinite(boomLengthM) &&
    Math.abs(profileBoomM - Number(boomLengthM)) <= 0.75,
  );
}

function structuredProfileOptionsContainBoomLength(
  options: RangeChartProfileOption[],
  boomLengthM: number | null | undefined,
) {
  return options.some((option) =>
    profileHasExactBoomLength(option, boomLengthM),
  );
}

function formatKg(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kg`;
}

function formatTonnes(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "—";
  return `${(value / 1000).toLocaleString("en-GB", { maximumFractionDigits: 2 })} t`;
}

function formatKgAndT(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "—";
  return `${formatKg(value)} / ${formatTonnes(value)}`;
}

function formatM2(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m²`;
}

function formatPressureKgM2(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kg/m² / ${(value / 1000).toLocaleString("en-GB", { maximumFractionDigits: 2 })} t/m²`;
}

function formatMetres(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m`;
}

function setupBoomLengthText(setup: CraneSetupOption) {
  return setup.boomLengthM ? `${formatMetres(setup.boomLengthM)} boom` : "";
}

function setupOutreachText(setup: CraneSetupOption) {
  if (
    setup.hydraulicOutreachM &&
    setup.maxRadiusM &&
    setup.hydraulicOutreachM !== setup.maxRadiusM
  ) {
    return `${formatMetres(setup.hydraulicOutreachM)} hydraulic outreach / ${formatMetres(setup.maxRadiusM)} radius`;
  }
  if (setup.hydraulicOutreachM)
    return `${formatMetres(setup.hydraulicOutreachM)} hydraulic outreach`;
  if (setup.maxRadiusM) return `${formatMetres(setup.maxRadiusM)} radius`;
  if (setup.boomLengthM) return `${formatMetres(setup.boomLengthM)} boom`;
  return "";
}

function setupJibText(setup: CraneSetupOption) {
  if (setup.jibOutreachM)
    return `${formatMetres(setup.jibOutreachM)} jib / max outreach`;
  if (setup.maxRadiusM) return `${formatMetres(setup.maxRadiusM)} max radius`;
  return "";
}

function setupLoadChartNote(setup: CraneSetupOption) {
  return (
    setup.chartNote ||
    [
      setup.sourceDocumentTitle
        ? `Source: ${setup.sourceDocumentTitle}.`
        : null,
      setup.sourcePage ? `Page ${setup.sourcePage}.` : null,
      "The appointed person must verify the exact manufacturer/supplier chart, radius, boom length, counterweight, outrigger setup and accessory deductions before approval.",
    ]
      .filter(Boolean)
      .join(" ")
  );
}

const MAT_OPTIONS = [
  { value: "", label: "Select mat size…", lengthM: null, widthM: null },
  { value: "1x3", label: "1m x 3m mat (3.00 m²)", lengthM: 1, widthM: 3 },
  { value: "1x2", label: "1m x 2m mat (2.00 m²)", lengthM: 1, widthM: 2 },
  {
    value: "1.2x2.4",
    label: "1.2m x 2.4m mat (2.88 m²)",
    lengthM: 1.2,
    widthM: 2.4,
  },
  { value: "1.5x3", label: "1.5m x 3m mat (4.50 m²)", lengthM: 1.5, widthM: 3 },
  { value: "2x3", label: "2m x 3m mat (6.00 m²)", lengthM: 2, widthM: 3 },
  {
    value: "custom",
    label: "Custom mat / spreader size",
    lengthM: null,
    widthM: null,
  },
];

function calcMatArea(lengthValue: unknown, widthValue: unknown) {
  const length = numberOrNull(lengthValue);
  const width = numberOrNull(widthValue);
  if (!length || !width) return null;
  return Number((length * width).toFixed(3));
}

function formatArea(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${n.toLocaleString("en-GB", { maximumFractionDigits: 3 })} m²`;
}

function parseWeightToKg(value: unknown) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!text) return null;
  const match = text.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  if (/\bkg\b|kilogram/.test(text)) return raw;
  if (/tonne|ton|\bt\b/.test(text)) return raw * 1000;
  if (raw <= 250) return raw * 1000;
  return raw;
}

function formatPressure(loadKg: number | null, areaM2: number | null) {
  if (!loadKg || !areaM2) return "—";
  const kgPerM2 = loadKg / areaM2;
  const tonnesPerM2 = kgPerM2 / 1000;
  return `${kgPerM2.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kg/m² / ${tonnesPerM2.toLocaleString("en-GB", { maximumFractionDigits: 2 })} t/m²`;
}

function buildDefaultSetupOptions(profile?: EquipmentProfile | null) {
  if (!profile) return [] as CraneSetupOption[];
  if (profile.setupOptions?.length) return profile.setupOptions;

  return [
    {
      key: `${profile.id}-current-profile`,
      label: [
        "Current selected profile",
        profile.maxBoomLengthM ? `${profile.maxBoomLengthM} m boom` : null,
        profile.maxHydraulicOutreachM
          ? `${profile.maxHydraulicOutreachM} m outreach`
          : profile.maxRadiusM
            ? `${profile.maxRadiusM} m radius`
            : null,
        profile.maxJibOutreachM
          ? `${profile.maxJibOutreachM} m jib / max outreach`
          : null,
      ]
        .filter(Boolean)
        .join(" – "),
      boomConfiguration: profile.maxJibOutreachM
        ? "Main boom + jib / fly jib"
        : "Main boom",
      boomLengthM: profile.maxBoomLengthM ?? null,
      hydraulicOutreachM:
        profile.maxHydraulicOutreachM ??
        profile.maxRadiusM ??
        profile.maxBoomLengthM ??
        null,
      jibOutreachM: profile.maxJibOutreachM ?? null,
      maxRadiusM: profile.maxRadiusM ?? profile.maxHydraulicOutreachM ?? null,
      maxTipHeightM: profile.maxTipHeightM ?? null,
      sourceDocumentTitle: profile.sourceLabel,
      sourceLabel: profile.sourceLabel,
      chartNote:
        "Selected from the current crane profile. Verify the exact manufacturer/supplier chart before approval.",
      configurationNote: profile.configurationNote ?? null,
      outriggerNote: profile.outriggersNote ?? null,
    },
  ];
}

export default function LiftPlanForm({
  jobId,
  initial,
  equipmentProfile,
  craneOptions,
  personnelOptions,
  craneSetupOptions,
  craneSetupOptionsByAllocation,
  alternativeCraneOptions,
}: {
  jobId: string;
  initial: LiftPlanData | null;
  equipmentProfile?: EquipmentProfile | null;
  craneOptions: CraneOption[];
  personnelOptions?: PersonOption[];
  craneSetupOptions?: CraneSetupOption[];
  craneSetupOptionsByAllocation?: Record<string, CraneSetupOption[]>;
  alternativeCraneOptions?: CraneOption[];
}) {
  const initialPackSections = (initial?.pack_sections ?? {}) as Record<
    string,
    string | null
  >;
  const initialSelectedAllocationId =
    initial?.selected_job_equipment_id ?? craneOptions[0]?.value ?? "";
  const initialSelectedCraneLabel =
    craneOptions.find((option) => option.value === initialSelectedAllocationId)
      ?.label ??
    craneOptions[0]?.label ??
    "";

  const [form, setForm] = useState<LiftPlanData>(() =>
    sanitiseInitialLiftPlanForCurrentCrane(
      tidyLiftPlanTextFields({
        selected_job_equipment_id:
          initial?.selected_job_equipment_id ?? craneOptions[0]?.value ?? "",
        selected_crane_id:
          initial?.selected_crane_id ?? craneOptions[0]?.craneId ?? "",
        load_description: initial?.load_description ?? "",
        load_weight: initial?.load_weight ?? null,
        lift_radius: initial?.lift_radius ?? null,
        lift_height: initial?.lift_height ?? null,
        crane_configuration: initial?.crane_configuration ?? "",
        outrigger_setup: initial?.outrigger_setup ?? "",
        ground_conditions: initial?.ground_conditions ?? "",
        sling_type: initial?.sling_type ?? "",
        lifting_accessories: initial?.lifting_accessories ?? "",
        method_statement: initial?.method_statement ?? "",
        risk_assessment: initial?.risk_assessment ?? "",
        site_hazards: initial?.site_hazards ?? "",
        control_measures: initial?.control_measures ?? "",
        ppe_required: initial?.ppe_required ?? "",
        exclusion_zone_details: initial?.exclusion_zone_details ?? "",
        weather_limitations: initial?.weather_limitations ?? "",
        emergency_procedures: initial?.emergency_procedures ?? "",
        lift_supervisor: initial?.lift_supervisor ?? "",
        appointed_person: initial?.appointed_person ?? "",
        crane_operator: initial?.crane_operator ?? "",
        rams_complete: initial?.rams_complete ?? false,
        lift_plan_complete: initial?.lift_plan_complete ?? false,
        approved_by: initial?.approved_by ?? "",
        approved_at: initial?.approved_at ?? "",
        approval_notes: initial?.approval_notes ?? "",
        customer_signed_by: initial?.customer_signed_by ?? "",
        operator_signed_by: initial?.operator_signed_by ?? "",
        office_signed_by: initial?.office_signed_by ?? "",
        finalised_at: initial?.finalised_at ?? "",
        paperwork_locked: initial?.paperwork_locked ?? false,
        selected_crane_setup_key:
          initialPackSections.selected_crane_setup_key ?? "",
        selected_crane_setup_label:
          initialPackSections.selected_crane_setup_label ?? "",
        boom_configuration: initialPackSections.boom_configuration ?? "",
        boom_length: initialPackSections.boom_length ?? "",
        crane_outreach_reference:
          initialPackSections.crane_outreach_reference ?? "",
        crane_jib_reference: initialPackSections.crane_jib_reference ?? "",
        crane_details: initialPackSections.crane_details ?? "",
        configuration_outrigger_note:
          initialPackSections.configuration_outrigger_note ?? "",
        load_chart_note: initialPackSections.load_chart_note ?? "",
        ground_bearing_mat_preset:
          initialPackSections.ground_bearing_mat_preset ?? "",
        ground_bearing_mat_length_m:
          initialPackSections.ground_bearing_mat_length_m ?? "",
        ground_bearing_mat_width_m:
          initialPackSections.ground_bearing_mat_width_m ?? "",
        ground_bearing_mat_area_m2:
          initialPackSections.ground_bearing_mat_area_m2 ?? "",
        ground_bearing_bearing_load:
          initialPackSections.ground_bearing_bearing_load ?? "",
        ground_bearing_pressure:
          initialPackSections.ground_bearing_pressure ?? "",
        ground_bearing_notes: initialPackSections.ground_bearing_notes ?? "",
        custom_crane_boom_length_m:
          initialPackSections.custom_crane_boom_length_m ?? "",
        custom_crane_hydraulic_outreach_m:
          initialPackSections.custom_crane_hydraulic_outreach_m ?? "",
        custom_crane_jib_outreach_m:
          initialPackSections.custom_crane_jib_outreach_m ?? "",
        custom_crane_max_radius_m:
          initialPackSections.custom_crane_max_radius_m ?? "",
        multi_crane_enabled:
          initialPackSections.multi_crane_enabled === "true" ||
          Boolean(initialPackSections.additional_cranes_json),
        multi_crane_lift_type:
          initialPackSections.multi_crane_lift_type ??
          "Alternative crane options for same lift / multi-day job",
        multi_crane_notes: initialPackSections.multi_crane_notes ?? "",
        additional_cranes_json:
          initialPackSections.additional_cranes_json ?? "[]",
        range_chart_radius_m: initialPackSections.range_chart_radius_m ?? "",
        range_chart_tip_height_m:
          initialPackSections.range_chart_tip_height_m ?? "",
        range_chart_load_weight_kg:
          initialPackSections.range_chart_load_weight_kg ?? "",
        range_chart_accessory_weight_kg:
          initialPackSections.range_chart_accessory_weight_kg ?? "",
        range_chart_total_lifted_weight_kg:
          initialPackSections.range_chart_total_lifted_weight_kg ?? "",
        range_chart_boom_length_m:
          initialPackSections.range_chart_boom_length_m ?? "",
        range_chart_boom_angle_deg:
          initialPackSections.range_chart_boom_angle_deg ?? "",
        range_chart_chart_capacity_kg:
          initialPackSections.range_chart_chart_capacity_kg ?? "",
        range_chart_capacity_source:
          initialPackSections.range_chart_capacity_source ?? "",
        range_chart_capacity_page:
          initialPackSections.range_chart_capacity_page ?? "",
        range_chart_utilisation_percent:
          initialPackSections.range_chart_utilisation_percent ?? "",
        range_chart_bearing_load_kg:
          initialPackSections.range_chart_bearing_load_kg ?? "",
        range_chart_bearing_pressure_kg_m2:
          initialPackSections.range_chart_bearing_pressure_kg_m2 ?? "",
        range_chart_mat_length_m:
          initialPackSections.range_chart_mat_length_m ?? "",
        range_chart_mat_width_m:
          initialPackSections.range_chart_mat_width_m ?? "",
        range_chart_mats_under_loaded_outrigger:
          initialPackSections.range_chart_mats_under_loaded_outrigger ?? "",
        range_chart_verification_note:
          initialPackSections.range_chart_verification_note ?? "",
        lift_drawing_model_json:
          initialPackSections.lift_drawing_model_json ?? "",
      }),
      initialSelectedCraneLabel,
    ),
  );

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [msg, setMsg] = useState("");
  const [versions, setVersions] = useState<LiftPlanVersionSummary[]>([]);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const locked = !!form.paperwork_locked;

  async function loadPreviousVersions() {
    setLoadingVersions(true);
    setMsg("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/lift-plan/versions`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          data?.error || "Could not load previous lift plan drafts.",
        );
      const items = Array.isArray(data?.versions) ? data.versions : [];
      setVersions(items);
      setVersionsLoaded(true);
      if (!selectedVersionId && items[0]?.id) setSelectedVersionId(items[0].id);
    } catch (error: any) {
      setMsg(error?.message || "Could not load previous lift plan drafts.");
    } finally {
      setLoadingVersions(false);
    }
  }

  async function restorePreviousVersion() {
    if (!selectedVersionId || locked) return;
    const selected = versions.find((item) => item.id === selectedVersionId);
    const label = selected?.created_at
      ? new Date(selected.created_at).toLocaleString("en-GB")
      : "the selected previous draft";
    const ok = window.confirm(
      `Restore lift plan version from ${label}? This will replace the current draft, but the current draft will also be kept as a previous version.`,
    );
    if (!ok) return;

    setRestoringVersion(true);
    setMsg("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/lift-plan/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: selectedVersionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          data?.error || "Could not restore previous lift plan draft.",
        );
      setMsg(
        "Previous lift plan draft restored. Reloading the page so all pack fields are refreshed…",
      );
      window.location.reload();
    } catch (error: any) {
      setMsg(error?.message || "Could not restore previous lift plan draft.");
    } finally {
      setRestoringVersion(false);
    }
  }

  const selectedCraneLabel = useMemo(() => {
    const selected = craneOptions.find(
      (option) => option.value === form.selected_job_equipment_id,
    );
    return selected?.label || "No crane selected";
  }, [craneOptions, form.selected_job_equipment_id]);

  const availableCraneSetupOptions = useMemo(() => {
    const allocationKey = String(form.selected_job_equipment_id ?? "").trim();
    const allocationSpecific = allocationKey
      ? (craneSetupOptionsByAllocation?.[allocationKey] ?? [])
      : [];
    const raw = allocationSpecific.length
      ? allocationSpecific
      : craneSetupOptions?.length
        ? craneSetupOptions
        : buildDefaultSetupOptions(equipmentProfile);
    const seen = new Set<string>();
    return raw.filter((option) => {
      const key = String(option.key || option.label || "").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [
    craneSetupOptions,
    craneSetupOptionsByAllocation,
    equipmentProfile,
    form.selected_job_equipment_id,
  ]);

  const selectedSetup = useMemo(() => {
    const selectedKey = String(form.selected_crane_setup_key ?? "").trim();
    return (
      availableCraneSetupOptions.find((option) => option.key === selectedKey) ??
      null
    );
  }, [availableCraneSetupOptions, form.selected_crane_setup_key]);

  const matAreaM2 =
    numberOrNull(form.ground_bearing_mat_area_m2) ??
    calcMatArea(
      form.ground_bearing_mat_length_m,
      form.ground_bearing_mat_width_m,
    );
  const matBearingLoadKg = parseWeightToKg(form.ground_bearing_bearing_load);
  const matPressureText = formatPressure(matBearingLoadKg, matAreaM2);
  const additionalCranes = useMemo(
    () => safeJsonParseArray(form.additional_cranes_json),
    [form.additional_cranes_json],
  );

  const drawingMachineType: LiftMachineType = /jekko|spider/i.test(
    `${equipmentProfile?.machineType ?? ""} ${selectedCraneLabel}`,
  )
    ? "spider-crane"
    : "mobile-crane";
  const drawingSchedule = useMemo<LiftTechnicalSchedule>(() => ({
    loadDescription: form.load_description,
    loadWeightKg:
      numberOrNull(form.range_chart_load_weight_kg) ??
      numberOrNull(form.load_weight),
    accessoryWeightKg:
      numberOrNull(form.range_chart_accessory_weight_kg) ?? 0,
    grossLiftedWeightKg:
      numberOrNull(form.range_chart_total_lifted_weight_kg) ??
      ((numberOrNull(form.range_chart_load_weight_kg) ??
        numberOrNull(form.load_weight) ??
        0) +
        (numberOrNull(form.range_chart_accessory_weight_kg) ?? 0)),
    radiusM:
      numberOrNull(form.range_chart_radius_m) ??
      numberOrNull(form.lift_radius),
    boomLengthM: numberOrNull(form.range_chart_boom_length_m),
    boomAngleDeg: numberOrNull(form.range_chart_boom_angle_deg),
    hookHeightM:
      numberOrNull(form.range_chart_tip_height_m) ??
      numberOrNull(form.lift_height),
    chartCapacityKg: numberOrNull(form.range_chart_chart_capacity_kg),
    chartSource: form.range_chart_capacity_source,
    chartPage: form.range_chart_capacity_page,
    utilisationPercent: numberOrNull(form.range_chart_utilisation_percent),
    exactConfiguration:
      form.selected_crane_setup_label ?? form.crane_configuration,
    stabiliserSetup: form.outrigger_setup,
    workingSector: parseLiftDrawingModel(form.lift_drawing_model_json).technical
      .workingSector,
    groundPressureKgM2:
      numberOrNull(form.range_chart_bearing_pressure_kg_m2) ??
      numberOrNull(form.ground_bearing_pressure),
    matLengthM:
      numberOrNull(form.range_chart_mat_length_m) ??
      numberOrNull(form.ground_bearing_mat_length_m),
    matWidthM:
      numberOrNull(form.range_chart_mat_width_m) ??
      numberOrNull(form.ground_bearing_mat_width_m),
    liftingAccessories: form.lifting_accessories,
    siteHazards: form.site_hazards,
    controlMeasures: form.control_measures,
  }), [form]);
  const drawingModel = useMemo(
    () => parseLiftDrawingModel(form.lift_drawing_model_json, {
      machineType: drawingMachineType,
      machineLabel: selectedCraneLabel,
      drawingNumber: `LP-${jobId.slice(0, 8).toUpperCase()}`,
    }),
    [drawingMachineType, form.lift_drawing_model_json, jobId, selectedCraneLabel],
  );
  const drawingApprovalErrors = useMemo(
    () => liftDrawingApprovalErrors(drawingModel, drawingSchedule),
    [drawingModel, drawingSchedule],
  );

  const additionalCraneSelectOptions = useMemo(() => {
    const seen = new Set<string>();
    const source =
      (alternativeCraneOptions?.length
        ? alternativeCraneOptions
        : craneOptions) ?? [];
    return source.filter((option) => {
      const key = String(
        option.craneId || option.label || option.value || "",
      ).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [alternativeCraneOptions, craneOptions]);

  const multiCraneArrangementOptions = useMemo(
    () => [
      {
        value: "Alternative crane options for same lift / multi-day job",
        label: "Alternative crane options for same lift / multi-day job",
      },
      {
        value: "Assisting crane - separate task",
        label: "Assisting crane - separate task",
      },
      {
        value: "Tandem / shared-load lift",
        label: "Tandem / shared-load lift",
      },
    ],
    [],
  );

  const personnelSelectOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: PersonOption[] = [{ value: "", label: "Select person…" }];

    for (const option of personnelOptions ?? []) {
      const value = String(option.value || option.label || "").trim();
      if (!value || seen.has(value.toLowerCase())) continue;
      seen.add(value.toLowerCase());
      options.push({ value, label: option.label || value });
    }

    for (const existingValue of [form.lift_supervisor, form.crane_operator]) {
      const value = String(existingValue ?? "").trim();
      if (!value || seen.has(value.toLowerCase())) continue;
      seen.add(value.toLowerCase());
      options.push({ value, label: `${value} (saved value)` });
    }

    return options;
  }, [personnelOptions, form.lift_supervisor, form.crane_operator]);

  function update(key: keyof LiftPlanData, value: any) {
    if (locked) return;
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateSelectedCrane(allocationId: string) {
    if (locked) return;
    const selected =
      craneOptions.find((option) => option.value === allocationId) ?? null;
    setForm((prev) => {
      const changed =
        String(prev.selected_job_equipment_id ?? "") !==
        String(allocationId ?? "");
      const base = changed ? clearMachineNarrativeFields(prev) : { ...prev };
      const shouldClearSupervisor =
        changed &&
        (!hasDraftValue(prev.lift_supervisor) ||
          String(prev.lift_supervisor ?? "").trim() ===
            String(prev.crane_operator ?? "").trim());
      return {
        ...base,
        lift_supervisor: shouldClearSupervisor ? "" : prev.lift_supervisor,
        selected_job_equipment_id: allocationId || "",
        selected_crane_id: selected?.craneId || "",
        selected_crane_setup_key: changed ? "" : prev.selected_crane_setup_key,
        selected_crane_setup_label: changed
          ? ""
          : prev.selected_crane_setup_label,
      };
    });
    if (
      String(form.selected_job_equipment_id ?? "") !==
      String(allocationId ?? "")
    ) {
      setMsg(
        "Selected crane changed. Select the crane setup/chart, then generate the AI draft if you need wording rebuilt.",
      );
    }
  }

  function applyCraneSetup(setupKey: string) {
    if (locked) return;
    const setup =
      availableCraneSetupOptions.find((option) => option.key === setupKey) ??
      null;

    setForm((prev) => {
      if (!setup) {
        return {
          ...prev,
          selected_crane_setup_key: "",
          selected_crane_setup_label: "",
          boom_configuration: "",
          boom_length: "",
          crane_outreach_reference: "",
          crane_jib_reference: "",
          crane_details: "",
          configuration_outrigger_note: "",
          load_chart_note: "",
          custom_crane_boom_length_m: "",
          custom_crane_hydraulic_outreach_m: "",
          custom_crane_jib_outreach_m: "",
          custom_crane_max_radius_m: "",
        };
      }

      const boomConfiguration =
        setup.boomConfiguration || setup.label || "Selected crane setup";
      const boomLengthText = setupBoomLengthText(setup);
      const outreachText = setupOutreachText(setup);
      const jibText = setupJibText(setup);
      const chartNote = setupLoadChartNote(setup);
      const configurationNote = [
        setup.configurationNote || boomConfiguration,
        setup.outriggerNote,
      ]
        .filter(Boolean)
        .join("\n\n");

      return {
        ...prev,
        selected_crane_setup_key: setup.key,
        selected_crane_setup_label: setup.label,
        boom_configuration: boomConfiguration,
        boom_length: boomLengthText,
        crane_outreach_reference: outreachText,
        crane_jib_reference: jibText,
        crane_details: [
          equipmentProfile?.summary,
          `Selected setup: ${setup.label}`,
        ]
          .filter(Boolean)
          .join("\n"),
        configuration_outrigger_note: configurationNote,
        load_chart_note: chartNote,
        crane_configuration: prev.crane_configuration || boomConfiguration,
        outrigger_setup:
          prev.outrigger_setup ||
          setup.outriggerNote ||
          "Confirm outrigger setup and mats/spreaders against selected chart.",
        custom_crane_boom_length_m: setup.boomLengthM
          ? String(setup.boomLengthM)
          : "",
        custom_crane_hydraulic_outreach_m: setup.hydraulicOutreachM
          ? String(setup.hydraulicOutreachM)
          : "",
        custom_crane_jib_outreach_m: setup.jibOutreachM
          ? String(setup.jibOutreachM)
          : "",
        custom_crane_max_radius_m: setup.maxRadiusM
          ? String(setup.maxRadiusM)
          : "",
      };
    });
    setMsg(
      "Crane setup selected. Save draft to pull boom/outreach and jib/max outreach through into the lift plan pack.",
    );
  }

  function updateMatPreset(preset: string) {
    if (locked) return;
    const option = MAT_OPTIONS.find((item) => item.value === preset) ?? null;
    const lengthM = option?.lengthM
      ? String(option.lengthM)
      : preset === "custom"
        ? (form.ground_bearing_mat_length_m ?? "")
        : "";
    const widthM = option?.widthM
      ? String(option.widthM)
      : preset === "custom"
        ? (form.ground_bearing_mat_width_m ?? "")
        : "";
    const area = calcMatArea(lengthM, widthM);
    setForm((prev) => ({
      ...prev,
      ground_bearing_mat_preset: preset,
      ground_bearing_mat_length_m: lengthM,
      ground_bearing_mat_width_m: widthM,
      ground_bearing_mat_area_m2: area ? String(area) : "",
      ground_bearing_notes:
        prev.ground_bearing_notes ||
        "Ground bearing pressure calculation: bearing load / outrigger reaction divided by selected mat area in m². Final ground bearing and outrigger reactions must be verified against the actual crane chart and ground conditions.",
    }));
  }

  function updateMatDimension(
    key: "ground_bearing_mat_length_m" | "ground_bearing_mat_width_m",
    value: string,
  ) {
    if (locked) return;
    setForm((prev) => {
      const next = {
        ...prev,
        [key]: value,
        ground_bearing_mat_preset: prev.ground_bearing_mat_preset || "custom",
      };
      const area = calcMatArea(
        next.ground_bearing_mat_length_m,
        next.ground_bearing_mat_width_m,
      );
      return { ...next, ground_bearing_mat_area_m2: area ? String(area) : "" };
    });
  }

  function autoPopulateAdditionalCrane(
    crane: AdditionalCraneEntry,
  ): AdditionalCraneEntry {
    const selectedCrane =
      additionalCraneSelectOptions.find(
        (option) => option.value === crane.selected_crane_option_value,
      ) ?? null;
    const craneName = String(
      crane.crane_name || selectedCrane?.label || "",
    ).trim();
    const specOptions = getRangeChartSpecOptions({
      craneName,
    });
    const enteredBoomLengthM = numberOrNull(crane.boom_length_m);
    const boomMatchedProfile = crane.boom_length_m_manual
      ? findBestProfileForBoomLength(
          specOptions.profileOptions,
          enteredBoomLengthM,
        )
      : null;
    const selectedProfile =
      boomMatchedProfile ??
      specOptions.profileOptions.find(
        (option) => option.key === crane.selected_profile_key,
      ) ??
      specOptions.profileOptions[0] ??
      null;
    const manualBoomHasExactStructuredProfile =
      !crane.boom_length_m_manual ||
      !enteredBoomLengthM ||
      structuredProfileOptionsContainBoomLength(
        specOptions.profileOptions,
        enteredBoomLengthM,
      );
    const selectedJib = crane.selected_jib_key
      ? (specOptions.jibOptions.find(
          (option) => option.key === crane.selected_jib_key,
        ) ?? null)
      : null;
    const setupLabel = buildAdditionalCraneSetupLabel(
      selectedProfile?.label ?? crane.setup_profile,
      selectedJib?.label ?? "",
    );
    const limits = getRangeChartLimits({
      craneName,
      setupLabel,
      sourceLabel:
        selectedProfile?.source ||
        selectedJib?.source ||
        crane.spec_sheet_reference,
      setupMaxBoomLengthM:
        selectedProfile?.maxBoomLengthM ??
        selectedProfile?.defaultBoomLengthM ??
        null,
      setupMaxRadiusM:
        selectedJib?.maxRadiusM ?? selectedProfile?.maxRadiusM ?? null,
      setupMaxTipHeightM:
        selectedJib?.maxTipHeightM ?? selectedProfile?.maxTipHeightM ?? null,
      setupMaxPhysicalJibLengthM: selectedJib?.lengthM ?? null,
    });

    const loadKg =
      numberOrNull(crane.load_share_kg) ??
      numberOrNull(form.range_chart_load_weight_kg) ??
      numberOrNull(form.load_weight) ??
      0;
    const accessoryKg =
      numberOrNull(crane.accessory_weight_kg) ??
      numberOrNull(form.range_chart_accessory_weight_kg) ??
      parseWeightToKg(form.lifting_accessories) ??
      0;
    const totalLiftedWeightKg = loadKg + accessoryKg;
    const defaultBoomLengthM =
      selectedProfile?.defaultBoomLengthM ??
      selectedProfile?.maxBoomLengthM ??
      limits.maxBoomLengthM ??
      null;
    const boomLengthM = enteredBoomLengthM ?? defaultBoomLengthM;
    const radiusM =
      numberOrNull(crane.radius_m) ??
      numberOrNull(form.range_chart_radius_m) ??
      numberOrNull(form.lift_radius);
    const hookHeightM =
      numberOrNull(crane.hook_height_m) ??
      numberOrNull(form.range_chart_tip_height_m) ??
      numberOrNull(form.lift_height);
    const jibLengthM = selectedJib?.lengthM ?? 0;

    const capacity =
      radiusM && manualBoomHasExactStructuredProfile
        ? calculateRangeChartCapacity({
            craneName,
            setupLabel,
            sourceLabel:
              selectedProfile?.source ||
              selectedJib?.source ||
              crane.spec_sheet_reference,
            radiusM,
            boomLengthM,
            jibLengthM,
            totalLiftedWeightKg,
          })
        : null;
    const manualBoomNeedsManualCapacity = Boolean(
      radiusM &&
      crane.boom_length_m_manual &&
      enteredBoomLengthM &&
      specOptions.rule &&
      !manualBoomHasExactStructuredProfile,
    );
    const bearing = calculateRangeChartBearingLoad({
      craneName,
      setupLabel,
      sourceLabel:
        selectedProfile?.source ||
        selectedJib?.source ||
        crane.spec_sheet_reference,
      totalLiftedWeightKg,
    });

    const next: AdditionalCraneEntry = {
      ...crane,
      crane_name: craneName,
      selected_profile_key: selectedProfile?.key || crane.selected_profile_key,
      setup_profile: setupLabel || crane.setup_profile,
      spec_sheet_reference:
        capacity?.source ||
        selectedProfile?.source ||
        selectedJib?.source ||
        specOptions.rule?.capacitySource ||
        crane.spec_sheet_reference,
      // Keep manually entered telescopic boom lengths exactly as typed.
      // Previously this field was auto-filled back to the default/max boom length on every edit,
      // so additional cranes could stay on the wrong chart and show over-capacity.
      boom_length_m: crane.boom_length_m_manual
        ? crane.boom_length_m
        : crane.boom_length_m || formatAutoMInput(boomLengthM),
      radius_m: crane.radius_m || formatAutoMInput(radiusM),
      hook_height_m: crane.hook_height_m || formatAutoMInput(hookHeightM),
      load_share_kg: crane.load_share_kg || formatAutoKgInput(loadKg),
      accessory_weight_kg:
        crane.accessory_weight_kg || formatAutoKgInput(accessoryKg),
      crane_gross_weight_kg: limits.planningWeightKg
        ? formatAutoKgInput(limits.planningWeightKg)
        : crane.crane_gross_weight_kg,
      chart_capacity_kg: manualBoomNeedsManualCapacity
        ? crane.chart_capacity_kg
        : capacity?.capacityKg
          ? formatAutoKgInput(capacity.capacityKg)
          : capacity?.allowManualCapacityFallback
            ? crane.chart_capacity_kg
            : "",
    };

    const generatedVerificationNotes = manualBoomNeedsManualCapacity
      ? [
          `${specOptions.rule?.title ?? craneName} recognised, but the selected boom length ${Number(enteredBoomLengthM).toLocaleString("en-GB", { maximumFractionDigits: 2 })} m does not have a structured load-chart column in the CRM for this crane. The CRM has not used the longer-boom capacity as this may incorrectly show the crane as over capacity. Enter the verified chart capacity manually from the manufacturer/supplier spec for this exact boom length, radius and setup.`,
          bearing?.source ? `Bearing/reaction: ${bearing.source}` : null,
          "Final AP check required against the exact manufacturer/supplier chart and actual crane used on the day.",
        ]
      : [
          capacity?.setupAdvice || capacity?.source,
          bearing?.source ? `Bearing/reaction: ${bearing.source}` : null,
          capacity?.warning,
          "Final AP check required against the exact manufacturer/supplier chart and actual crane used on the day.",
        ];

    const existingNotes = String(next.verification_notes ?? "").trim();
    const looksAutoGenerated =
      !existingNotes ||
      /Final AP check required|recognised, but|Selected setup advice|Structured setup advice|Preliminary SPX532/i.test(
        existingNotes,
      );
    if (looksAutoGenerated && generatedVerificationNotes.some(Boolean)) {
      next.verification_notes = generatedVerificationNotes
        .filter(Boolean)
        .join("\n");
    }

    return next;
  }

  function setAdditionalCranes(nextCranes: AdditionalCraneEntry[]) {
    const normalised = nextCranes.map((crane) =>
      autoPopulateAdditionalCrane(crane),
    );
    setForm((prev) => ({
      ...prev,
      multi_crane_enabled:
        normalised.length > 0 ? true : prev.multi_crane_enabled,
      additional_cranes_json: stringifyAdditionalCranes(normalised),
    }));
  }

  function addAdditionalCrane() {
    if (locked) return;
    const first = additionalCraneSelectOptions[0] ?? null;
    const entry = newAdditionalCraneEntry();
    if (first) {
      entry.selected_crane_option_value = first.value;
      entry.crane_name = first.label;
    }
    const next = [...additionalCranes, entry];
    setAdditionalCranes(next);
  }

  function updateAdditionalCrane(
    id: string,
    key: keyof AdditionalCraneEntry,
    value: string,
  ) {
    if (locked) return;
    const next = additionalCranes.map((item) => {
      if (item.id !== id) return item;
      const changed = { ...item, [key]: value };
      if (key === "selected_crane_option_value") {
        const selected =
          additionalCraneSelectOptions.find(
            (option) => option.value === value,
          ) ?? null;
        changed.crane_name = selected?.label || "";
        changed.selected_profile_key = "";
        changed.selected_jib_key = "";
        changed.setup_profile = "";
        changed.boom_length_m = "";
        changed.boom_length_m_manual = false;
        changed.spec_sheet_reference = "";
        changed.chart_capacity_kg = "";
        changed.crane_gross_weight_kg = "";
        changed.verification_notes = "";
      }
      if (key === "selected_profile_key" || key === "selected_jib_key") {
        changed.boom_length_m = "";
        changed.boom_length_m_manual = false;
      }
      if (key === "boom_length_m") {
        changed.boom_length_m_manual = true;
        const selected =
          additionalCraneSelectOptions.find(
            (option) => option.value === changed.selected_crane_option_value,
          ) ?? null;
        const craneNameForSpecs = changed.crane_name || selected?.label || "";
        // Use the full crane spec rule when matching a typed telescopic boom length.
        // Passing the old setup/source here can lock the lookup to the previous profile,
        // which is why additional cranes could keep using the old chart after the boom was changed.
        const specOptions = getRangeChartSpecOptions({
          craneName: craneNameForSpecs,
        });
        const matchedProfile = findBestProfileForBoomLength(
          specOptions.profileOptions,
          numberOrNull(value),
        );
        if (matchedProfile) {
          changed.selected_profile_key = matchedProfile.key;
          changed.setup_profile = matchedProfile.label;
          changed.spec_sheet_reference =
            matchedProfile.source || changed.spec_sheet_reference;
        }
      }
      if (
        key === "selected_profile_key" ||
        key === "selected_jib_key" ||
        key === "radius_m" ||
        key === "boom_length_m" ||
        key === "load_share_kg" ||
        key === "accessory_weight_kg"
      ) {
        changed.chart_capacity_kg =
          key === "radius_m" ||
          key === "selected_profile_key" ||
          key === "selected_jib_key" ||
          key === "boom_length_m"
            ? ""
            : changed.chart_capacity_kg;
      }
      return changed;
    });
    setAdditionalCranes(next);
  }

  function removeAdditionalCrane(id: string) {
    if (locked) return;
    const next = additionalCranes.filter((item) => item.id !== id);
    setAdditionalCranes(next);
  }

  async function postForm(payload: LiftPlanData) {
    const cleanedPayload = tidyLiftPlanTextFields(payload);
    const area =
      numberOrNull(cleanedPayload.ground_bearing_mat_area_m2) ??
      calcMatArea(
        cleanedPayload.ground_bearing_mat_length_m,
        cleanedPayload.ground_bearing_mat_width_m,
      );
    const pressure = formatPressure(
      parseWeightToKg(cleanedPayload.ground_bearing_bearing_load),
      area,
    );
    const payloadWithCalculatedSections: LiftPlanData = {
      ...cleanedPayload,
      additional_cranes_json: stringifyAdditionalCranes(
        safeJsonParseArray(cleanedPayload.additional_cranes_json).map((crane) =>
          autoPopulateAdditionalCrane(crane),
        ),
      ),
      ground_bearing_mat_area_m2: area
        ? String(area)
        : (cleanedPayload.ground_bearing_mat_area_m2 ?? ""),
      ground_bearing_pressure:
        pressure !== "—"
          ? pressure
          : (cleanedPayload.ground_bearing_pressure ?? ""),
    };

    const res = await fetch(`/api/jobs/${jobId}/lift-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadWithCalculatedSections),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Error saving lift plan.");
    return data;
  }

  async function generateDraft() {
    if (locked) return;
    setGenerating(true);
    setMsg("");

    try {
      await postForm(form);
      const res = await fetch(`/api/jobs/${jobId}/lift-plan/generate`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not generate draft.");

      const mergedBase = mergeGeneratedDraft(form, data?.draft, [
        "load_description",
        "load_weight",
        "lift_radius",
        "lift_height",
        "sling_type",
        "lifting_accessories",
        "appointed_person",
      ]);

      const merged: LiftPlanData = {
        ...mergedBase,
        selected_job_equipment_id: form.selected_job_equipment_id,
        selected_crane_id: form.selected_crane_id,
        paperwork_locked: form.paperwork_locked,
        approved_by: form.approved_by,
        approved_at: form.approved_at,
        approval_notes: form.approval_notes,
        customer_signed_by: form.customer_signed_by,
        operator_signed_by: form.operator_signed_by,
        office_signed_by: form.office_signed_by,
        finalised_at: form.finalised_at,
      };

      const cleanedMerged = tidyLiftPlanTextFields(merged);
      await postForm(cleanedMerged);
      setForm(cleanedMerged);
      setMsg(
        `AI draft generated and saved (${data?.provider === "openai" ? "AI" : "fallback"}). Review and edit before finalising.`,
      );
    } catch (e: any) {
      setMsg(e?.message || "Could not generate draft.");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (locked) return;
    setSaving(true);
    setMsg("");
    try {
      const cleanedForm = tidyLiftPlanTextFields(form);
      await postForm(cleanedForm);
      setForm(cleanedForm);
      setMsg("Lift plan / RAMS saved.");
    } catch (e: any) {
      setMsg(e?.message || "Error saving lift plan.");
    } finally {
      setSaving(false);
    }
  }

  function approveNow() {
    if (locked) return;
    if (drawingApprovalErrors.length) {
      setMsg(`Cannot approve yet: ${drawingApprovalErrors.join(" ")}`);
      return;
    }
    const now = new Date().toISOString();
    setForm((prev) => ({
      ...prev,
      approved_at: now,
      rams_complete: true,
      lift_plan_complete: true,
    }));
  }

  async function finaliseNow() {
    if (locked) return;
    setSaving(true);
    setMsg("");
    try {
      if (drawingApprovalErrors.length) {
        throw new Error(
          `Cannot finalise yet: ${drawingApprovalErrors.join(" ")}`,
        );
      }
      const finalPayload: LiftPlanData = {
        ...form,
        finalised_at: new Date().toISOString(),
        paperwork_locked: true,
      };
      await postForm(finalPayload);
      setForm(finalPayload);
      setMsg("Paperwork finalised and locked.");
    } catch (e: any) {
      setMsg(e?.message || "Could not finalise paperwork.");
    } finally {
      setSaving(false);
    }
  }

  async function unlockNow() {
    setUnlocking(true);
    setMsg("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/lift-plan/unlock`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.error || "Could not unlock paperwork.");

      setForm((prev) => ({
        ...prev,
        paperwork_locked: false,
        finalised_at: "",
      }));

      setMsg(
        "Paperwork unlocked. Make your changes and finalise it again when ready.",
      );
    } catch (e: any) {
      setMsg(e?.message || "Could not unlock paperwork.");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <div style={topRow}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24 }}>Lift Plan & RAMS</h2>
          <div style={helperText}>
            Generate a draft, review it, then save and finalise manually.
          </div>
        </div>
        <div style={buttonRow}>
          <a
            href={`/jobs/${jobId}/lift-plan/print`}
            target="_blank"
            style={secondaryBtn}
          >
            Printable version
          </a>
          {locked ? (
            <button
              type="button"
              onClick={unlockNow}
              disabled={unlocking || generating || saving}
              style={warningBtn}
            >
              {unlocking ? "Unlocking…" : "Unlock for edits"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={generateDraft}
            disabled={locked || generating || saving || unlocking}
            style={secondaryBtn}
          >
            {generating ? "Generating…" : "Generate AI draft"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={locked || generating || saving || unlocking}
            style={primaryBtn}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={finaliseNow}
            disabled={locked || generating || saving || unlocking}
            style={dangerBtn}
          >
            Finalise & lock
          </button>
        </div>
      </div>

      <div style={infoBox}>
        Crane selection, crane setup/profile, load weight, lift radius, lift
        height, mat size, bearing load and bearing pressure are now controlled
        in the <strong>Range chart / lift sketch builder</strong> above. Use the
        sections below for wording, RAMS and approvals only.
      </div>
      {locked ? (
        <div style={lockedBox}>
          Paperwork is locked. Use <strong>Unlock for edits</strong> to reopen
          it, then finalise it again when you are done.
        </div>
      ) : null}
      {msg ? <div style={msgBox}>{msg}</div> : null}

      <div style={versionBox}>
        <div>
          <strong>Previous lift plan drafts</strong>
          <div style={helperText}>
            Every future Save draft / Generate AI draft keeps a snapshot of the
            previous draft so it can be restored later.
          </div>
        </div>
        <div style={versionActions}>
          <button
            type="button"
            onClick={loadPreviousVersions}
            disabled={
              loadingVersions || saving || generating || restoringVersion
            }
            style={secondaryBtn}
          >
            {loadingVersions
              ? "Loading…"
              : versionsLoaded
                ? "Refresh versions"
                : "Load previous versions"}
          </button>
          {versionsLoaded ? (
            <>
              <select
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                disabled={!versions.length || restoringVersion || locked}
                style={versionSelect}
              >
                {versions.length ? (
                  versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.created_at
                        ? new Date(version.created_at).toLocaleString("en-GB")
                        : "Saved version"}
                      {version.reason ? ` - ${version.reason}` : ""}
                    </option>
                  ))
                ) : (
                  <option value="">No previous versions saved yet</option>
                )}
              </select>
              <button
                type="button"
                onClick={restorePreviousVersion}
                disabled={!selectedVersionId || restoringVersion || locked}
                style={warningBtn}
              >
                {restoringVersion ? "Restoring…" : "Restore selected"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <LiftArrangementEditor
        value={drawingModel}
        onChange={(model) =>
          update("lift_drawing_model_json", serialiseLiftDrawingModel(model))
        }
        schedule={drawingSchedule}
        machineType={drawingMachineType}
        machineLabel={selectedCraneLabel}
        drawingNumber={`LP-${jobId.slice(0, 8).toUpperCase()}`}
        disabled={locked}
      />

      <Section title="Alternative cranes / multi-day crane options">
        <div style={tickRow}>
          <label style={tickLabel}>
            <input
              type="checkbox"
              checked={!!form.multi_crane_enabled}
              onChange={(e) => update("multi_crane_enabled", e.target.checked)}
              disabled={locked}
            />
            Enable alternative / additional crane details
          </label>
          <button
            type="button"
            onClick={addAdditionalCrane}
            disabled={locked}
            style={secondaryBtn}
          >
            + Add another crane
          </button>
        </div>
        <div style={grid2}>
          <SelectField
            label="Lift type / arrangement"
            value={
              form.multi_crane_lift_type ??
              "Alternative crane options for same lift / multi-day job"
            }
            onChange={(v) => update("multi_crane_lift_type", v)}
            disabled={locked}
            options={multiCraneArrangementOptions}
          />
        </div>
        <TextAreaField
          label="Alternative crane notes / AP instructions"
          value={form.multi_crane_notes ?? ""}
          onChange={(v) => update("multi_crane_notes", v)}
          disabled={locked}
          rows={3}
        />
        {additionalCranes.length === 0 ? (
          <div style={helperText}>
            Add another crane here when the same planned work may be carried out
            with a different crane on a different day. The main selected crane
            remains controlled by the range chart above. Use the
            tandem/shared-load option only where two cranes lift the same load
            at the same time.
          </div>
        ) : null}
        {additionalCranes.map((crane, index) => {
          const totals = additionalCraneTotals(crane);
          const overCapacity = Boolean(
            totals.utilisationPercent && totals.utilisationPercent > 100,
          );
          return (
            <div key={crane.id} style={multiCraneCard}>
              <div style={multiCraneHeader}>
                <strong>Crane option {index + 1}</strong>
                <button
                  type="button"
                  onClick={() => removeAdditionalCrane(crane.id)}
                  disabled={locked}
                  style={smallDangerBtn}
                >
                  Remove
                </button>
              </div>
              {(() => {
                const selectedCrane =
                  additionalCraneSelectOptions.find(
                    (option) =>
                      option.value === crane.selected_crane_option_value,
                  ) ?? null;
                const craneNameForSpecs =
                  crane.crane_name || selectedCrane?.label || "";
                const specOptions = getRangeChartSpecOptions({
                  craneName: craneNameForSpecs,
                });
                const profileOptions = specOptions.profileOptions;
                const jibOptions = specOptions.jibOptions;
                return (
                  <div style={grid2}>
                    <SelectField
                      label="Crane option from CRM/spec library"
                      value={crane.selected_crane_option_value}
                      onChange={(v) =>
                        updateAdditionalCrane(
                          crane.id,
                          "selected_crane_option_value",
                          v,
                        )
                      }
                      disabled={locked}
                      options={[
                        { value: "", label: "Select crane…" },
                        ...additionalCraneSelectOptions.map((option) => ({
                          value: option.value,
                          label: option.label,
                        })),
                      ]}
                    />
                    {!crane.selected_crane_option_value ? (
                      <Field
                        label="Manual crane name / model"
                        value={crane.crane_name}
                        onChange={(v) =>
                          updateAdditionalCrane(crane.id, "crane_name", v)
                        }
                        disabled={locked}
                      />
                    ) : null}
                    <Field
                      label="Use / role for this crane"
                      value={crane.crane_role}
                      onChange={(v) =>
                        updateAdditionalCrane(crane.id, "crane_role", v)
                      }
                      disabled={locked}
                    />
                    <Field
                      label="Planned day / visit / when used"
                      value={crane.planned_use}
                      onChange={(v) =>
                        updateAdditionalCrane(crane.id, "planned_use", v)
                      }
                      disabled={locked}
                    />
                    {profileOptions.length ? (
                      <SelectField
                        label="Main boom / profile"
                        value={crane.selected_profile_key}
                        onChange={(v) =>
                          updateAdditionalCrane(
                            crane.id,
                            "selected_profile_key",
                            v,
                          )
                        }
                        disabled={locked}
                        options={[
                          { value: "", label: "Select profile from spec…" },
                          ...profileOptions.map((option) => ({
                            value: option.key,
                            label: option.label,
                          })),
                        ]}
                      />
                    ) : (
                      <Field
                        label="Setup / profile / chart used"
                        value={crane.setup_profile}
                        onChange={(v) =>
                          updateAdditionalCrane(crane.id, "setup_profile", v)
                        }
                        disabled={locked}
                      />
                    )}
                    {jibOptions.length ? (
                      <SelectField
                        label="Fly jib / extension option"
                        value={crane.selected_jib_key}
                        onChange={(v) =>
                          updateAdditionalCrane(crane.id, "selected_jib_key", v)
                        }
                        disabled={locked}
                        options={[
                          { value: "", label: "Select jib/extension…" },
                          ...jibOptions.map((option) => ({
                            value: option.key,
                            label: option.label,
                          })),
                        ]}
                      />
                    ) : null}
                    <Field
                      label="Spec sheet / chart reference"
                      value={crane.spec_sheet_reference}
                      onChange={(v) =>
                        updateAdditionalCrane(
                          crane.id,
                          "spec_sheet_reference",
                          v,
                        )
                      }
                      disabled={locked}
                    />
                    <Field
                      label="Boom length / chart column (m)"
                      type="number"
                      step="0.01"
                      value={crane.boom_length_m}
                      onChange={(v) =>
                        updateAdditionalCrane(crane.id, "boom_length_m", v)
                      }
                      disabled={locked}
                    />
                    <Field
                      label="Radius (m)"
                      type="number"
                      step="0.01"
                      value={crane.radius_m}
                      onChange={(v) =>
                        updateAdditionalCrane(crane.id, "radius_m", v)
                      }
                      disabled={locked}
                    />
                    <Field
                      label="Hook / lift height (m)"
                      type="number"
                      step="0.01"
                      value={crane.hook_height_m}
                      onChange={(v) =>
                        updateAdditionalCrane(crane.id, "hook_height_m", v)
                      }
                      disabled={locked}
                    />
                    <Field
                      label="Chart capacity at radius (kg)"
                      type="number"
                      step="1"
                      value={crane.chart_capacity_kg}
                      onChange={(v) =>
                        updateAdditionalCrane(crane.id, "chart_capacity_kg", v)
                      }
                      disabled={locked}
                    />
                    <Field
                      label="Crane planning / gross weight (kg)"
                      type="number"
                      step="1"
                      value={crane.crane_gross_weight_kg}
                      onChange={(v) =>
                        updateAdditionalCrane(
                          crane.id,
                          "crane_gross_weight_kg",
                          v,
                        )
                      }
                      disabled={locked}
                    />
                    <Field
                      label="Planned load on this crane (kg)"
                      type="number"
                      step="1"
                      value={crane.load_share_kg}
                      onChange={(v) =>
                        updateAdditionalCrane(crane.id, "load_share_kg", v)
                      }
                      disabled={locked}
                    />
                    <Field
                      label="Accessories for this crane (kg)"
                      type="number"
                      step="1"
                      value={crane.accessory_weight_kg}
                      onChange={(v) =>
                        updateAdditionalCrane(
                          crane.id,
                          "accessory_weight_kg",
                          v,
                        )
                      }
                      disabled={locked}
                    />
                    <Field
                      label="Mat length (m)"
                      type="number"
                      step="0.01"
                      value={crane.mat_length_m}
                      onChange={(v) =>
                        updateAdditionalCrane(crane.id, "mat_length_m", v)
                      }
                      disabled={locked}
                    />
                    <Field
                      label="Mat width (m)"
                      type="number"
                      step="0.01"
                      value={crane.mat_width_m}
                      onChange={(v) =>
                        updateAdditionalCrane(crane.id, "mat_width_m", v)
                      }
                      disabled={locked}
                    />
                  </div>
                );
              })()}
              <div style={summaryGrid}>
                <ReadOnlyFact
                  label="Total lifted / planned load"
                  value={formatKgAndT(totals.totalLiftedKg)}
                />
                <ReadOnlyFact
                  label="Utilisation"
                  value={
                    totals.utilisationPercent !== null
                      ? `${totals.utilisationPercent.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`
                      : "—"
                  }
                />
                <ReadOnlyFact
                  label="Mat area"
                  value={formatM2(totals.matAreaM2)}
                />
                <ReadOnlyFact
                  label="Est. bearing load"
                  value={formatKgAndT(totals.bearingLoadKg)}
                />
                <ReadOnlyFact
                  label="Est. bearing pressure"
                  value={formatPressureKgM2(totals.bearingPressureKgM2)}
                />
              </div>
              {overCapacity ? (
                <div style={capacityWarningBox}>
                  Warning: this crane is over 100% of entered chart capacity.
                  Change crane/setup/load share before approval.
                </div>
              ) : null}
              <TextAreaField
                label="Verification notes / day-use notes for this crane"
                value={crane.verification_notes}
                onChange={(v) =>
                  updateAdditionalCrane(crane.id, "verification_notes", v)
                }
                disabled={locked}
                rows={3}
              />
            </div>
          );
        })}
        <div style={helperText}>
          For ongoing or multi-day work, list each acceptable crane option
          separately. This does not mean the lift is tandem unless the lift type
          above states tandem/shared-load. The pack will show each crane option
          separately so the appointed person can verify the actual crane used on
          the day against the correct manufacturer/supplier chart.
        </div>
      </Section>

      <Section title="Lift details / accessories">
        <div style={grid2}>
          <Field
            label="Load description"
            value={form.load_description ?? ""}
            onChange={(v) => update("load_description", v)}
            disabled={locked}
          />
          <Field
            label="Sling type"
            value={form.sling_type ?? ""}
            onChange={(v) => update("sling_type", v)}
            disabled={locked}
          />
          <Field
            label="Lifting accessories"
            value={form.lifting_accessories ?? ""}
            onChange={(v) => update("lifting_accessories", v)}
            disabled={locked}
          />
        </div>
        <div style={helperText}>
          Load weight, lift radius and lift height are saved from the range
          chart builder above so they are not entered twice.
        </div>
      </Section>

      <Section title="Setup & site conditions">
        <TextAreaField
          label="Crane configuration"
          value={form.crane_configuration ?? ""}
          onChange={(v) => update("crane_configuration", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Outrigger setup"
          value={form.outrigger_setup ?? ""}
          onChange={(v) => update("outrigger_setup", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Ground conditions"
          value={form.ground_conditions ?? ""}
          onChange={(v) => update("ground_conditions", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Exclusion zone details"
          value={form.exclusion_zone_details ?? ""}
          onChange={(v) => update("exclusion_zone_details", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Weather limitations"
          value={form.weather_limitations ?? ""}
          onChange={(v) => update("weather_limitations", v)}
          disabled={locked}
        />
      </Section>

      <Section title="RAMS wording">
        <TextAreaField
          label="Method statement"
          value={form.method_statement ?? ""}
          onChange={(v) => update("method_statement", v)}
          disabled={locked}
          rows={6}
        />
        <TextAreaField
          label="Risk assessment"
          value={form.risk_assessment ?? ""}
          onChange={(v) => update("risk_assessment", v)}
          disabled={locked}
          rows={6}
        />
        <TextAreaField
          label="Site hazards"
          value={form.site_hazards ?? ""}
          onChange={(v) => update("site_hazards", v)}
          disabled={locked}
          rows={4}
        />
        <TextAreaField
          label="Control measures"
          value={form.control_measures ?? ""}
          onChange={(v) => update("control_measures", v)}
          disabled={locked}
          rows={4}
        />
        <TextAreaField
          label="PPE required"
          value={form.ppe_required ?? ""}
          onChange={(v) => update("ppe_required", v)}
          disabled={locked}
          rows={3}
        />
        <TextAreaField
          label="Emergency procedures"
          value={form.emergency_procedures ?? ""}
          onChange={(v) => update("emergency_procedures", v)}
          disabled={locked}
          rows={4}
        />
      </Section>

      <Section title="Personnel & approval">
        <div style={grid2}>
          <SelectField
            label="Lift supervisor"
            value={form.lift_supervisor ?? ""}
            onChange={(v) => update("lift_supervisor", v)}
            disabled={locked}
            options={personnelSelectOptions}
          />
          <Field
            label="Appointed person"
            value={form.appointed_person ?? ""}
            onChange={(v) => update("appointed_person", v)}
            disabled={locked}
          />
          <SelectField
            label="Crane operator"
            value={form.crane_operator ?? ""}
            onChange={(v) => update("crane_operator", v)}
            disabled={locked}
            options={personnelSelectOptions}
          />
          <Field
            label="Approved by"
            value={form.approved_by ?? ""}
            onChange={(v) => update("approved_by", v)}
            disabled={locked}
          />
          <Field
            label="Approved at"
            type="datetime-local"
            value={toInputDateTime(form.approved_at)}
            onChange={(v) =>
              update("approved_at", v ? new Date(v).toISOString() : "")
            }
            disabled={locked}
          />
          <Field
            label="Finalised at"
            type="datetime-local"
            value={toInputDateTime(form.finalised_at)}
            onChange={(v) =>
              update("finalised_at", v ? new Date(v).toISOString() : "")
            }
            disabled={locked}
          />
        </div>
        <TextAreaField
          label="Approval notes"
          value={form.approval_notes ?? ""}
          onChange={(v) => update("approval_notes", v)}
          disabled={locked}
          rows={3}
        />
        <div style={grid2}>
          <Field
            label="Customer signed by"
            value={form.customer_signed_by ?? ""}
            onChange={(v) => update("customer_signed_by", v)}
            disabled={locked}
          />
          <Field
            label="Operator signed by"
            value={form.operator_signed_by ?? ""}
            onChange={(v) => update("operator_signed_by", v)}
            disabled={locked}
          />
          <Field
            label="Office signed by"
            value={form.office_signed_by ?? ""}
            onChange={(v) => update("office_signed_by", v)}
            disabled={locked}
          />
        </div>
        <div style={tickRow}>
          <label style={tickLabel}>
            <input
              type="checkbox"
              checked={!!form.rams_complete}
              onChange={(e) => update("rams_complete", e.target.checked)}
              disabled={locked}
            />{" "}
            RAMS complete
          </label>
          <label style={tickLabel}>
            <input
              type="checkbox"
              checked={!!form.lift_plan_complete}
              onChange={(e) => update("lift_plan_complete", e.target.checked)}
              disabled={locked}
            />{" "}
            Lift plan complete
          </label>
          <button
            type="button"
            onClick={approveNow}
            disabled={locked || saving || generating}
            style={secondaryBtn}
          >
            Mark approved now
          </button>
        </div>
      </Section>
    </div>
  );
}

function EquipmentProfileCard({ profile }: { profile: EquipmentProfile }) {
  return (
    <div style={profileCard}>
      <div style={sectionTitle}>Selected equipment profile</div>
      <div style={profileTitle}>{profile.title}</div>
      <div style={profileSummary}>{profile.summary}</div>
      <div style={grid2}>
        <ReadOnlyFact label="Machine type" value={profile.machineType} />
        <ReadOnlyFact
          label="Max capacity"
          value={
            profile.maxCapacityKg
              ? `${profile.maxCapacityKg.toLocaleString()} kg`
              : profile.maxCapacityTonnes
                ? `${profile.maxCapacityTonnes} t`
                : "—"
          }
        />
        <ReadOnlyFact
          label="Boom / hydraulic outreach"
          value={
            profile.maxBoomLengthM
              ? `${profile.maxBoomLengthM} m`
              : profile.maxHydraulicOutreachM
                ? `${profile.maxHydraulicOutreachM} m`
                : "—"
          }
        />
        <ReadOnlyFact
          label="Jib / max outreach"
          value={
            profile.maxJibOutreachM
              ? `${profile.maxJibOutreachM} m`
              : profile.maxRadiusM
                ? `${profile.maxRadiusM} m radius`
                : "—"
          }
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={fieldLabel}>Key warnings</div>
        <ul style={warningList}>
          {profile.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ReadOnlyFact({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryItem}>
      <div style={fieldLabel}>{label}</div>
      <div style={{ marginTop: 6, fontWeight: 800 }}>{value}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={sectionStyle}>
      <div style={sectionTitle}>{title}</div>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  disabled,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{label}</span>
      <input
        type={type}
        step={step}
        value={value as any}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={inputStyle}
      />
    </label>
  );
}
function SelectField({
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function TextAreaField({
  label,
  value,
  onChange,
  disabled,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        style={textAreaStyle}
      />
    </label>
  );
}

const wrapStyle: CSSProperties = { display: "grid", gap: 16 };
const topRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};
const buttonRow: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const helperText: CSSProperties = { marginTop: 6, fontSize: 13, opacity: 0.75 };
const sectionStyle: CSSProperties = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 16,
};
const profileCard: CSSProperties = {
  ...sectionStyle,
  background: "rgba(255,248,225,0.8)",
};
const profileTitle: CSSProperties = { fontSize: 18, fontWeight: 900 };
const profileSummary: CSSProperties = { marginTop: 6, opacity: 0.82 };
const sectionTitle: CSSProperties = { fontWeight: 900, marginBottom: 12 };
const grid2: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};
const fieldWrap: CSSProperties = { display: "grid", gap: 6 };
const fieldLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  opacity: 0.82,
};
const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 42,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.14)",
  padding: "0 12px",
  fontSize: 14,
  boxSizing: "border-box",
  background: "#fff",
};
const textAreaStyle: CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.14)",
  padding: 12,
  fontSize: 14,
  boxSizing: "border-box",
  background: "#fff",
  resize: "vertical",
};
const versionBox: CSSProperties = {
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 14,
  padding: 14,
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  marginBottom: 14,
};
const versionActions: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};
const versionSelect: CSSProperties = {
  minWidth: 260,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.18)",
  background: "#fff",
  fontWeight: 800,
};

const msgBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.08)",
  border: "1px solid rgba(0,120,255,0.18)",
};
const lockedBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.10)",
  border: "1px solid rgba(180,0,0,0.18)",
  fontWeight: 800,
};
const tickRow: CSSProperties = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "center",
};
const tickLabel: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 700,
};
const warningList: CSSProperties = {
  margin: "8px 0 0 18px",
  padding: 0,
  display: "grid",
  gap: 6,
};
const summaryItem: CSSProperties = {
  background: "rgba(255,255,255,0.8)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 12,
};
const infoBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.08)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontSize: 14,
  lineHeight: 1.45,
};
const primaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};
const secondaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)",
  textDecoration: "none",
  background: "rgba(255,255,255,0.86)",
  color: "#111",
  fontWeight: 900,
  cursor: "pointer",
};
const dangerBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  textDecoration: "none",
  background: "#8a1f1f",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};
const warningBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  textDecoration: "none",
  background: "#c77d00",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};
const smallDangerBtn: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "none",
  background: "#8a1f1f",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};
const multiCraneCard: CSSProperties = {
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 14,
  padding: 14,
  background: "rgba(255,255,255,0.78)",
  display: "grid",
  gap: 12,
};
const multiCraneHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};
const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};
const capacityWarningBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(220,0,0,0.10)",
  border: "1px solid rgba(220,0,0,0.25)",
  fontWeight: 900,
};
