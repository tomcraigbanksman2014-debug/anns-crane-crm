import type { LiftTechnicalSchedule } from "../components/lift-drawing/types";

export const NORMALISED_TECHNICAL_PLAN_KEY = "normalised_technical_plan_v2";

export type NormalisedLiftTechnicalPlanV2 = {
  schema: "anns-lift-technical-plan";
  version: 2;
  planType: "mobile-crane" | "hiab";
  revision: string;
  sourceUpdatedAt: string;
  job: {
    id: string;
    number: string;
    client: string;
    project: string;
    collectionAddress?: string;
    deliveryAddress?: string;
    siteAddress?: string;
    plannedDate?: string;
    notes?: string;
  };
  machine: {
    ownership: "owned" | "hired";
    profileId?: string;
    title: string;
    manufacturer?: string;
    model?: string;
    registrationOrFleetReference?: string;
    supplier?: string;
    exactConfiguration: string;
    counterweightOrBallast?: string;
    boomOrJib: string;
    supportConfiguration: {
      code: string;
      label: string;
      verifiedForDuty: boolean;
    };
    workingSector: {
      code: string;
      label: string;
      startDeg: number;
      endDeg: number;
    };
  };
  load: {
    description: string;
    lengthM?: number;
    widthM?: number;
    heightM?: number;
    loadWeightKg?: number;
    accessoryEquipmentIds: string[];
    accessoryLabels: string[];
    accessoryWeightKg?: number;
    accessoryWeightConfirmed: boolean;
    grossLiftedWeightKg?: number;
  };
  duty: {
    pickRadiusM?: number;
    landingRadiusM?: number;
    worstCaseRadiusM?: number;
    pickHeightM?: number;
    landingHeightM?: number;
    hookHeightM?: number;
    boomLengthM?: number;
    boomAngleDeg?: number;
    chartCapacityKg?: number;
    utilisationPercent?: number;
    chartSource: string;
    chartPage: string;
    chartRuleId?: string;
  };
  groundBearing: {
    basis: "published-reaction" | "worst-case-industry-standard";
    operatingWeightKg?: number;
    publishedReactionKg?: number;
    worstCaseSupportLoadKg?: number;
    selectedMatEquipmentId?: string;
    selectedMatLabel?: string;
    matLengthM?: number;
    matWidthM?: number;
    quantity: number;
    bearingAreaM2?: number;
    groundPressureKgM2?: number;
  };
  personnel: {
    operator?: string;
    liftSupervisor?: string;
    appointedPerson?: string;
    approvedBy?: string;
  };
  narratives: {
    collectionMethod?: string;
    setDownMethod?: string;
    loadSecuring?: string;
    routeAccess?: string;
    methodStatement?: string;
    riskAssessment?: string;
    siteHazards?: string;
    controlMeasures?: string;
  };
  hiredMachineVerification?: {
    supplierPackReference?: string;
    currentLolerReference?: string;
    verifiedBy?: string;
    verifiedAt?: string;
    exactChartPageIncluded: boolean;
  };
  validation: {
    state: "incomplete" | "ready-for-drawing-verification" | "approved";
    errors: string[];
  };
};

