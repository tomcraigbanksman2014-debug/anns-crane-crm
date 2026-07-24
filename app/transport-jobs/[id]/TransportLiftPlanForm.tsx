"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import type { EquipmentProfile } from "../../lib/ai/equipmentProfiles";
import type { TransportLiftPlanContext } from "../../lib/transportLiftPlanDefaults";
import { calculateHiabTechnicalSections } from "../../lib/liftPlanTechnicalValidation";
import LiftArrangementEditor from "../../components/lift-drawing/LiftArrangementEditor";
import type { LiftMachineType, LiftTechnicalSchedule } from "../../components/lift-drawing/types";
import {
  parseLiftDrawingModel,
  serialiseLiftDrawingModel,
  synchroniseLiftDrawingWithSchedule,
} from "../../lib/liftDrawingPersistence";
import {
  liftDrawingApprovalErrors,
  validateLiftDrawing,
} from "../../lib/liftDrawingValidation";
import {
  buildTransportNormalisedTechnicalPlan,
  NORMALISED_TECHNICAL_PLAN_KEY,
} from "../../lib/normalisedLiftTechnicalPlan";

type TransportLiftPlanData = {
  job_summary?: string | null;
  load_description?: string | null;
  load_weight?: number | null;
  lift_radius?: number | null;
  lift_height?: number | null;
  vehicle_configuration?: string | null;
  hiab_configuration?: string | null;
  outrigger_setup?: string | null;
  ground_conditions?: string | null;
  pickup_method?: string | null;
  delivery_method?: string | null;
  route_notes?: string | null;
  access_notes?: string | null;
  exclusion_zone_details?: string | null;
  traffic_management?: string | null;
  load_securing_method?: string | null;
  lifting_accessories?: string | null;
  site_hazards?: string | null;
  control_measures?: string | null;
  ppe_required?: string | null;
  weather_limitations?: string | null;
  emergency_procedures?: string | null;
  method_statement?: string | null;
  risk_assessment?: string | null;
  appointed_person?: string | null;
  lift_supervisor?: string | null;
  operator_name?: string | null;
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
  pack_sections?: Record<string, unknown> | null;
};

