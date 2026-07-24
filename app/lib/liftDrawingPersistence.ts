import { createDefaultLiftDrawing } from "../components/lift-drawing/defaults";
import type {
  LiftDrawingModelV1,
  LiftDrawingObject,
  LiftMachineType,
  LiftTechnicalSchedule,
} from "../components/lift-drawing/types";

export const LIFT_DRAWING_SECTION_KEY = "lift_drawing_model_json";

export type LiftDrawingFallback = Parameters<typeof createDefaultLiftDrawing>[0];

function record(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function stringValue(value: unknown, fallback = "", maxLength = 500) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function numberValue(
  value: unknown,
  fallback: number,
  min = -10_000,
  max = 10_000,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function positive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegative(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function liftPoint(value: unknown, fallback: { xM: number; yM: number; levelM: number }) {
  const source = record(value);
  if (!source) return fallback;
  return {
    xM: numberValue(source.xM, fallback.xM),
    yM: numberValue(source.yM, fallback.yM),
    levelM: numberValue(source.levelM, fallback.levelM, -1_000, 1_000),
  };
}

function normaliseObject(value: unknown, index: number): LiftDrawingObject | null {
  const source = record(value);
  if (!source) return null;
  const id = stringValue(source.id, `object-${index + 1}`, 100);
  const type = stringValue(source.type, "", 50);
  if (type === "overhead-service") {
    return {
      id,
      type,
      x1M: numberValue(source.x1M, 0),
      y1M: numberValue(source.y1M, 0),
      x2M: numberValue(source.x2M, 0),
      y2M: numberValue(source.y2M, 0),
      heightM: numberValue(source.heightM, 0, 0, 1_000),
      label: stringValue(source.label, "Overhead service", 200),
    };
  }
  if (type === "note") {
    return {
      id,
      type,
      xM: numberValue(source.xM, 0),
      yM: numberValue(source.yM, 0),
      text: stringValue(source.text, "Drawing note", 1_000),
    };
  }
  if (["line", "fence", "dimension"].includes(type)) {
    return {
      id,
      type: type as "line" | "fence" | "dimension",
      x1M: numberValue(source.x1M, 0),
      y1M: numberValue(source.y1M, 0),
      x2M: numberValue(source.x2M, 1),
      y2M: numberValue(source.y2M, 1),
      label: stringValue(source.label, type, 200),
    };
  }
  if (["polyline", "polygon"].includes(type)) {
    const points = Array.isArray(source.points)
      ? source.points
          .map((point: unknown) => {
            const saved = record(point);
            return saved
              ? {
                  xM: numberValue(saved.xM, 0),
                  yM: numberValue(saved.yM, 0),
                }
              : null;
          })
          .filter((point): point is { xM: number; yM: number } => Boolean(point))
      : [];
    if (points.length < 2) return null;
    return {
      id,
      type: type as "polyline" | "polygon",
      points,
      label: stringValue(source.label, type, 200),
    };
  }
  if ([
    "building",
    "road",
    "pedestrian-route",
    "exclusion-zone",
    "underground-service",
  ].includes(type)) {
    const areaType = type as
      | "building"
      | "road"
      | "pedestrian-route"
      | "exclusion-zone"
      | "underground-service";
    return {
      id,
      type: areaType,
      xM: numberValue(source.xM, 0),
      yM: numberValue(source.yM, 0),
      widthM: numberValue(source.widthM, 0, 0, 10_000),
      depthM: numberValue(source.depthM, 0, 0, 10_000),
      heightM: positive(source.heightM) ?? undefined,
      rotationDeg: numberValue(source.rotationDeg, 0, -360, 360),
      label: stringValue(source.label, type.replace(/-/g, " "), 200),
    };
  }
  return null;
}

function normaliseDrawing(
  source: Record<string, any>,
  fallback: LiftDrawingFallback,
  initialIssues: string[] = [],
) {
  const base = createDefaultLiftDrawing(fallback);
  const issues = [...initialIssues];
  const site = record(source.site);
  const machine = record(source.machine);
  const lift = record(source.lift);
  const technical = record(source.technical);
  const basis = record(site?.basis);
  if (!site) issues.push("Saved drawing site data was missing and has been rebuilt.");
  if (!machine) issues.push("Saved drawing machine data was missing and has been rebuilt.");
  if (!lift) issues.push("Saved drawing lift geometry was missing and has been rebuilt.");
  if (!technical) issues.push("Saved drawing technical schedule was missing and has been rebuilt.");

  const rawStabilisers = Array.isArray(machine?.stabilisers)
    ? machine.stabilisers
    : [];
  if (rawStabilisers.length < 4) {
    issues.push("Saved support geometry was incomplete and has been restored as an unverified draft.");
  }
  const stabilisers = base.machine.stabilisers.map((fallbackSupport, index) => {
    const saved = record(rawStabilisers[index]);
    if (!saved) return fallbackSupport;
    return {
      id: stringValue(saved.id, fallbackSupport.id, 100),
      xM: numberValue(saved.xM, fallbackSupport.xM),
      yM: numberValue(saved.yM, fallbackSupport.yM),
      extensionM: numberValue(saved.extensionM, fallbackSupport.extensionM, 0, 100),
      padLengthM: numberValue(saved.padLengthM, fallbackSupport.padLengthM, 0, 100),
      padWidthM: numberValue(saved.padWidthM, fallbackSupport.padWidthM, 0, 100),
    };
  });

  const travelPath = Array.isArray(lift?.travelPath)
    ? lift!.travelPath
        .map((point: unknown) => {
          const saved = record(point);
          return saved
            ? {
                xM: numberValue(saved.xM, 0),
                yM: numberValue(saved.yM, 0),
              }
            : null;
        })
        .filter((point): point is { xM: number; yM: number } => Boolean(point))
    : [];
  if (travelPath.length < 2) {
    issues.push("Saved load travel path was incomplete and has been restored as a draft.");
  }

  const objects = Array.isArray(source.objects)
    ? source.objects
        .map(normaliseObject)
        .filter((item): item is LiftDrawingObject => Boolean(item))
    : [];
  if (source.objects !== undefined && !Array.isArray(source.objects)) {
    issues.push("Invalid saved site objects were ignored.");
  }

  const savedStatus = source.status === "verified" ? "verified" : "draft";
  const mustBeDraft = issues.length > 0;
  const model: LiftDrawingModelV1 = {
    version: 1,
    normalisation: {
      state: mustBeDraft ? "migrated" : "valid",
      issues,
    },
    drawingNumber: stringValue(source.drawingNumber, base.drawingNumber, 100),
    revision: stringValue(source.revision, base.revision, 30),
    status: mustBeDraft ? "draft" : savedStatus,
    preparedBy: stringValue(source.preparedBy, "", 200) || undefined,
    verifiedBy: mustBeDraft
      ? undefined
      : stringValue(source.verifiedBy, "", 200) || undefined,
    verifiedAt: mustBeDraft
      ? undefined
      : stringValue(source.verifiedAt, "", 100) || undefined,
    scaleMode: source.scaleMode === "verified-scale"
      ? "verified-scale"
      : "diagrammatic",
    units: "m",
    site: {
      widthM: numberValue(site?.widthM, base.site.widthM, 0.1, 10_000),
      depthM: numberValue(site?.depthM, base.site.depthM, 0.1, 10_000),
      northAngleDeg: numberValue(site?.northAngleDeg, base.site.northAngleDeg, -360, 360),
      scaleCalibrated: booleanValue(
        site?.scaleCalibrated,
        source.scaleMode === "verified-scale" && savedStatus === "verified",
      ),
      calibrationDistanceM:
        positive(site?.calibrationDistanceM) ?? undefined,
      basis: basis
        ? {
            kind: [
              "blank-grid",
              "image",
              "pdf-page",
              "dxf-reference",
            ].includes(basis.kind)
              ? basis.kind
              : "blank-grid",
            name: stringValue(basis.name, "Site basis", 300),
            dataUrl:
              typeof basis.dataUrl === "string" &&
              basis.dataUrl.startsWith("data:")
                ? basis.dataUrl.slice(0, 3_000_000)
                : undefined,
            sourceUrl:
              stringValue(basis.sourceUrl, "", 2_000) || undefined,
            pageNumber: positive(basis.pageNumber) ?? undefined,
            opacity: numberValue(basis.opacity, 0.55, 0, 1),
            rotationDeg: numberValue(basis.rotationDeg, 0, -360, 360),
          }
        : base.site.basis,
    },
    machine: {
      type: [
        "mobile-crane",
        "spider-crane",
        "hiab-rigid",
        "hiab-artic",
      ].includes(machine?.type)
        ? machine!.type as LiftMachineType
        : base.machine.type,
      label: stringValue(machine?.label, base.machine.label, 300),
      make: stringValue(machine?.make, "", 200) || undefined,
      model: stringValue(machine?.model, "", 200) || undefined,
      hiredIn: booleanValue(machine?.hiredIn, base.machine.hiredIn),
      supplier: stringValue(machine?.supplier, "", 300) || undefined,
      serialOrFleetReference:
        stringValue(machine?.serialOrFleetReference, "", 200) || undefined,
      xM: numberValue(machine?.xM, base.machine.xM),
      yM: numberValue(machine?.yM, base.machine.yM),
      rotationDeg: numberValue(machine?.rotationDeg, base.machine.rotationDeg, -360, 360),
      lengthM: numberValue(machine?.lengthM, base.machine.lengthM, 0.1, 500),
      widthM: numberValue(machine?.widthM, base.machine.widthM, 0.1, 100),
      centreOfRotationOffsetM: numberValue(
        machine?.centreOfRotationOffsetM,
        base.machine.centreOfRotationOffsetM,
        -100,
        100,
      ),
      cabLengthM: positive(machine?.cabLengthM) ?? base.machine.cabLengthM,
      bedLengthM: positive(machine?.bedLengthM) ?? base.machine.bedLengthM,
      dimensionsVerified: booleanValue(
        machine?.dimensionsVerified,
        savedStatus === "verified",
      ),
      dimensionsSource:
        stringValue(machine?.dimensionsSource, "", 300) || undefined,
      supportGeometryVerified: booleanValue(
        machine?.supportGeometryVerified,
        savedStatus === "verified" && rawStabilisers.length >= 4,
      ),
      profileGeometryKey:
        stringValue(machine?.profileGeometryKey, "", 200) || undefined,
      stabilisers,
    },
    lift: {
      pick: liftPoint(lift?.pick, base.lift.pick),
      landing: liftPoint(lift?.landing, base.lift.landing),
      loadLengthM: numberValue(lift?.loadLengthM, base.lift.loadLengthM, 0, 1_000),
      loadWidthM: numberValue(lift?.loadWidthM, base.lift.loadWidthM, 0, 1_000),
      loadHeightM: numberValue(lift?.loadHeightM, base.lift.loadHeightM, 0, 1_000),
      loadWeightKg: numberValue(lift?.loadWeightKg, base.lift.loadWeightKg, 0, 10_000_000),
      accessoryWeightKg: numberValue(
        lift?.accessoryWeightKg,
        base.lift.accessoryWeightKg,
        0,
        10_000_000,
      ),
      accessoryWeightConfirmed: booleanValue(
        lift?.accessoryWeightConfirmed,
        base.lift.accessoryWeightConfirmed,
      ),
      radiusM: numberValue(lift?.radiusM, base.lift.radiusM, 0, 1_000),
      boomLengthM: numberValue(lift?.boomLengthM, base.lift.boomLengthM, 0, 1_000),
      boomAngleDeg: numberValue(lift?.boomAngleDeg, base.lift.boomAngleDeg, -180, 180),
      hookHeightM: numberValue(lift?.hookHeightM, base.lift.hookHeightM, 0, 1_000),
      travelPath: travelPath.length >= 2 ? travelPath : base.lift.travelPath,
      workingSectorStartDeg: numberValue(
        lift?.workingSectorStartDeg,
        base.lift.workingSectorStartDeg,
        -360,
        360,
      ),
      workingSectorEndDeg: numberValue(
        lift?.workingSectorEndDeg,
        base.lift.workingSectorEndDeg,
        -360,
        360,
      ),
    },
    technical: {
      exactConfiguration: stringValue(
        technical?.exactConfiguration,
        base.technical.exactConfiguration,
        1_000,
      ),
      counterweight: stringValue(
        technical?.counterweight,
        base.technical.counterweight,
        300,
      ),
      chartSource: stringValue(
        technical?.chartSource,
        base.technical.chartSource,
        1_000,
      ),
      chartPage: stringValue(technical?.chartPage, base.technical.chartPage, 200),
      chartCapacityKg: numberValue(
        technical?.chartCapacityKg,
        base.technical.chartCapacityKg,
        0,
        10_000_000,
      ),
      utilisationPercent: numberValue(
        technical?.utilisationPercent,
        base.technical.utilisationPercent,
        0,
        1_000,
      ),
      stabiliserSetup: stringValue(
        technical?.stabiliserSetup,
        base.technical.stabiliserSetup,
        1_000,
      ),
      workingSector: stringValue(
        technical?.workingSector,
        base.technical.workingSector,
        1_000,
      ),
      operatingWeightKg: numberValue(
        technical?.operatingWeightKg,
        base.technical.operatingWeightKg,
        0,
        10_000_000,
      ),
      supportReactionKg:
        nonNegative(technical?.supportReactionKg) ?? undefined,
      supportReactionSource:
        stringValue(technical?.supportReactionSource, "", 1_000) || undefined,
      groundPressureKgM2: numberValue(
        technical?.groundPressureKgM2,
        base.technical.groundPressureKgM2,
        0,
        10_000_000,
      ),
      liftingAccessories: stringValue(
        technical?.liftingAccessories,
        base.technical.liftingAccessories,
        3_000,
      ),
      siteHazards: stringValue(
        technical?.siteHazards,
        base.technical.siteHazards,
        5_000,
      ),
      controlMeasures: stringValue(
        technical?.controlMeasures,
        base.technical.controlMeasures,
        5_000,
      ),
      hiredMachineVerifiedBy:
        stringValue(technical?.hiredMachineVerifiedBy, "", 200) || undefined,
      hiredMachineVerifiedAt:
        stringValue(technical?.hiredMachineVerifiedAt, "", 100) || undefined,
      currentLolerReference:
        stringValue(technical?.currentLolerReference, "", 300) || undefined,
    },
    objects,
  };
  return model;
}

export function parseLiftDrawingModel(
  value: unknown,
  fallback: LiftDrawingFallback = {},
): LiftDrawingModelV1 {
  if (value === null || value === undefined || value === "") {
    return createDefaultLiftDrawing(fallback);
  }
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const source = record(parsed);
    if (!source || Number(source.version) !== 1) {
      const invalid = createDefaultLiftDrawing(fallback);
      invalid.normalisation = {
        state: "invalid",
        issues: ["Saved drawing data was invalid and has been opened as a safe draft."],
      };
      return invalid;
    }
    return normaliseDrawing(source, fallback);
  } catch {
    const invalid = createDefaultLiftDrawing(fallback);
    invalid.normalisation = {
      state: "invalid",
      issues: ["Saved drawing data could not be read and has been opened as a safe draft."],
    };
    return invalid;
  }
}

export function serialiseLiftDrawingModel(model: LiftDrawingModelV1) {
  return JSON.stringify(model);
}

/**
 * The saved technical schedule is authoritative. This keeps a previously drawn
 * site arrangement while preventing duplicate/free-text engineering values in
 * the drawing from drifting away from the lift plan.
 */
export function synchroniseLiftDrawingWithSchedule(
  model: LiftDrawingModelV1,
  schedule: LiftTechnicalSchedule,
  identity?: {
    machineType?: LiftMachineType;
    machineLabel?: string;
    machineLengthM?: number | null;
    machineWidthM?: number | null;
    centreOfRotationOffsetM?: number | null;
    machineDimensionsVerified?: boolean;
    machineDimensionsSource?: string | null;
    supportGeometryVerified?: boolean;
  },
) {
  const next = structuredClone(model);
  if (identity?.machineType) next.machine.type = identity.machineType;
  if (identity?.machineLabel) next.machine.label = identity.machineLabel;
  if (positive(identity?.machineLengthM)) {
    next.machine.lengthM = Number(identity?.machineLengthM);
  }
  if (positive(identity?.machineWidthM)) {
    next.machine.widthM = Number(identity?.machineWidthM);
  }
  if (Number.isFinite(Number(identity?.centreOfRotationOffsetM))) {
    next.machine.centreOfRotationOffsetM =
      Number(identity?.centreOfRotationOffsetM);
  }
  if (identity?.machineDimensionsVerified !== undefined) {
    next.machine.dimensionsVerified = identity.machineDimensionsVerified;
  }
  if (identity?.machineDimensionsSource) {
    next.machine.dimensionsSource = identity.machineDimensionsSource;
  }
  if (identity?.supportGeometryVerified !== undefined) {
    next.machine.supportGeometryVerified = identity.supportGeometryVerified;
  }

  const loadWeightKg = positive(schedule.loadWeightKg);
  const accessoryWeightKg = nonNegative(schedule.accessoryWeightKg);
  const loadLengthM = positive(schedule.loadLengthM);
  const loadWidthM = positive(schedule.loadWidthM);
  const loadHeightM = positive(schedule.loadHeightM);
  const radiusM = positive(schedule.radiusM);
  const boomLengthM = positive(schedule.boomLengthM);
  const boomAngleDeg = positive(schedule.boomAngleDeg);
  const hookHeightM = positive(schedule.hookHeightM);
  const matLengthM = positive(schedule.matLengthM);
  const matWidthM = positive(schedule.matWidthM);

  if (loadWeightKg !== null) next.lift.loadWeightKg = loadWeightKg;
  if (accessoryWeightKg !== null) next.lift.accessoryWeightKg = accessoryWeightKg;
  if (
    schedule.accessoryWeightConfirmed !== null &&
    schedule.accessoryWeightConfirmed !== undefined
  ) {
    next.lift.accessoryWeightConfirmed =
      Boolean(schedule.accessoryWeightConfirmed);
  }
  if (loadLengthM !== null) next.lift.loadLengthM = loadLengthM;
  if (loadWidthM !== null) next.lift.loadWidthM = loadWidthM;
  if (loadHeightM !== null) next.lift.loadHeightM = loadHeightM;
  if (radiusM !== null) next.lift.radiusM = radiusM;
  if (boomLengthM !== null) next.lift.boomLengthM = boomLengthM;
  if (boomAngleDeg !== null) next.lift.boomAngleDeg = boomAngleDeg;
  if (hookHeightM !== null) next.lift.hookHeightM = hookHeightM;
  if (Number.isFinite(Number(schedule.workingSectorStartDeg))) {
    next.lift.workingSectorStartDeg = Number(schedule.workingSectorStartDeg);
  }
  if (Number.isFinite(Number(schedule.workingSectorEndDeg))) {
    next.lift.workingSectorEndDeg = Number(schedule.workingSectorEndDeg);
  }

  next.technical.exactConfiguration =
    stringValue(schedule.exactConfiguration) ||
    next.technical.exactConfiguration;
  next.technical.chartSource =
    stringValue(schedule.chartSource) || next.technical.chartSource;
  next.technical.chartPage =
    stringValue(schedule.chartPage) || next.technical.chartPage;
  next.technical.chartCapacityKg =
    positive(schedule.chartCapacityKg) ?? next.technical.chartCapacityKg;
  next.technical.utilisationPercent =
    positive(schedule.utilisationPercent) ??
    next.technical.utilisationPercent;
  next.technical.stabiliserSetup =
    stringValue(schedule.stabiliserSetup) ||
    next.technical.stabiliserSetup;
  next.technical.workingSector =
    stringValue(schedule.workingSector) || next.technical.workingSector;
  next.technical.operatingWeightKg =
    positive(schedule.operatingWeightKg) ??
    next.technical.operatingWeightKg;
  next.technical.groundPressureKgM2 =
    positive(schedule.groundPressureKgM2) ??
    next.technical.groundPressureKgM2;
  next.technical.liftingAccessories =
    stringValue(schedule.liftingAccessories) ||
    next.technical.liftingAccessories;
  next.technical.siteHazards =
    stringValue(schedule.siteHazards) || next.technical.siteHazards;
  next.technical.controlMeasures =
    stringValue(schedule.controlMeasures) ||
    next.technical.controlMeasures;

  if (matLengthM !== null || matWidthM !== null) {
    next.machine.stabilisers = next.machine.stabilisers.map((support) => ({
      ...support,
      padLengthM: matLengthM ?? support.padLengthM,
      padWidthM: matWidthM ?? support.padWidthM,
    }));
  }
  if (model.status === "verified") {
    const changed = JSON.stringify({
      machine: next.machine,
      lift: next.lift,
      technical: next.technical,
    }) !== JSON.stringify({
      machine: model.machine,
      lift: model.lift,
      technical: model.technical,
    });
    if (changed) {
      next.status = "draft";
      next.verifiedBy = undefined;
      next.verifiedAt = undefined;
    }
  }
  return next;
}