function numberOrUndefined(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

export function buildTransportNormalisedTechnicalPlan({
  transportJobId,
  context,
  form,
  sections,
  schedule,
  machine,
  technical,
  validationErrors,
}: {
  transportJobId: string;
  context: Record<string, any>;
  form: Record<string, any>;
  sections: Record<string, any>;
  schedule: LiftTechnicalSchedule;
  machine: {
    profileId?: string | null;
    title?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    registration?: string | null;
    hiredIn: boolean;
    supplier?: string | null;
  };
  technical: Record<string, any>;
  validationErrors: string[];
}): NormalisedLiftTechnicalPlanV2 {
  const accessoryIds = stringArray(sections.hiab_accessory_equipment_ids);
  const accessoryLabels = stringArray(sections.hiab_accessory_equipment_labels);
  const supportCode = stringValue(sections.hiab_stabiliser_position_code);
  const sectorCode = stringValue(sections.hiab_working_sector_code);
  const hiredVerification = machine.hiredIn
    ? {
        supplierPackReference:
          stringValue(sections.hiab_manual_chart_source) || undefined,
        currentLolerReference:
          stringValue(sections.hiab_current_loler_reference) || undefined,
        verifiedBy:
          stringValue(sections.hiab_chart_verified_by) || undefined,
        verifiedAt:
          stringValue(sections.hiab_chart_verified_at) || undefined,
        exactChartPageIncluded: Boolean(
          sections.hiab_uploaded_chart_document_id &&
          sections.hiab_uploaded_chart_page,
        ),
      }
    : undefined;

  return {
    schema: "anns-lift-technical-plan",
    version: 2,
    planType: "hiab",
    revision: stringValue(sections.hiab_plan_revision || "A"),
    sourceUpdatedAt: new Date().toISOString(),
    job: {
      id: transportJobId,
      number: stringValue(context.transportNumber),
      client: stringValue(context.clientName),
      project: stringValue(form.job_summary || context.jobSummary),
      collectionAddress: stringValue(context.collectionAddress) || undefined,
      deliveryAddress: stringValue(context.deliveryAddress) || undefined,
      plannedDate: stringValue(context.transportDate) || undefined,
      notes: stringValue(context.transportNotes) || undefined,
    },
    machine: {
      ownership: machine.hiredIn ? "hired" : "owned",
      profileId: stringValue(machine.profileId) || undefined,
      title: stringValue(machine.title),
      manufacturer: stringValue(machine.manufacturer) || undefined,
      model: stringValue(machine.model) || undefined,
      registrationOrFleetReference:
        stringValue(machine.registration) || undefined,
      supplier: stringValue(machine.supplier) || undefined,
      exactConfiguration: stringValue(schedule.exactConfiguration),
      counterweightOrBallast:
        stringValue(sections.hiab_counterweight_or_ballast) || undefined,
      boomOrJib: stringValue(
        sections.hiab_boom_or_jib ||
        technical.selectedSetup ||
        schedule.exactConfiguration,
      ),
      supportConfiguration: {
        code: supportCode,
        label: stringValue(schedule.stabiliserSetup),
        verifiedForDuty:
          supportCode === "full" ||
          Boolean(sections.hiab_position_capacity_confirmed),
      },
      workingSector: {
        code: sectorCode,
        label: stringValue(schedule.workingSector),
        startDeg: numberOrUndefined(schedule.workingSectorStartDeg) ?? 0,
        endDeg: numberOrUndefined(schedule.workingSectorEndDeg) ?? 0,
      },
    },
    load: {
      description: stringValue(schedule.loadDescription),
      lengthM: numberOrUndefined(schedule.loadLengthM),
      widthM: numberOrUndefined(schedule.loadWidthM),
      heightM: numberOrUndefined(schedule.loadHeightM),
      loadWeightKg: numberOrUndefined(schedule.loadWeightKg),
      accessoryEquipmentIds: accessoryIds,
      accessoryLabels,
      accessoryWeightKg: numberOrUndefined(schedule.accessoryWeightKg),
      accessoryWeightConfirmed: Boolean(schedule.accessoryWeightConfirmed),
      grossLiftedWeightKg: numberOrUndefined(schedule.grossLiftedWeightKg),
    },
    duty: {
      pickRadiusM: numberOrUndefined(sections.hiab_pick_radius_m),
      landingRadiusM: numberOrUndefined(sections.hiab_landing_radius_m),
      worstCaseRadiusM: numberOrUndefined(schedule.radiusM),
      pickHeightM: numberOrUndefined(sections.hiab_pick_height_m),
      landingHeightM: numberOrUndefined(sections.hiab_landing_height_m),
      hookHeightM: numberOrUndefined(schedule.hookHeightM),
      boomLengthM: numberOrUndefined(schedule.boomLengthM),
      boomAngleDeg: numberOrUndefined(schedule.boomAngleDeg),
      chartCapacityKg: numberOrUndefined(schedule.chartCapacityKg),
      utilisationPercent: numberOrUndefined(schedule.utilisationPercent),
      chartSource: stringValue(schedule.chartSource),
      chartPage: stringValue(schedule.chartPage),
      chartRuleId: stringValue(technical.chartRuleId) || undefined,
    },
    groundBearing: {
      basis: numberOrUndefined(sections.hiab_published_support_reaction_kg)
        ? "published-reaction"
        : "worst-case-industry-standard",
      operatingWeightKg: numberOrUndefined(schedule.operatingWeightKg),
      publishedReactionKg:
        numberOrUndefined(sections.hiab_published_support_reaction_kg),
      worstCaseSupportLoadKg:
        numberOrUndefined(technical.worstCaseOutriggerLoadKg),
      selectedMatEquipmentId:
        stringValue(sections.hiab_mat_equipment_id) || undefined,
      selectedMatLabel:
        stringValue(sections.hiab_mat_equipment_label) || undefined,
      matLengthM: numberOrUndefined(schedule.matLengthM),
      matWidthM: numberOrUndefined(schedule.matWidthM),
      quantity: Math.max(
        1,
        Math.floor(
          numberOrUndefined(sections.hiab_mats_under_loaded_outrigger) ?? 1,
        ),
      ),
      bearingAreaM2: numberOrUndefined(technical.totalMatAreaM2),
      groundPressureKgM2: numberOrUndefined(schedule.groundPressureKgM2),
    },
    personnel: {
      operator: stringValue(form.operator_name) || undefined,
      liftSupervisor: stringValue(form.lift_supervisor) || undefined,
      appointedPerson: stringValue(form.appointed_person) || undefined,
      approvedBy: stringValue(form.approved_by) || undefined,
    },
    narratives: {
      collectionMethod: stringValue(form.pickup_method) || undefined,
      setDownMethod: stringValue(form.delivery_method) || undefined,
      loadSecuring: stringValue(form.load_securing_method) || undefined,
      routeAccess: [
        stringValue(form.route_notes),
        stringValue(form.access_notes),
      ].filter(Boolean).join("\n") || undefined,
      methodStatement: stringValue(form.method_statement) || undefined,
      riskAssessment: stringValue(form.risk_assessment) || undefined,
      siteHazards: stringValue(form.site_hazards) || undefined,
      controlMeasures: stringValue(form.control_measures) || undefined,
    },
    hiredMachineVerification: hiredVerification,
    validation: {
      state: validationErrors.length
        ? "incomplete"
        : form.approved_at
          ? "approved"
          : "ready-for-drawing-verification",
      errors: Array.from(new Set(validationErrors.filter(Boolean))),
    },
  };
}

export function technicalPlanToSchedule(
  plan: NormalisedLiftTechnicalPlanV2,
): LiftTechnicalSchedule {
  return {
    loadDescription: plan.load.description,
    loadWeightKg: plan.load.loadWeightKg,
    accessoryWeightKg: plan.load.accessoryWeightKg,
    accessoryWeightConfirmed: plan.load.accessoryWeightConfirmed,
    grossLiftedWeightKg: plan.load.grossLiftedWeightKg,
    loadLengthM: plan.load.lengthM,
    loadWidthM: plan.load.widthM,
    loadHeightM: plan.load.heightM,
    radiusM: plan.duty.worstCaseRadiusM,
    boomLengthM: plan.duty.boomLengthM,
    boomAngleDeg: plan.duty.boomAngleDeg,
    hookHeightM: plan.duty.hookHeightM,
    chartCapacityKg: plan.duty.chartCapacityKg,
    chartSource: plan.duty.chartSource,
    chartPage: plan.duty.chartPage,
    utilisationPercent: plan.duty.utilisationPercent,
    exactConfiguration: plan.machine.exactConfiguration,
    stabiliserSetup: plan.machine.supportConfiguration.label,
    workingSector: plan.machine.workingSector.label,
    workingSectorStartDeg: plan.machine.workingSector.startDeg,
    workingSectorEndDeg: plan.machine.workingSector.endDeg,
    operatingWeightKg: plan.groundBearing.operatingWeightKg,
    groundPressureKgM2: plan.groundBearing.groundPressureKgM2,
    matLengthM: plan.groundBearing.matLengthM,
    matWidthM: plan.groundBearing.matWidthM,
    liftingAccessories: plan.load.accessoryLabels.join("; "),
    siteHazards: plan.narratives.siteHazards,
    controlMeasures: plan.narratives.controlMeasures,
  };
}

export function parseNormalisedTechnicalPlan(
  value: unknown,
): NormalisedLiftTechnicalPlanV2 | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as any).schema === "anns-lift-technical-plan" &&
      Number((parsed as any).version) === 2
    ) {
      return parsed as NormalisedLiftTechnicalPlanV2;
    }
  } catch {
    // The legacy compatibility path will rebuild the plan from saved columns.
  }
  return null;
}
