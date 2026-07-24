import type { LiftDrawingModelV1, LiftMachineType } from "./types";

function defaultMachineDimensions(type: LiftMachineType) {
  if (type === "hiab-artic") return { lengthM: 16.5, widthM: 2.55, cabLengthM: 3.2, bedLengthM: 10.5 };
  if (type === "hiab-rigid") return { lengthM: 10.5, widthM: 2.55, cabLengthM: 2.8, bedLengthM: 6.5 };
  if (type === "spider-crane") return { lengthM: 5.2, widthM: 1.4 };
  return { lengthM: 12, widthM: 3 };
}

export function createDefaultLiftDrawing({
  machineType = "mobile-crane",
  machineLabel = "",
  drawingNumber = "",
  loadWeightKg = 0,
  accessoryWeightKg = 0,
  accessoryWeightConfirmed = false,
  loadLengthM = 0,
  loadWidthM = 0,
  loadHeightM = 0,
  radiusM = 0,
  boomLengthM = 0,
  boomAngleDeg = 0,
  hookHeightM = 0,
  exactConfiguration = "",
  chartSource = "",
  chartPage = "",
  chartCapacityKg = 0,
  utilisationPercent = 0,
  stabiliserSetup = "",
  workingSector = "",
  workingSectorStartDeg = -15,
  workingSectorEndDeg = 105,
  operatingWeightKg = 0,
  groundPressureKgM2 = 0,
  matLengthM = 1,
  matWidthM = 1,
  liftingAccessories = "",
  siteHazards = "",
  controlMeasures = "",
}: {
  machineType?: LiftMachineType;
  machineLabel?: string;
  drawingNumber?: string;
  loadWeightKg?: number;
  accessoryWeightKg?: number;
  accessoryWeightConfirmed?: boolean;
  loadLengthM?: number;
  loadWidthM?: number;
  loadHeightM?: number;
  radiusM?: number;
  boomLengthM?: number;
  boomAngleDeg?: number;
  hookHeightM?: number;
  exactConfiguration?: string;
  chartSource?: string;
  chartPage?: string;
  chartCapacityKg?: number;
  utilisationPercent?: number;
  stabiliserSetup?: string;
  workingSector?: string;
  workingSectorStartDeg?: number;
  workingSectorEndDeg?: number;
  operatingWeightKg?: number;
  groundPressureKgM2?: number;
  matLengthM?: number;
  matWidthM?: number;
  liftingAccessories?: string;
  siteHazards?: string;
  controlMeasures?: string;
} = {}): LiftDrawingModelV1 {
  const dims = defaultMachineDimensions(machineType);
  const siteWidthM = 40;
  const siteDepthM = 30;
  const machineX = 12;
  const machineY = 15;
  const plannedRadius = radiusM > 0 ? radiusM : 8;
  const centreOffsetM = machineType.startsWith("hiab") ? 2.7 : 0;
  const centreX = machineX + centreOffsetM;
  const centreY = machineY;
  return {
    version: 1,
    drawingNumber,
    revision: "A",
    status: "draft",
    normalisation: { state: "valid", issues: [] },
    scaleMode: "diagrammatic",
    units: "m",
    site: {
      widthM: siteWidthM,
      depthM: siteDepthM,
      northAngleDeg: 0,
      scaleCalibrated: false,
      basis: {
        kind: "blank-grid",
        name: "Blank scaled grid",
        opacity: 0.55,
        rotationDeg: 0,
      },
    },
    machine: {
      type: machineType,
      label: machineLabel,
      hiredIn: false,
      xM: machineX,
      yM: machineY,
      rotationDeg: 0,
      lengthM: dims.lengthM,
      widthM: dims.widthM,
      centreOfRotationOffsetM: centreOffsetM,
      cabLengthM: "cabLengthM" in dims ? dims.cabLengthM : undefined,
      bedLengthM: "bedLengthM" in dims ? dims.bedLengthM : undefined,
      dimensionsVerified: false,
      dimensionsSource: "diagrammatic default",
      supportGeometryVerified: false,
      profileGeometryKey: machineType,
      stabilisers: [
        { id: "front-left", xM: -2.2, yM: -3.5, extensionM: 3.5, padLengthM: matLengthM, padWidthM: matWidthM },
        { id: "front-right", xM: -2.2, yM: 3.5, extensionM: 3.5, padLengthM: matLengthM, padWidthM: matWidthM },
        { id: "rear-left", xM: 2.2, yM: -3.5, extensionM: 3.5, padLengthM: matLengthM, padWidthM: matWidthM },
        { id: "rear-right", xM: 2.2, yM: 3.5, extensionM: 3.5, padLengthM: matLengthM, padWidthM: matWidthM },
      ],
    },
    lift: {
      pick: { xM: centreX + plannedRadius, yM: centreY, levelM: 0 },
      landing: { xM: centreX, yM: centreY + plannedRadius, levelM: 0 },
      loadLengthM: loadLengthM > 0 ? loadLengthM : 0,
      loadWidthM: loadWidthM > 0 ? loadWidthM : 0,
      loadHeightM: loadHeightM > 0 ? loadHeightM : 0,
      loadWeightKg,
      accessoryWeightKg,
      accessoryWeightConfirmed,
      radiusM,
      boomLengthM,
      boomAngleDeg,
      hookHeightM,
      travelPath: [
        { xM: centreX + plannedRadius, yM: centreY },
        { xM: centreX + plannedRadius * 0.7, yM: centreY + plannedRadius * 0.7 },
        { xM: centreX, yM: centreY + plannedRadius },
      ],
      workingSectorStartDeg,
      workingSectorEndDeg,
    },
    technical: {
      exactConfiguration,
      counterweight: "",
      chartSource,
      chartPage,
      chartCapacityKg,
      utilisationPercent,
      stabiliserSetup,
      workingSector,
      operatingWeightKg,
      groundPressureKgM2,
      liftingAccessories,
      siteHazards,
      controlMeasures,
    },
    objects: [],
  };
}