type LiftEquipmentOption = {
  id: string;
  label: string;
  type: string;
  capacity: string;
  notes: string;
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

function toInputDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const SUPPORT_POSITION_OPTIONS = [
  ["", "Select the actual support position…"],
  ["full", "Full manufacturer-rated stabiliser deployment"],
  ["variable-verified", "Variable / HPSC position verified on the machine"],
  ["restricted-verified", "Restricted or asymmetric position with separate verified duty"],
] as const;

const WORKING_SECTOR_OPTIONS = [
  ["", "Select the permitted working sector…", -15, 105],
  ["nearside", "Nearside working sector", 75, 285],
  ["offside", "Offside working sector", -105, 105],
  ["rear", "Rear working sector", -45, 45],
  ["full-verified", "Full slew only where the rated-control system permits", -179, 179],
] as const;

const MAT_OPTIONS = [
  ["", "Select the actual mat / spreader size…", null, null],
  ["1x3", "1.0 m × 3.0 m (3.00 m²)", 1, 3],
  ["1x2", "1.0 m × 2.0 m (2.00 m²)", 1, 2],
  ["1.2x2.4", "1.2 m × 2.4 m (2.88 m²)", 1.2, 2.4],
  ["1.5x3", "1.5 m × 3.0 m (4.50 m²)", 1.5, 3],
  ["2x3", "2.0 m × 3.0 m (6.00 m²)", 2, 3],
  ["custom", "Custom verified mat / spreader size", null, null],
] as const;

const ACCESSORY_OPTIONS = [
  ["", "Select the planned lifting arrangement…"],
  ["chains", "Certified chain slings and shackles"],
  ["web-slings", "Certified web slings and shackles"],
  ["round-slings", "Certified round slings and shackles"],
  ["lifting-beam", "Certified lifting beam with slings and shackles"],
  ["container-lugs", "Certified container lifting lugs / shoes and chains"],
  ["custom", "Other AP-specified arrangement"],
] as const;

const GROUND_OPTIONS = [
  ["", "Select the verified ground condition…"],
  ["reinforced-concrete", "Reinforced concrete slab / verified hardstanding"],
  ["asphalt", "Sound asphalt hardstanding over suitable formation"],
  ["compacted-stone", "Compacted stone / granular formation"],
  ["made-ground", "Made ground — bearing capacity requires confirmation"],
  ["soft-ground", "Soft / variable ground — engineered support required"],
  ["other-verified", "Other condition verified by the appointed person"],
] as const;

const ACCESSORY_TEXT: Record<string, string> = {
  chains: "Certified chain slings and shackles selected for the load, lifting points, angles and gross suspended weight.",
  "web-slings": "Certified web slings and shackles selected for the load, lifting points, angles and gross suspended weight, with edge protection where required.",
  "round-slings": "Certified round slings and shackles selected for the load, lifting points, angles and gross suspended weight, with edge protection where required.",
  "lifting-beam": "Certified lifting beam, slings and shackles selected for the load geometry, lifting points and gross suspended weight.",
  "container-lugs": "Certified container lifting lugs / shoes, chains and shackles selected for the unit and gross suspended weight.",
};

function derivedBoomGeometry(radiusValue: unknown, heightValue: unknown) {
  const radiusM = Number(radiusValue) || 0;
  const hookHeightM = Number(heightValue) || 0;
  if (radiusM <= 0 || hookHeightM <= 0) return { boomLengthM: null, boomAngleDeg: null };
  return {
    boomLengthM: Number(Math.hypot(radiusM, hookHeightM).toFixed(2)),
    boomAngleDeg: Number((Math.atan2(hookHeightM, radiusM) * 180 / Math.PI).toFixed(1)),
  };
}

export default function TransportLiftPlanForm({
  transportJobId,
  initial,
  equipmentProfile,
  context,
  defaults,
  personnelOptions,
  liftEquipmentOptions,
}: {
  transportJobId: string;
  initial: TransportLiftPlanData | null;
  equipmentProfile?: EquipmentProfile | null;
  context: TransportLiftPlanContext;
  defaults: Partial<TransportLiftPlanData>;
  personnelOptions: string[];
  liftEquipmentOptions: LiftEquipmentOption[];
}) {
  const verifiedSetup = equipmentProfile?.setupOptions?.[0] ?? null;
  const isUploadedSpecProfile = Boolean(equipmentProfile?.id?.startsWith("spec-sheet-"));
  const initialSections = ((initial?.pack_sections as Record<string, unknown> | null) ?? {});

  const [form, setForm] = useState<TransportLiftPlanData>({
    job_summary: initial?.job_summary || defaults.job_summary || "",
    load_description: initial?.load_description || defaults.load_description || "",
    load_weight: initial?.load_weight ?? defaults.load_weight ?? null,
    lift_radius: initial?.lift_radius ?? null,
    lift_height: initial?.lift_height ?? null,
    vehicle_configuration: initial?.vehicle_configuration || defaults.vehicle_configuration || "",
    hiab_configuration: initial?.hiab_configuration || defaults.hiab_configuration || "",
    outrigger_setup: initial?.outrigger_setup || defaults.outrigger_setup || "",
    ground_conditions: initial?.ground_conditions ?? "",
    pickup_method: initial?.pickup_method || defaults.pickup_method || "",
    delivery_method: initial?.delivery_method || defaults.delivery_method || "",
    route_notes: initial?.route_notes || defaults.route_notes || "",
    access_notes: initial?.access_notes || defaults.access_notes || "",
    exclusion_zone_details: initial?.exclusion_zone_details || defaults.exclusion_zone_details || "",
    traffic_management: initial?.traffic_management || defaults.traffic_management || "",
    load_securing_method: initial?.load_securing_method || defaults.load_securing_method || "",
    lifting_accessories: initial?.lifting_accessories ?? "",
    site_hazards: initial?.site_hazards ?? "",
    control_measures: initial?.control_measures ?? "",
    ppe_required: initial?.ppe_required || defaults.ppe_required || "",
    weather_limitations: initial?.weather_limitations || defaults.weather_limitations || "",
    emergency_procedures: initial?.emergency_procedures || defaults.emergency_procedures || "",
    method_statement: initial?.method_statement ?? "",
    risk_assessment: initial?.risk_assessment ?? "",
    appointed_person: initial?.appointed_person || defaults.appointed_person || "Shaun Robinson",
    lift_supervisor: initial?.lift_supervisor ?? "",
    operator_name: initial?.operator_name || defaults.operator_name || "",
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
    pack_sections: {
      ...initialSections,
      hiab_profile_id: initialSections.hiab_profile_id ?? equipmentProfile?.id ?? null,
      hiab_profile_title: initialSections.hiab_profile_title ?? equipmentProfile?.title ?? null,
      hiab_verified_configuration: initialSections.hiab_verified_configuration ?? verifiedSetup?.label ?? equipmentProfile?.title ?? null,
      hiab_chart_source: initialSections.hiab_chart_source ?? verifiedSetup?.sourceLabel ?? equipmentProfile?.sourceLabel ?? null,
      hiab_chart_page: initialSections.hiab_chart_page ?? (verifiedSetup?.sourcePage ? String(verifiedSetup.sourcePage) : null),
      hiab_accessory_weight_kg: initialSections.hiab_accessory_weight_kg ?? "0",
      hiab_accessory_weight_confirmed: initialSections.hiab_accessory_weight_confirmed ?? false,
      hiab_load_length_m: initialSections.hiab_load_length_m ?? context.loadLengthM,
      hiab_load_width_m: initialSections.hiab_load_width_m ?? context.loadWidthM,
      hiab_load_height_m: initialSections.hiab_load_height_m ?? context.loadHeightM,
      hiab_ground_bearing_factor: initialSections.hiab_ground_bearing_factor ?? "0.75",
      hiab_mats_under_loaded_outrigger: initialSections.hiab_mats_under_loaded_outrigger ?? "1",
    },
  });

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [msg, setMsg] = useState("");
  const locked = !!form.paperwork_locked;
  const equipmentMats = useMemo(
    () => liftEquipmentOptions
      .map((item) => ({ ...item, dimensions: equipmentDimensions(item) }))
      .filter((item) => /(mat|spreader|pad)/i.test(`${item.label} ${item.type} ${item.notes}`)),
    [liftEquipmentOptions],
  );
  const equipmentAccessories = useMemo(
    () => liftEquipmentOptions
      .map((item) => ({ ...item, selfWeightKg: equipmentSelfWeightKg(item) }))
      .filter((item) => !/(mat|spreader|pad)/i.test(`${item.label} ${item.type}`)),
    [liftEquipmentOptions],
  );
  const selectedAccessoryIds = useMemo(
    () => stringArray(form.pack_sections?.hiab_accessory_equipment_ids),
    [form.pack_sections?.hiab_accessory_equipment_ids],
  );
  const boomGeometry = useMemo(
    () => derivedBoomGeometry(form.lift_radius, form.lift_height),
    [form.lift_height, form.lift_radius],
  );

  const technical = useMemo(() => calculateHiabTechnicalSections({
    profileId: equipmentProfile?.id ?? null,
    profileTitle: equipmentProfile?.title ?? null,
    setupLabel: verifiedSetup?.label ?? equipmentProfile?.title ?? null,
    sourceLabel: verifiedSetup?.sourceLabel ?? equipmentProfile?.sourceLabel ?? null,
    loadWeightKg: form.load_weight ?? null,
    radiusM: form.lift_radius ?? null,
    sections: form.pack_sections ?? {},
  }), [equipmentProfile, verifiedSetup, form.load_weight, form.lift_radius, form.pack_sections]);

  const machineType: LiftMachineType = /artic|x-hipro|x hipro|858/i.test(
    `${equipmentProfile?.id ?? ""} ${equipmentProfile?.title ?? ""}`,
  )
    ? "hiab-artic"
    : "hiab-rigid";
  const selectedSector = WORKING_SECTOR_OPTIONS.find(
    ([key]) => key === String(form.pack_sections?.hiab_working_sector_code ?? ""),
  ) ?? WORKING_SECTOR_OPTIONS[0];
  const drawingSchedule = useMemo<LiftTechnicalSchedule>(() => ({
    loadDescription: form.load_description,
    loadWeightKg: technical.loadWeightKg,
    accessoryWeightKg: technical.accessoryWeightKg,
    accessoryWeightConfirmed: Boolean(form.pack_sections?.hiab_accessory_weight_confirmed),
    grossLiftedWeightKg: technical.totalLiftedWeightKg,
    loadLengthM: Number(form.pack_sections?.hiab_load_length_m) || null,
    loadWidthM: Number(form.pack_sections?.hiab_load_width_m) || null,
    loadHeightM: Number(form.pack_sections?.hiab_load_height_m) || null,
    radiusM: technical.radiusM,
    boomLengthM: boomGeometry.boomLengthM,
    boomAngleDeg: boomGeometry.boomAngleDeg,
    hookHeightM: form.lift_height,
    chartCapacityKg: technical.capacityKg,
    chartSource: technical.capacitySource,
    chartPage: String(form.pack_sections?.hiab_chart_page ?? verifiedSetup?.sourcePage ?? "").trim(),
    utilisationPercent: technical.utilisationPercent,
    exactConfiguration: technical.selectedSetup,
    stabiliserSetup: String(form.pack_sections?.hiab_stabiliser_position ?? "").trim(),
    workingSector: String(form.pack_sections?.hiab_working_sector ?? "").trim(),
    workingSectorStartDeg: selectedSector[2],
    workingSectorEndDeg: selectedSector[3],
    operatingWeightKg: technical.vehicleOperatingWeightKg,
    groundPressureKgM2: technical.pressureKgM2,
    matLengthM: technical.matLengthM,
    matWidthM: technical.matWidthM,
    liftingAccessories: form.lifting_accessories,
    siteHazards: form.site_hazards,
    controlMeasures: form.control_measures,
  }), [boomGeometry, form, selectedSector, technical, verifiedSetup?.sourcePage]);
  const drawingModel = useMemo(
    () => {
      const base = parseLiftDrawingModel(
        form.pack_sections?.lift_drawing_model_json,
        {
        machineType,
        machineLabel: equipmentProfile?.title ?? "",
        drawingNumber: `HIAB-${transportJobId.slice(0, 8).toUpperCase()}`,
        loadWeightKg: Number(drawingSchedule.loadWeightKg) || 0,
        accessoryWeightKg: Number(drawingSchedule.accessoryWeightKg) || 0,
        accessoryWeightConfirmed: Boolean(drawingSchedule.accessoryWeightConfirmed),
        loadLengthM: Number(drawingSchedule.loadLengthM) || 1,
        loadWidthM: Number(drawingSchedule.loadWidthM) || 1,
        loadHeightM: Number(drawingSchedule.loadHeightM) || 1,
        radiusM: Number(drawingSchedule.radiusM) || 0,
        boomLengthM: Number(drawingSchedule.boomLengthM) || 0,
        boomAngleDeg: Number(drawingSchedule.boomAngleDeg) || 0,
        hookHeightM: Number(drawingSchedule.hookHeightM) || 0,
        exactConfiguration: String(drawingSchedule.exactConfiguration ?? ""),
        chartSource: String(drawingSchedule.chartSource ?? ""),
        chartPage: String(drawingSchedule.chartPage ?? ""),
        chartCapacityKg: Number(drawingSchedule.chartCapacityKg) || 0,
        utilisationPercent: Number(drawingSchedule.utilisationPercent) || 0,
        stabiliserSetup: String(drawingSchedule.stabiliserSetup ?? ""),
        workingSector: String(drawingSchedule.workingSector ?? ""),
        workingSectorStartDeg: Number(drawingSchedule.workingSectorStartDeg),
        workingSectorEndDeg: Number(drawingSchedule.workingSectorEndDeg),
        operatingWeightKg: Number(drawingSchedule.operatingWeightKg) || 0,
        groundPressureKgM2: Number(drawingSchedule.groundPressureKgM2) || 0,
        matLengthM: Number(drawingSchedule.matLengthM) || 1,
        matWidthM: Number(drawingSchedule.matWidthM) || 1,
        liftingAccessories: String(drawingSchedule.liftingAccessories ?? ""),
        siteHazards: String(drawingSchedule.siteHazards ?? ""),
        controlMeasures: String(drawingSchedule.controlMeasures ?? ""),
      },
      );
      return synchroniseLiftDrawingWithSchedule(base, drawingSchedule, {
        machineType,
        machineLabel: equipmentProfile?.title ?? context.vehicleLabel,
      });
    },
    [
      context.vehicleLabel,
      drawingSchedule,
      equipmentProfile?.title,
      form.pack_sections?.lift_drawing_model_json,
      machineType,
      transportJobId,
    ],
  );
  const drawingValidation = useMemo(
    () => validateLiftDrawing(drawingModel, drawingSchedule),
    [drawingModel, drawingSchedule],
  );
  const approvalErrors = useMemo(
    () => Array.from(new Set([
      ...technical.errors,
      ...liftDrawingApprovalErrors(drawingModel, drawingSchedule),
      !form.operator_name ? "Select the HIAB operator." : "",
      !form.lift_supervisor ? "Select the lift supervisor." : "",
      !form.appointed_person ? "Select the appointed person." : "",
      !form.pack_sections?.hiab_accessory_weight_confirmed ? "Confirm the lifting-accessory weight." : "",
      !selectedAccessoryIds.length ? "Select the lifting accessories from the equipment register." : "",
      !form.pack_sections?.hiab_stabiliser_position_code ? "Select the actual stabiliser/support position." : "",
      !form.pack_sections?.hiab_working_sector_code ? "Select the permitted working sector." : "",
      !form.pack_sections?.hiab_mat_equipment_id ? "Select the actual mat/spreader from the equipment register." : "",
      !form.pack_sections?.hiab_ground_condition_code ? "Select the verified ground condition." : "",
      ["variable-verified", "restricted-verified"].includes(String(form.pack_sections?.hiab_stabiliser_position_code ?? ""))
        && !form.pack_sections?.hiab_position_capacity_confirmed
        ? "Confirm the rated-control/chart duty for the selected variable or restricted support position."
        : "",
    ].filter(Boolean))),
    [drawingModel, drawingSchedule, form, selectedAccessoryIds.length, technical.errors],
  );

  function withTechnicalSections(payload: TransportLiftPlanData): TransportLiftPlanData {
    const preparedSections = {
      ...(payload.pack_sections ?? {}),
      hiab_profile_id: equipmentProfile?.id ?? null,
      hiab_profile_title: equipmentProfile?.title ?? null,
      hiab_verified_configuration: verifiedSetup?.label ?? equipmentProfile?.title ?? null,
      hiab_chart_source: verifiedSetup?.sourceLabel ?? equipmentProfile?.sourceLabel ?? null,
      hiab_chart_page: verifiedSetup?.sourcePage ? String(verifiedSetup.sourcePage) : payload.pack_sections?.hiab_chart_page ?? null,
      hiab_boom_length_m: boomGeometry.boomLengthM === null ? null : String(boomGeometry.boomLengthM),
      hiab_boom_angle_deg: boomGeometry.boomAngleDeg === null ? null : String(boomGeometry.boomAngleDeg),
    };
    const calculated = calculateHiabTechnicalSections({
      profileId: equipmentProfile?.id ?? null,
      profileTitle: equipmentProfile?.title ?? null,
      setupLabel: verifiedSetup?.label ?? equipmentProfile?.title ?? null,
      sourceLabel: verifiedSetup?.sourceLabel ?? equipmentProfile?.sourceLabel ?? null,
      loadWeightKg: payload.load_weight ?? null,
      radiusM: payload.lift_radius ?? null,
      sections: preparedSections,
    });
    const synchronisedDrawing = synchroniseLiftDrawingWithSchedule(
      drawingModel,
      {
        ...drawingSchedule,
        loadWeightKg: calculated.loadWeightKg,
        accessoryWeightKg: calculated.accessoryWeightKg,
        grossLiftedWeightKg: calculated.totalLiftedWeightKg,
        chartCapacityKg: calculated.capacityKg,
        chartSource: calculated.capacitySource,
        utilisationPercent: calculated.utilisationPercent,
        exactConfiguration: calculated.selectedSetup,
        operatingWeightKg: calculated.vehicleOperatingWeightKg,
        groundPressureKgM2: calculated.pressureKgM2,
        matLengthM: calculated.matLengthM,
        matWidthM: calculated.matWidthM,
      },
      { machineType, machineLabel: equipmentProfile?.title ?? context.vehicleLabel },
    );
    const calculatedSchedule: LiftTechnicalSchedule = {
      ...drawingSchedule,
      loadWeightKg: calculated.loadWeightKg,
      accessoryWeightKg: calculated.accessoryWeightKg,
      grossLiftedWeightKg: calculated.totalLiftedWeightKg,
      chartCapacityKg: calculated.capacityKg,
      chartSource: calculated.capacitySource,
      utilisationPercent: calculated.utilisationPercent,
      exactConfiguration: calculated.selectedSetup,
      operatingWeightKg: calculated.vehicleOperatingWeightKg,
      groundPressureKgM2: calculated.pressureKgM2,
      matLengthM: calculated.matLengthM,
      matWidthM: calculated.matWidthM,
    };
    const normalisedPlan = buildTransportNormalisedTechnicalPlan({
      transportJobId,
      context,
      form: payload,
      sections: calculated.sections,
      schedule: calculatedSchedule,
      machine: {
        profileId: equipmentProfile?.id,
        title: equipmentProfile?.title ?? context.vehicleLabel,
        manufacturer: equipmentProfile?.manufacturer,
        model: equipmentProfile?.model,
        registration: context.vehicleRegistration,
        hiredIn: isUploadedSpecProfile,
      },
      technical: calculated,
      validationErrors: approvalErrors,
    });
    return {
      ...payload,
      pack_sections: {
        ...calculated.sections,
        [NORMALISED_TECHNICAL_PLAN_KEY]: normalisedPlan,
        lift_drawing_model_json: serialiseLiftDrawingModel(synchronisedDrawing),
      },
    };
  }

  function update(key: keyof TransportLiftPlanData, value: any) {
    if (locked) return;
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateSection(key: string, value: unknown) {
    if (locked) return;
    setForm((prev) => ({
      ...prev,
      pack_sections: { ...(prev.pack_sections ?? {}), [key]: value },
    }));
  }

  function updateSupportPosition(code: string) {
    const label = SUPPORT_POSITION_OPTIONS.find(([key]) => key === code)?.[1] ?? "";
    setForm((prev) => ({
      ...prev,
      outrigger_setup: label || prev.outrigger_setup,
      pack_sections: {
        ...(prev.pack_sections ?? {}),
        hiab_stabiliser_position_code: code,
        hiab_stabiliser_position: label,
      },
    }));
  }

  function updateWorkingSector(code: string) {
    const option = WORKING_SECTOR_OPTIONS.find(([key]) => key === code) ?? WORKING_SECTOR_OPTIONS[0];
    setForm((prev) => ({
      ...prev,
      pack_sections: {
        ...(prev.pack_sections ?? {}),
        hiab_working_sector_code: code,
        hiab_working_sector: option[1],
      },
    }));
  }

  function updateMatPreset(code: string) {
    const option = MAT_OPTIONS.find(([key]) => key === code) ?? MAT_OPTIONS[0];
    setForm((prev) => ({
      ...prev,
      pack_sections: {
        ...(prev.pack_sections ?? {}),
        hiab_mat_preset: code,
        hiab_mat_length_m: option[2] ?? (code === "custom" ? prev.pack_sections?.hiab_mat_length_m ?? "" : ""),
        hiab_mat_width_m: option[3] ?? (code === "custom" ? prev.pack_sections?.hiab_mat_width_m ?? "" : ""),
      },
    }));
  }

  function updateMatEquipment(id: string) {
    const selected = equipmentMats.find((item) => item.id === id);
    const dimensions = selected?.dimensions;
    setForm((prev) => ({
      ...prev,
      pack_sections: {
        ...(prev.pack_sections ?? {}),
        hiab_mat_equipment_id: id || null,
        hiab_mat_equipment_label: selected?.label || null,
        hiab_mat_preset: id ? "equipment-register" : null,
        hiab_mat_length_m: dimensions?.lengthM ?? null,
        hiab_mat_width_m: dimensions?.widthM ?? null,
      },
    }));
  }

  function updateAccessoryEquipment(ids: string[]) {
    const selected = equipmentAccessories.filter((item) => ids.includes(item.id));
    const weights = selected.map((item) => item.selfWeightKg);
    const hasCompleteWeights = selected.length > 0 && weights.every((weight) => weight !== null);
    const totalWeight = hasCompleteWeights
      ? weights.reduce<number>((sum, weight) => sum + Number(weight), 0)
      : null;
    setForm((prev) => ({
      ...prev,
      lifting_accessories: selected.map((item) => item.label).join("; "),
      pack_sections: {
        ...(prev.pack_sections ?? {}),
        hiab_accessory_equipment_ids: ids,
        hiab_accessory_equipment_labels: selected.map((item) => item.label),
        hiab_accessory_method_code: ids.length ? "equipment-register" : null,
        hiab_accessory_weight_kg:
          totalWeight === null
            ? prev.pack_sections?.hiab_accessory_weight_kg ?? ""
            : String(totalWeight),
        hiab_accessory_weight_confirmed: false,
        hiab_accessory_weights_complete: hasCompleteWeights,
      },
    }));
  }

  function updateAccessoryMethod(code: string) {
    setForm((prev) => ({
      ...prev,
      lifting_accessories: ACCESSORY_TEXT[code] ?? (code === "custom" ? prev.lifting_accessories ?? "" : ""),
      pack_sections: {
        ...(prev.pack_sections ?? {}),
        hiab_accessory_method_code: code,
      },
    }));
  }

  function updateGroundCondition(code: string) {
    const label = GROUND_OPTIONS.find(([key]) => key === code)?.[1] ?? "";
    setForm((prev) => ({
      ...prev,
      ground_conditions: label,
      pack_sections: {
        ...(prev.pack_sections ?? {}),
        hiab_ground_condition_code: code,
      },
    }));
  }

  async function postForm(payload: TransportLiftPlanData) {
    const res = await fetch(`/api/transport-jobs/${transportJobId}/lift-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withTechnicalSections(payload)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Error saving transport lift plan.");
    return data;
  }

  async function generateDraft() {
    if (locked) return;
    setGenerating(true);
    setMsg("");
    try {
      const res = await fetch(`/api/transport-jobs/${transportJobId}/lift-plan/generate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not generate draft.");
      setForm((prev) => {
        const merged = mergeGeneratedDraft(prev, data?.draft, ['job_summary', 'load_description', 'load_weight', 'lift_radius', 'lift_height', 'lifting_accessories', 'route_notes', 'access_notes']);
        return {
          ...merged,
          paperwork_locked: prev.paperwork_locked,
          approved_by: prev.approved_by,
          approved_at: prev.approved_at,
          approval_notes: prev.approval_notes,
          customer_signed_by: prev.customer_signed_by,
          operator_signed_by: prev.operator_signed_by,
          office_signed_by: prev.office_signed_by,
          finalised_at: prev.finalised_at,
        };
      });
      setMsg(`AI draft generated (${data?.provider === "openai" ? "AI" : "fallback"}). Review and edit before saving.`);
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
      const calculatedForm = withTechnicalSections(form);
      await postForm(calculatedForm);
      setForm(calculatedForm);
      setMsg("Transport lift plan / RAMS saved.");
    } catch (e: any) {
      setMsg(e?.message || "Error saving transport lift plan.");
    } finally {
      setSaving(false);
    }
  }

  function approveNow() {
    if (locked) return;
    if (approvalErrors.length) {
      setMsg(`Cannot approve yet: ${approvalErrors.join(" ")}`);
      return;
    }
    const now = new Date().toISOString();
    setForm((prev) => ({ ...withTechnicalSections(prev), approved_at: now, rams_complete: true, lift_plan_complete: true }));
  }

  async function finaliseNow() {
    if (locked) return;
    setSaving(true);
    setMsg("");
    try {
      if (approvalErrors.length) {
        throw new Error(`Cannot finalise yet: ${approvalErrors.join(" ")}`);
      }
      const finalPayload: TransportLiftPlanData = withTechnicalSections({ ...form, finalised_at: new Date().toISOString(), paperwork_locked: true });
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
      const res = await fetch(`/api/transport-jobs/${transportJobId}/lift-plan/unlock`, { method: "POST" });
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
          <h2 style={{ margin: 0, fontSize: 24 }}>HIAB Lift Plan & RAMS</h2>
          <div style={helperText}>Generate a draft for HIAB transport work, then review and finalise manually.</div>
        </div>
        <div style={buttonRow}>
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

      {equipmentProfile ? <EquipmentProfileCard profile={equipmentProfile} /> : null}
      {locked ? <div style={lockedBox}>Paperwork is locked. Use <strong>Unlock for edits</strong> to reopen it, then finalise it again when you are done.</div> : null}
      {msg ? <div style={msgBox}>{msg}</div> : null}

      <Section title="Job and verified lift inputs">
        <div style={sourceBanner}>
          <strong>Already populated from the transport job:</strong> customer, collection, delivery, vehicle, registration, trailer, load description, dates and allocated operator. Change the transport job itself if any of those source details are wrong.
        </div>
        <div style={grid2}>
          <ReadOnlyFact label="Job summary" value={form.job_summary || "—"} />
          <ReadOnlyFact label="Load description" value={form.load_description || "—"} />
          <ReadOnlyFact label="Allocated vehicle" value={context.vehicleLabel || "—"} />
          <ReadOnlyFact label="Customer" value={context.clientName || "—"} />
          <Field label="Load weight (kg)" type="number" step="0.01" value={form.load_weight ?? ""} onChange={(v) => update("load_weight", v)} disabled={locked} />
          <Field label="Maximum planned radius (m)" type="number" step="0.01" value={form.lift_radius ?? ""} onChange={(v) => update("lift_radius", v)} disabled={locked} />
          <Field label="Required hook height (m)" type="number" step="0.01" value={form.lift_height ?? ""} onChange={(v) => update("lift_height", v)} disabled={locked} />
          <SelectField label="HIAB operator" value={form.operator_name ?? ""} onChange={(v) => update("operator_name", v)} options={[["", "Select operator…"], ...personnelOptions.map((name) => [name, name] as [string, string])]} disabled={locked} />
          <Field label="Load length (m)" type="number" step="0.01" value={String(form.pack_sections?.hiab_load_length_m ?? "")} onChange={(v) => updateSection("hiab_load_length_m", v)} disabled={locked} />
          <Field label="Load width (m)" type="number" step="0.01" value={String(form.pack_sections?.hiab_load_width_m ?? "")} onChange={(v) => updateSection("hiab_load_width_m", v)} disabled={locked} />
          <Field label="Load height (m)" type="number" step="0.01" value={String(form.pack_sections?.hiab_load_height_m ?? "")} onChange={(v) => updateSection("hiab_load_height_m", v)} disabled={locked} />
        </div>
        {context.loadWeightKg || context.loadLengthM ? <div style={autoExtracted}>
          The load measurements above were extracted from the transport job description. Confirm them against the load information before approval.
        </div> : null}
      </Section>

      <Section title="Verified HIAB chart & ground-bearing check">
        <div style={grid2}>
          <ReadOnlyFact label="Verified fitted configuration" value={technical.selectedSetup || "—"} />
          <ReadOnlyFact label="Manufacturer chart source" value={technical.capacitySource || "—"} />
          {isUploadedSpecProfile ? <Field label="AP-checked chart capacity at planned radius (kg)" type="number" step="1" value={String(form.pack_sections?.hiab_manual_chart_capacity_kg ?? "")} onChange={(v) => updateSection("hiab_manual_chart_capacity_kg", v)} disabled={locked} /> : null}
          {isUploadedSpecProfile ? <Field label="Manufacturer / supplier chart and page used" value={String(form.pack_sections?.hiab_manual_chart_source ?? "")} onChange={(v) => updateSection("hiab_manual_chart_source", v)} disabled={locked} /> : null}
          {isUploadedSpecProfile ? <Field label="Chart verified by" value={String(form.pack_sections?.hiab_chart_verified_by ?? "")} onChange={(v) => updateSection("hiab_chart_verified_by", v)} disabled={locked} /> : null}
          <ReadOnlyFact label="Manufacturer chart page" value={String(verifiedSetup?.sourcePage ?? form.pack_sections?.hiab_chart_page ?? "—")} />
          <ReadOnlyFact label="Calculated boom line length" value={boomGeometry.boomLengthM === null ? "—" : `${boomGeometry.boomLengthM} m`} />
          <ReadOnlyFact label="Calculated boom angle" value={boomGeometry.boomAngleDeg === null ? "—" : `${boomGeometry.boomAngleDeg}°`} />
          <EquipmentMultiSelect
            label="Lifting accessories from equipment register"
            options={equipmentAccessories.map((item) => ({
              id: item.id,
              label: item.label,
              detail: item.selfWeightKg === null
                ? "Self-weight not recorded"
                : `Self-weight ${item.selfWeightKg} kg`,
            }))}
            selectedIds={selectedAccessoryIds}
            onChange={updateAccessoryEquipment}
            disabled={locked}
          />
          {Boolean(form.pack_sections?.hiab_accessory_weights_complete) ? (
            <ReadOnlyFact label="Calculated lifting-accessory / hook weight" value={`${Number(form.pack_sections?.hiab_accessory_weight_kg ?? 0).toLocaleString("en-GB")} kg`} />
          ) : (
            <Field label="AP-verified accessory / hook weight where the equipment record has no self-weight (kg)" type="number" step="0.01" value={String(form.pack_sections?.hiab_accessory_weight_kg ?? "")} onChange={(v) => updateSection("hiab_accessory_weight_kg", v)} disabled={locked} />
          )}
          <label style={tickLabel}><input type="checkbox" checked={Boolean(form.pack_sections?.hiab_accessory_weight_confirmed)} onChange={(e) => updateSection("hiab_accessory_weight_confirmed", e.target.checked)} disabled={locked} /> Confirm the accessory weight includes hook, slings, shackles and any lifting beam</label>
          <ReadOnlyFact label="Gross lifted load" value={technical.totalLiftedWeightKg === null ? "—" : `${technical.totalLiftedWeightKg.toLocaleString("en-GB")} kg`} />
          <ReadOnlyFact label="Chart capacity at planned radius" value={technical.capacityKg === null ? "—" : `${technical.capacityKg.toLocaleString("en-GB")} kg`} />
          <ReadOnlyFact label="Chart utilisation" value={technical.utilisationPercent === null ? "—" : `${technical.utilisationPercent}%`} />
          <Field label="Vehicle operating / gross planning weight (kg)" type="number" step="1" value={String(form.pack_sections?.hiab_vehicle_operating_weight_kg ?? "")} onChange={(v) => updateSection("hiab_vehicle_operating_weight_kg", v)} disabled={locked} />
          <ReadOnlyFact label="Worst-case outrigger load" value={technical.worstCaseOutriggerLoadKg === null ? "—" : `${technical.worstCaseOutriggerLoadKg.toLocaleString("en-GB")} kg`} />
          <SelectField
            label="Mat / spreader from equipment register"
            value={String(form.pack_sections?.hiab_mat_equipment_id ?? "")}
            onChange={updateMatEquipment}
            options={[
              ["", "Select registered mat / spreader..."],
              ...equipmentMats.map((item) => [
                item.id,
                `${item.label}${item.dimensions ? ` - ${item.dimensions.lengthM} x ${item.dimensions.widthM} m` : " - dimensions not recorded"}`,
              ] as [string, string]),
            ]}
            disabled={locked}
          />
          {form.pack_sections?.hiab_mat_equipment_id && (!form.pack_sections?.hiab_mat_length_m || !form.pack_sections?.hiab_mat_width_m) ? (
            <div style={positionCheck}>
              The selected equipment record has no usable mat dimensions. Add the
              dimensions to the equipment record, or enter and AP-verify them
              here before approval.
            </div>
          ) : null}
          {form.pack_sections?.hiab_mat_equipment_id && !form.pack_sections?.hiab_mat_length_m ? <Field label="AP-verified mat length (m)" type="number" step="0.01" value={String(form.pack_sections?.hiab_mat_length_m ?? "")} onChange={(v) => updateSection("hiab_mat_length_m", v)} disabled={locked} /> : null}
          {form.pack_sections?.hiab_mat_equipment_id && !form.pack_sections?.hiab_mat_width_m ? <Field label="AP-verified mat width (m)" type="number" step="0.01" value={String(form.pack_sections?.hiab_mat_width_m ?? "")} onChange={(v) => updateSection("hiab_mat_width_m", v)} disabled={locked} /> : null}
          <Field label="Pieces under worst-case loaded stabiliser" type="number" step="1" value={String(form.pack_sections?.hiab_mats_under_loaded_outrigger ?? "1")} onChange={(v) => updateSection("hiab_mats_under_loaded_outrigger", v)} disabled={locked} />
          <ReadOnlyFact label="Worst-case ground pressure" value={technical.pressureKgM2 === null ? "—" : `${technical.pressureKgM2.toLocaleString("en-GB")} kg/m² / ${technical.pressureTM2?.toLocaleString("en-GB")} t/m²`} />
        </div>
        <div style={grid2}>
          <SelectField label="Selected stabiliser / support position" value={String(form.pack_sections?.hiab_stabiliser_position_code ?? "")} onChange={updateSupportPosition} options={SUPPORT_POSITION_OPTIONS.map(([key, label]) => [key, label])} disabled={locked} />
          <SelectField label="Permitted working sector" value={String(form.pack_sections?.hiab_working_sector_code ?? "")} onChange={updateWorkingSector} options={WORKING_SECTOR_OPTIONS.map(([key, label]) => [key, label])} disabled={locked} />
        </div>
        {["variable-verified", "restricted-verified"].includes(String(form.pack_sections?.hiab_stabiliser_position_code ?? "")) ? <label style={positionCheck}>
          <input type="checkbox" checked={Boolean(form.pack_sections?.hiab_position_capacity_confirmed)} onChange={(e) => updateSection("hiab_position_capacity_confirmed", e.target.checked)} disabled={locked} />
          AP confirms the machine’s rated-control system / applicable chart permits the displayed duty at this radius and in the selected sector.
        </label> : null}
        <div style={technical.errors.length ? validationErrorBox : validationOkBox}>
          {technical.errors.length
            ? <><strong>Complete before approval/finalisation:</strong> {technical.errors.join(" ")}</>
            : <><strong>Technical check complete.</strong> The exact saved configuration, chart capacity, gross lifted load and worst-case ground-bearing values will be used throughout the printed pack.</>}
        </div>
      </Section>

      <LiftArrangementEditor
        value={drawingModel}
        onChange={(model) => updateSection("lift_drawing_model_json", serialiseLiftDrawingModel(model))}
        schedule={drawingSchedule}
        machineType={machineType}
        machineLabel={equipmentProfile?.title ?? ""}
        drawingNumber={`HIAB-${transportJobId.slice(0, 8).toUpperCase()}`}
        personnelOptions={personnelOptions}
        disabled={locked}
      />
      {drawingValidation.errors.length ? (
        <div style={validationErrorBox}>
          <strong>Technical drawing incomplete:</strong> {drawingValidation.errors.join(" ")}
        </div>
      ) : null}

      <Section title="Vehicle setup & movement plan">
        <div style={grid2}>
          <ReadOnlyFact label="Vehicle configuration (from CRM)" value={form.vehicle_configuration || "—"} />
          <ReadOnlyFact label="Exact HIAB configuration (manufacturer profile)" value={form.hiab_configuration || "—"} />
          <ReadOnlyFact label="Selected support position" value={String(form.pack_sections?.hiab_stabiliser_position ?? "—")} />
          <SelectField label="Verified ground condition" value={String(form.pack_sections?.hiab_ground_condition_code ?? "")} onChange={updateGroundCondition} options={GROUND_OPTIONS.map(([key, label]) => [key, label])} disabled={locked} />
        </div>
        <TextAreaField label="Pickup method" value={form.pickup_method ?? ""} onChange={(v) => update("pickup_method", v)} disabled={locked} rows={4} />
        <TextAreaField label="Delivery method" value={form.delivery_method ?? ""} onChange={(v) => update("delivery_method", v)} disabled={locked} rows={4} />
        <TextAreaField label="Route notes" value={form.route_notes ?? ""} onChange={(v) => update("route_notes", v)} disabled={locked} rows={3} />
        <TextAreaField label="Access notes" value={form.access_notes ?? ""} onChange={(v) => update("access_notes", v)} disabled={locked} rows={3} />
        <TextAreaField label="Traffic management" value={form.traffic_management ?? ""} onChange={(v) => update("traffic_management", v)} disabled={locked} rows={3} />
        <TextAreaField label="Load securing method" value={form.load_securing_method ?? ""} onChange={(v) => update("load_securing_method", v)} disabled={locked} rows={3} />
      </Section>

      <Section title="RAMS wording">
        <ReadOnlyFact label="Lifting arrangement from equipment register" value={form.lifting_accessories || "Select the lifting accessories above"} />
        <TextAreaField label="Exclusion zone details" value={form.exclusion_zone_details ?? ""} onChange={(v) => update("exclusion_zone_details", v)} disabled={locked} rows={3} />
        <TextAreaField label="Method statement" value={form.method_statement ?? ""} onChange={(v) => update("method_statement", v)} disabled={locked} rows={6} />
        <TextAreaField label="Risk assessment" value={form.risk_assessment ?? ""} onChange={(v) => update("risk_assessment", v)} disabled={locked} rows={6} />
        <TextAreaField label="Site hazards" value={form.site_hazards ?? ""} onChange={(v) => update("site_hazards", v)} disabled={locked} rows={4} />
        <TextAreaField label="Control measures" value={form.control_measures ?? ""} onChange={(v) => update("control_measures", v)} disabled={locked} rows={4} />
        <TextAreaField label="PPE required" value={form.ppe_required ?? ""} onChange={(v) => update("ppe_required", v)} disabled={locked} rows={3} />
        <TextAreaField label="Weather limitations" value={form.weather_limitations ?? ""} onChange={(v) => update("weather_limitations", v)} disabled={locked} rows={3} />
        <TextAreaField label="Emergency procedures" value={form.emergency_procedures ?? ""} onChange={(v) => update("emergency_procedures", v)} disabled={locked} rows={4} />
      </Section>

      <Section title="Personnel & approval">
        <div style={grid2}>
          <SelectField label="Lift supervisor" value={form.lift_supervisor ?? ""} onChange={(v) => update("lift_supervisor", v)} options={[["", "Select lift supervisor…"], ...personnelOptions.map((name) => [name, name] as [string, string])]} disabled={locked} />
          <SelectField label="Appointed person" value={form.appointed_person ?? ""} onChange={(v) => update("appointed_person", v)} options={[["", "Select appointed person…"], ...personnelOptions.map((name) => [name, name] as [string, string])]} disabled={locked} />
          <SelectField label="Approved by" value={form.approved_by ?? ""} onChange={(v) => update("approved_by", v)} options={[["", "Select approver…"], ...personnelOptions.map((name) => [name, name] as [string, string])]} disabled={locked} />
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

function EquipmentProfileCard({ profile }: { profile: EquipmentProfile }) { return <div style={profileCard}><div style={sectionTitle}>Selected equipment profile</div><div style={profileTitle}>{profile.title}</div><div style={profileSummary}>{profile.summary}</div><div style={grid2}><ReadOnlyFact label="Machine type" value={profile.machineType} /><ReadOnlyFact label="Max capacity" value={profile.maxCapacityKg ? `${profile.maxCapacityKg.toLocaleString()} kg` : profile.maxCapacityTonnes ? `${profile.maxCapacityTonnes} t` : "—"} /><ReadOnlyFact label="Hydraulic outreach" value={profile.maxHydraulicOutreachM ? `${profile.maxHydraulicOutreachM} m` : profile.maxBoomLengthM ? `${profile.maxBoomLengthM} m` : "—"} /><ReadOnlyFact label="Jib / max outreach" value={profile.maxJibOutreachM ? `${profile.maxJibOutreachM} m` : profile.maxRadiusM ? `${profile.maxRadiusM} m radius` : "—"} /></div><div style={{ marginTop: 12 }}><div style={fieldLabel}>Key warnings</div><ul style={warningList}>{profile.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div></div>; }
function stringArray(value: unknown) { if (Array.isArray(value)) return value.map(String).filter(Boolean); if (typeof value !== "string" || !value.trim()) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []; } catch { return value.split(",").map((item) => item.trim()).filter(Boolean); } }
function equipmentDimensions(item: LiftEquipmentOption) { const source = `${item.label} ${item.notes}`.replace(/,/g, "."); const match = source.match(/(\d+(?:\.\d+)?)\s*(?:m|metres?)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:m|metres?)/i); if (!match) return null; const first = Number(match[1]); const second = Number(match[2]); return first > 0 && second > 0 ? { lengthM: first, widthM: second } : null; }
function equipmentSelfWeightKg(item: LiftEquipmentOption) { const source = `${item.notes} ${item.label}`.replace(/,/g, ""); const match = source.match(/(?:self[\s-]*weight|item[\s-]*weight|tare)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*kg/i); const value = match ? Number(match[1]) : NaN; return Number.isFinite(value) && value >= 0 ? value : null; }
function EquipmentMultiSelect({ label, options, selectedIds, onChange, disabled }: { label: string; options: Array<{ id: string; label: string; detail: string }>; selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean; }) { return <fieldset style={equipmentSelector} disabled={disabled}><legend style={fieldLabel}>{label}</legend>{options.length ? options.map((option) => <label key={option.id} style={equipmentRow}><input type="checkbox" checked={selectedIds.includes(option.id)} onChange={(event) => onChange(event.target.checked ? Array.from(new Set([...selectedIds, option.id])) : selectedIds.filter((id) => id !== option.id))} /><span><strong>{option.label}</strong><small style={{ display: "block", marginTop: 2, opacity: .72 }}>{option.detail}</small></span></label>) : <div style={validationErrorBox}>No active lifting accessories were found in the equipment register. Add the accessories, including their self-weight in Notes, before approval.</div>}</fieldset>; }
function ReadOnlyFact({ label, value }: { label: string; value: string }) { return <div style={summaryItem}><div style={fieldLabel}>{label}</div><div style={{ marginTop: 6, fontWeight: 800 }}>{value}</div></div>; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <div style={sectionStyle}><div style={sectionTitle}>{title}</div><div style={{ display: "grid", gap: 12 }}>{children}</div></div>; }
function Field({ label, value, onChange, type = "text", step, disabled }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; step?: string; disabled?: boolean; }) { return <label style={fieldWrap}><span style={fieldLabel}>{label}</span><input type={type} step={step} value={value as any} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={inputStyle} /></label>; }
function SelectField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<readonly [string, string]>; disabled?: boolean; }) { return <label style={fieldWrap}><span style={fieldLabel}>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={inputStyle}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>; }
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
const validationErrorBox: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(180,0,0,0.10)", border: "1px solid rgba(180,0,0,0.18)", lineHeight: 1.5 };
const validationOkBox: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(0,130,70,0.10)", border: "1px solid rgba(0,130,70,0.20)", lineHeight: 1.5 };
const sourceBanner: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "#e8f3fb", border: "1px solid #a9d2ec", lineHeight: 1.5 };
const autoExtracted: CSSProperties = { padding: "9px 11px", borderRadius: 9, background: "#fff8df", border: "1px solid #e6cf74", fontSize: 13, lineHeight: 1.45 };
const positionCheck: CSSProperties = { display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: "#fff3d6", border: "1px solid #dfbd57", fontWeight: 750, lineHeight: 1.45 };
const tickRow: CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" };
const tickLabel: CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontWeight: 700 };
const warningList: CSSProperties = { margin: "8px 0 0 18px", padding: 0, display: "grid", gap: 6 };
const equipmentSelector: CSSProperties = { margin: 0, padding: 10, border: "1px solid rgba(0,0,0,.14)", borderRadius: 10, background: "#fff", maxHeight: 230, overflowY: "auto", display: "grid", gap: 7 };
const equipmentRow: CSSProperties = { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, lineHeight: 1.35 };
const summaryItem: CSSProperties = { background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 12 };
const primaryBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "none", textDecoration: "none", background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer" };
const secondaryBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.10)", textDecoration: "none", background: "rgba(255,255,255,0.86)", color: "#111", fontWeight: 900, cursor: "pointer" };
const dangerBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "none", textDecoration: "none", background: "#8a1f1f", color: "#fff", fontWeight: 900, cursor: "pointer" };
const warningBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "none", textDecoration: "none", background: "#c77d00", color: "#fff", fontWeight: 900, cursor: "pointer" };
