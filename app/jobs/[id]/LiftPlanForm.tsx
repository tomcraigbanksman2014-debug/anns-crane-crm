"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import type { CraneSetupOption, EquipmentProfile } from "../../lib/ai/equipmentProfiles";

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
};

function hasDraftValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  return true;
}

function mergeGeneratedDraft<T extends Record<string, any>>(prev: T, draft: Partial<T> | null | undefined, preserveKeys: string[]) {
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
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
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

function formatMetres(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m`;
}

function setupBoomLengthText(setup: CraneSetupOption) {
  return setup.boomLengthM ? `${formatMetres(setup.boomLengthM)} boom` : "";
}

function setupOutreachText(setup: CraneSetupOption) {
  if (setup.hydraulicOutreachM && setup.maxRadiusM && setup.hydraulicOutreachM !== setup.maxRadiusM) {
    return `${formatMetres(setup.hydraulicOutreachM)} hydraulic outreach / ${formatMetres(setup.maxRadiusM)} radius`;
  }
  if (setup.hydraulicOutreachM) return `${formatMetres(setup.hydraulicOutreachM)} hydraulic outreach`;
  if (setup.maxRadiusM) return `${formatMetres(setup.maxRadiusM)} radius`;
  if (setup.boomLengthM) return `${formatMetres(setup.boomLengthM)} boom`;
  return "";
}

function setupJibText(setup: CraneSetupOption) {
  if (setup.jibOutreachM) return `${formatMetres(setup.jibOutreachM)} jib / max outreach`;
  if (setup.maxRadiusM) return `${formatMetres(setup.maxRadiusM)} max radius`;
  return "";
}

function setupLoadChartNote(setup: CraneSetupOption) {
  return (
    setup.chartNote ||
    [
      setup.sourceDocumentTitle ? `Source: ${setup.sourceDocumentTitle}.` : null,
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
  { value: "1.2x2.4", label: "1.2m x 2.4m mat (2.88 m²)", lengthM: 1.2, widthM: 2.4 },
  { value: "1.5x3", label: "1.5m x 3m mat (4.50 m²)", lengthM: 1.5, widthM: 3 },
  { value: "2x3", label: "2m x 3m mat (6.00 m²)", lengthM: 2, widthM: 3 },
  { value: "custom", label: "Custom mat / spreader size", lengthM: null, widthM: null },
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
  const text = String(value ?? "").trim().toLowerCase();
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
        profile.maxHydraulicOutreachM ? `${profile.maxHydraulicOutreachM} m outreach` : profile.maxRadiusM ? `${profile.maxRadiusM} m radius` : null,
        profile.maxJibOutreachM ? `${profile.maxJibOutreachM} m jib / max outreach` : null,
      ]
        .filter(Boolean)
        .join(" – "),
      boomConfiguration: profile.maxJibOutreachM ? "Main boom + jib / fly jib" : "Main boom",
      boomLengthM: profile.maxBoomLengthM ?? null,
      hydraulicOutreachM: profile.maxHydraulicOutreachM ?? profile.maxRadiusM ?? profile.maxBoomLengthM ?? null,
      jibOutreachM: profile.maxJibOutreachM ?? null,
      maxRadiusM: profile.maxRadiusM ?? profile.maxHydraulicOutreachM ?? null,
      maxTipHeightM: profile.maxTipHeightM ?? null,
      sourceDocumentTitle: profile.sourceLabel,
      sourceLabel: profile.sourceLabel,
      chartNote: "Selected from the current crane profile. Verify the exact manufacturer/supplier chart before approval.",
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
}: {
  jobId: string;
  initial: LiftPlanData | null;
  equipmentProfile?: EquipmentProfile | null;
  craneOptions: CraneOption[];
  personnelOptions?: PersonOption[];
  craneSetupOptions?: CraneSetupOption[];
  craneSetupOptionsByAllocation?: Record<string, CraneSetupOption[]>;
}) {
  const initialPackSections = (initial?.pack_sections ?? {}) as Record<string, string | null>;

  const [form, setForm] = useState<LiftPlanData>(() => tidyLiftPlanTextFields({
    selected_job_equipment_id: initial?.selected_job_equipment_id ?? craneOptions[0]?.value ?? "",
    selected_crane_id: initial?.selected_crane_id ?? craneOptions[0]?.craneId ?? "",
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
    selected_crane_setup_key: initialPackSections.selected_crane_setup_key ?? "",
    selected_crane_setup_label: initialPackSections.selected_crane_setup_label ?? "",
    boom_configuration: initialPackSections.boom_configuration ?? "",
    boom_length: initialPackSections.boom_length ?? "",
    crane_outreach_reference: initialPackSections.crane_outreach_reference ?? "",
    crane_jib_reference: initialPackSections.crane_jib_reference ?? "",
    crane_details: initialPackSections.crane_details ?? "",
    configuration_outrigger_note: initialPackSections.configuration_outrigger_note ?? "",
    load_chart_note: initialPackSections.load_chart_note ?? "",
    ground_bearing_mat_preset: initialPackSections.ground_bearing_mat_preset ?? "",
    ground_bearing_mat_length_m: initialPackSections.ground_bearing_mat_length_m ?? "",
    ground_bearing_mat_width_m: initialPackSections.ground_bearing_mat_width_m ?? "",
    ground_bearing_mat_area_m2: initialPackSections.ground_bearing_mat_area_m2 ?? "",
    ground_bearing_bearing_load: initialPackSections.ground_bearing_bearing_load ?? "",
    ground_bearing_pressure: initialPackSections.ground_bearing_pressure ?? "",
    ground_bearing_notes: initialPackSections.ground_bearing_notes ?? "",
    custom_crane_boom_length_m: initialPackSections.custom_crane_boom_length_m ?? "",
    custom_crane_hydraulic_outreach_m: initialPackSections.custom_crane_hydraulic_outreach_m ?? "",
    custom_crane_jib_outreach_m: initialPackSections.custom_crane_jib_outreach_m ?? "",
    custom_crane_max_radius_m: initialPackSections.custom_crane_max_radius_m ?? "",
  }));

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [msg, setMsg] = useState("");
  const locked = !!form.paperwork_locked;

  const selectedCraneLabel = useMemo(() => {
    const selected = craneOptions.find((option) => option.value === form.selected_job_equipment_id);
    return selected?.label || "No crane selected";
  }, [craneOptions, form.selected_job_equipment_id]);

  const availableCraneSetupOptions = useMemo(() => {
    const allocationKey = String(form.selected_job_equipment_id ?? "").trim();
    const allocationSpecific = allocationKey ? craneSetupOptionsByAllocation?.[allocationKey] ?? [] : [];
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
  }, [craneSetupOptions, craneSetupOptionsByAllocation, equipmentProfile, form.selected_job_equipment_id]);

  const selectedSetup = useMemo(() => {
    const selectedKey = String(form.selected_crane_setup_key ?? "").trim();
    return availableCraneSetupOptions.find((option) => option.key === selectedKey) ?? null;
  }, [availableCraneSetupOptions, form.selected_crane_setup_key]);

  const matAreaM2 = numberOrNull(form.ground_bearing_mat_area_m2) ?? calcMatArea(form.ground_bearing_mat_length_m, form.ground_bearing_mat_width_m);
  const matBearingLoadKg = parseWeightToKg(form.ground_bearing_bearing_load);
  const matPressureText = formatPressure(matBearingLoadKg, matAreaM2);

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
    const selected = craneOptions.find((option) => option.value === allocationId) ?? null;
    setForm((prev) => {
      const changed = String(prev.selected_job_equipment_id ?? "") !== String(allocationId ?? "");
      const base = changed ? clearMachineNarrativeFields(prev) : { ...prev };
      const shouldClearSupervisor = changed && (!hasDraftValue(prev.lift_supervisor) || String(prev.lift_supervisor ?? "").trim() === String(prev.crane_operator ?? "").trim());
      return {
        ...base,
        lift_supervisor: shouldClearSupervisor ? "" : prev.lift_supervisor,
        selected_job_equipment_id: allocationId || "",
        selected_crane_id: selected?.craneId || "",
        selected_crane_setup_key: changed ? "" : prev.selected_crane_setup_key,
        selected_crane_setup_label: changed ? "" : prev.selected_crane_setup_label,
      };
    });
    if (String(form.selected_job_equipment_id ?? "") !== String(allocationId ?? "")) {
      setMsg("Selected crane changed. Select the crane setup/chart, then generate the AI draft if you need wording rebuilt.");
    }
  }

  function applyCraneSetup(setupKey: string) {
    if (locked) return;
    const setup = availableCraneSetupOptions.find((option) => option.key === setupKey) ?? null;

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

      const boomConfiguration = setup.boomConfiguration || setup.label || "Selected crane setup";
      const boomLengthText = setupBoomLengthText(setup);
      const outreachText = setupOutreachText(setup);
      const jibText = setupJibText(setup);
      const chartNote = setupLoadChartNote(setup);
      const configurationNote = [setup.configurationNote || boomConfiguration, setup.outriggerNote].filter(Boolean).join("\n\n");

      return {
        ...prev,
        selected_crane_setup_key: setup.key,
        selected_crane_setup_label: setup.label,
        boom_configuration: boomConfiguration,
        boom_length: boomLengthText,
        crane_outreach_reference: outreachText,
        crane_jib_reference: jibText,
        crane_details: [equipmentProfile?.summary, `Selected setup: ${setup.label}`].filter(Boolean).join("\n"),
        configuration_outrigger_note: configurationNote,
        load_chart_note: chartNote,
        crane_configuration: prev.crane_configuration || boomConfiguration,
        outrigger_setup: prev.outrigger_setup || setup.outriggerNote || "Confirm outrigger setup and mats/spreaders against selected chart.",
        custom_crane_boom_length_m: setup.boomLengthM ? String(setup.boomLengthM) : "",
        custom_crane_hydraulic_outreach_m: setup.hydraulicOutreachM ? String(setup.hydraulicOutreachM) : "",
        custom_crane_jib_outreach_m: setup.jibOutreachM ? String(setup.jibOutreachM) : "",
        custom_crane_max_radius_m: setup.maxRadiusM ? String(setup.maxRadiusM) : "",
      };
    });
    setMsg("Crane setup selected. Save draft to pull boom/outreach and jib/max outreach through into the lift plan pack.");
  }

  function updateMatPreset(preset: string) {
    if (locked) return;
    const option = MAT_OPTIONS.find((item) => item.value === preset) ?? null;
    const lengthM = option?.lengthM ? String(option.lengthM) : preset === "custom" ? form.ground_bearing_mat_length_m ?? "" : "";
    const widthM = option?.widthM ? String(option.widthM) : preset === "custom" ? form.ground_bearing_mat_width_m ?? "" : "";
    const area = calcMatArea(lengthM, widthM);
    setForm((prev) => ({
      ...prev,
      ground_bearing_mat_preset: preset,
      ground_bearing_mat_length_m: lengthM,
      ground_bearing_mat_width_m: widthM,
      ground_bearing_mat_area_m2: area ? String(area) : "",
      ground_bearing_notes: prev.ground_bearing_notes || "Ground bearing pressure calculation: bearing load / outrigger reaction divided by selected mat area in m². Final ground bearing and outrigger reactions must be verified against the actual crane chart and ground conditions.",
    }));
  }

  function updateMatDimension(key: "ground_bearing_mat_length_m" | "ground_bearing_mat_width_m", value: string) {
    if (locked) return;
    setForm((prev) => {
      const next = { ...prev, [key]: value, ground_bearing_mat_preset: prev.ground_bearing_mat_preset || "custom" };
      const area = calcMatArea(next.ground_bearing_mat_length_m, next.ground_bearing_mat_width_m);
      return { ...next, ground_bearing_mat_area_m2: area ? String(area) : "" };
    });
  }

  async function postForm(payload: LiftPlanData) {
    const cleanedPayload = tidyLiftPlanTextFields(payload);
    const area = numberOrNull(cleanedPayload.ground_bearing_mat_area_m2) ?? calcMatArea(cleanedPayload.ground_bearing_mat_length_m, cleanedPayload.ground_bearing_mat_width_m);
    const pressure = formatPressure(parseWeightToKg(cleanedPayload.ground_bearing_bearing_load), area);
    const payloadWithCalculatedSections: LiftPlanData = {
      ...cleanedPayload,
      ground_bearing_mat_area_m2: area ? String(area) : cleanedPayload.ground_bearing_mat_area_m2 ?? "",
      ground_bearing_pressure: pressure !== "—" ? pressure : cleanedPayload.ground_bearing_pressure ?? "",
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
      const res = await fetch(`/api/jobs/${jobId}/lift-plan/generate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not generate draft.");

      const mergedBase = mergeGeneratedDraft(
        form,
        data?.draft,
        [
          "load_description",
          "load_weight",
          "lift_radius",
          "lift_height",
          "sling_type",
          "lifting_accessories",
          "appointed_person",
        ]
      );

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
      setMsg(`AI draft generated and saved (${data?.provider === "openai" ? "AI" : "fallback"}). Review and edit before finalising.`);
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
    const now = new Date().toISOString();
    setForm((prev) => ({ ...prev, approved_at: now, rams_complete: true, lift_plan_complete: true }));
  }

  async function finaliseNow() {
    if (locked) return;
    setSaving(true);
    setMsg("");
    try {
      const finalPayload: LiftPlanData = { ...form, finalised_at: new Date().toISOString(), paperwork_locked: true };
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
      const res = await fetch(`/api/jobs/${jobId}/lift-plan/unlock`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not unlock paperwork.");

      setForm((prev) => ({
        ...prev,
        paperwork_locked: false,
        finalised_at: "",
      }));

      setMsg("Paperwork unlocked. Make your changes and finalise it again when ready.");
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
          <div style={helperText}>Generate a draft, review it, then save and finalise manually.</div>
        </div>
        <div style={buttonRow}>
          <a href={`/jobs/${jobId}/lift-plan/print`} target="_blank" style={secondaryBtn}>Printable version</a>
          {locked ? (
            <button type="button" onClick={unlockNow} disabled={unlocking || generating || saving} style={warningBtn}>
              {unlocking ? "Unlocking…" : "Unlock for edits"}
            </button>
          ) : null}
          <button type="button" onClick={generateDraft} disabled={locked || generating || saving || unlocking} style={secondaryBtn}>{generating ? "Generating…" : "Generate AI draft"}</button>
          <button type="button" onClick={save} disabled={locked || generating || saving || unlocking} style={primaryBtn}>{saving ? "Saving…" : "Save draft"}</button>
          <button type="button" onClick={finaliseNow} disabled={locked || generating || saving || unlocking} style={dangerBtn}>Finalise & lock</button>
        </div>
      </div>

      <div style={infoBox}>
        Crane selection, crane setup/profile, load weight, lift radius, lift height, mat size, bearing load and bearing pressure are now controlled in the <strong>Range chart / lift sketch builder</strong> above. Use the sections below for wording, RAMS and approvals only.
      </div>
      {locked ? <div style={lockedBox}>Paperwork is locked. Use <strong>Unlock for edits</strong> to reopen it, then finalise it again when you are done.</div> : null}
      {msg ? <div style={msgBox}>{msg}</div> : null}

      <Section title="Lift details / accessories">
        <div style={grid2}>
          <Field label="Load description" value={form.load_description ?? ""} onChange={(v) => update("load_description", v)} disabled={locked} />
          <Field label="Sling type" value={form.sling_type ?? ""} onChange={(v) => update("sling_type", v)} disabled={locked} />
          <Field label="Lifting accessories" value={form.lifting_accessories ?? ""} onChange={(v) => update("lifting_accessories", v)} disabled={locked} />
        </div>
        <div style={helperText}>Load weight, lift radius and lift height are saved from the range chart builder above so they are not entered twice.</div>
      </Section>

      <Section title="Setup & site conditions">
        <TextAreaField label="Crane configuration" value={form.crane_configuration ?? ""} onChange={(v) => update("crane_configuration", v)} disabled={locked} />
        <TextAreaField label="Outrigger setup" value={form.outrigger_setup ?? ""} onChange={(v) => update("outrigger_setup", v)} disabled={locked} />
        <TextAreaField label="Ground conditions" value={form.ground_conditions ?? ""} onChange={(v) => update("ground_conditions", v)} disabled={locked} />
        <TextAreaField label="Exclusion zone details" value={form.exclusion_zone_details ?? ""} onChange={(v) => update("exclusion_zone_details", v)} disabled={locked} />
        <TextAreaField label="Weather limitations" value={form.weather_limitations ?? ""} onChange={(v) => update("weather_limitations", v)} disabled={locked} />
      </Section>

      <Section title="RAMS wording">
        <TextAreaField label="Method statement" value={form.method_statement ?? ""} onChange={(v) => update("method_statement", v)} disabled={locked} rows={6} />
        <TextAreaField label="Risk assessment" value={form.risk_assessment ?? ""} onChange={(v) => update("risk_assessment", v)} disabled={locked} rows={6} />
        <TextAreaField label="Site hazards" value={form.site_hazards ?? ""} onChange={(v) => update("site_hazards", v)} disabled={locked} rows={4} />
        <TextAreaField label="Control measures" value={form.control_measures ?? ""} onChange={(v) => update("control_measures", v)} disabled={locked} rows={4} />
        <TextAreaField label="PPE required" value={form.ppe_required ?? ""} onChange={(v) => update("ppe_required", v)} disabled={locked} rows={3} />
        <TextAreaField label="Emergency procedures" value={form.emergency_procedures ?? ""} onChange={(v) => update("emergency_procedures", v)} disabled={locked} rows={4} />
      </Section>

      <Section title="Personnel & approval">
        <div style={grid2}>
          <SelectField label="Lift supervisor" value={form.lift_supervisor ?? ""} onChange={(v) => update("lift_supervisor", v)} disabled={locked} options={personnelSelectOptions} />
          <Field label="Appointed person" value={form.appointed_person ?? ""} onChange={(v) => update("appointed_person", v)} disabled={locked} />
          <SelectField label="Crane operator" value={form.crane_operator ?? ""} onChange={(v) => update("crane_operator", v)} disabled={locked} options={personnelSelectOptions} />
          <Field label="Approved by" value={form.approved_by ?? ""} onChange={(v) => update("approved_by", v)} disabled={locked} />
          <Field label="Approved at" type="datetime-local" value={toInputDateTime(form.approved_at)} onChange={(v) => update("approved_at", v ? new Date(v).toISOString() : "")} disabled={locked} />
          <Field label="Finalised at" type="datetime-local" value={toInputDateTime(form.finalised_at)} onChange={(v) => update("finalised_at", v ? new Date(v).toISOString() : "")} disabled={locked} />
        </div>
        <TextAreaField label="Approval notes" value={form.approval_notes ?? ""} onChange={(v) => update("approval_notes", v)} disabled={locked} rows={3} />
        <div style={grid2}>
          <Field label="Customer signed by" value={form.customer_signed_by ?? ""} onChange={(v) => update("customer_signed_by", v)} disabled={locked} />
          <Field label="Operator signed by" value={form.operator_signed_by ?? ""} onChange={(v) => update("operator_signed_by", v)} disabled={locked} />
          <Field label="Office signed by" value={form.office_signed_by ?? ""} onChange={(v) => update("office_signed_by", v)} disabled={locked} />
        </div>
        <div style={tickRow}>
          <label style={tickLabel}><input type="checkbox" checked={!!form.rams_complete} onChange={(e) => update("rams_complete", e.target.checked)} disabled={locked} /> RAMS complete</label>
          <label style={tickLabel}><input type="checkbox" checked={!!form.lift_plan_complete} onChange={(e) => update("lift_plan_complete", e.target.checked)} disabled={locked} /> Lift plan complete</label>
          <button type="button" onClick={approveNow} disabled={locked || saving || generating} style={secondaryBtn}>Mark approved now</button>
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
        <ReadOnlyFact label="Max capacity" value={profile.maxCapacityKg ? `${profile.maxCapacityKg.toLocaleString()} kg` : profile.maxCapacityTonnes ? `${profile.maxCapacityTonnes} t` : "—"} />
        <ReadOnlyFact label="Boom / hydraulic outreach" value={profile.maxBoomLengthM ? `${profile.maxBoomLengthM} m` : profile.maxHydraulicOutreachM ? `${profile.maxHydraulicOutreachM} m` : "—"} />
        <ReadOnlyFact label="Jib / max outreach" value={profile.maxJibOutreachM ? `${profile.maxJibOutreachM} m` : profile.maxRadiusM ? `${profile.maxRadiusM} m radius` : "—"} />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={fieldLabel}>Key warnings</div>
        <ul style={warningList}>{profile.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      </div>
    </div>
  );
}

function ReadOnlyFact({ label, value }: { label: string; value: string }) { return <div style={summaryItem}><div style={fieldLabel}>{label}</div><div style={{ marginTop: 6, fontWeight: 800 }}>{value}</div></div>; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <div style={sectionStyle}><div style={sectionTitle}>{title}</div><div style={{ display: "grid", gap: 12 }}>{children}</div></div>; }
function Field({ label, value, onChange, type = "text", step, disabled }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; step?: string; disabled?: boolean; }) { return <label style={fieldWrap}><span style={fieldLabel}>{label}</span><input type={type} step={step} value={value as any} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={inputStyle} /></label>; }
function SelectField({ label, value, onChange, disabled, options }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; options: Array<{ value: string; label: string }>; }) { return <label style={fieldWrap}><span style={fieldLabel}>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={inputStyle}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function TextAreaField({ label, value, onChange, disabled, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; rows?: number; }) { return <label style={fieldWrap}><span style={fieldLabel}>{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={rows} style={textAreaStyle} /></label>; }

const wrapStyle: CSSProperties = { display: "grid", gap: 16 };
const topRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" };
const buttonRow: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const helperText: CSSProperties = { marginTop: 6, fontSize: 13, opacity: 0.75 };
const sectionStyle: CSSProperties = { background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16 };
const profileCard: CSSProperties = { ...sectionStyle, background: "rgba(255,248,225,0.8)" };
const profileTitle: CSSProperties = { fontSize: 18, fontWeight: 900 };
const profileSummary: CSSProperties = { marginTop: 6, opacity: 0.82 };
const sectionTitle: CSSProperties = { fontWeight: 900, marginBottom: 12 };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 };
const fieldWrap: CSSProperties = { display: "grid", gap: 6 };
const fieldLabel: CSSProperties = { fontSize: 13, fontWeight: 800, opacity: 0.82 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 42, borderRadius: 10, border: "1px solid rgba(0,0,0,0.14)", padding: "0 12px", fontSize: 14, boxSizing: "border-box", background: "#fff" };
const textAreaStyle: CSSProperties = { width: "100%", borderRadius: 10, border: "1px solid rgba(0,0,0,0.14)", padding: 12, fontSize: 14, boxSizing: "border-box", background: "#fff", resize: "vertical" };
const msgBox: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(0,120,255,0.08)", border: "1px solid rgba(0,120,255,0.18)" };
const lockedBox: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(180,0,0,0.10)", border: "1px solid rgba(180,0,0,0.18)", fontWeight: 800 };
const tickRow: CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" };
const tickLabel: CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontWeight: 700 };
const warningList: CSSProperties = { margin: "8px 0 0 18px", padding: 0, display: "grid", gap: 6 };
const summaryItem: CSSProperties = { background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 12 };
const infoBox: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(0,120,255,0.08)", border: "1px solid rgba(0,120,255,0.18)", fontSize: 14, lineHeight: 1.45 };
const primaryBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "none", textDecoration: "none", background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer" };
const secondaryBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.10)", textDecoration: "none", background: "rgba(255,255,255,0.86)", color: "#111", fontWeight: 900, cursor: "pointer" };
const dangerBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "none", textDecoration: "none", background: "#8a1f1f", color: "#fff", fontWeight: 900, cursor: "pointer" };
const warningBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "none", textDecoration: "none", background: "#c77d00", color: "#fff", fontWeight: 900, cursor: "pointer" };
