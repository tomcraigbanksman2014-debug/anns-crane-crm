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
  radiusM = 0,
  boomLengthM = 0,
  boomAngleDeg = 0,
  hookHeightM = 0,
}: {
  machineType?: LiftMachineType;
  machineLabel?: string;
  drawingNumber?: string;
  loadWeightKg?: number;
  accessoryWeightKg?: number;
  radiusM?: number;
  boomLengthM?: number;
  boomAngleDeg?: number;
  hookHeightM?: number;
} = {}): LiftDrawingModelV1 {
  const dims = defaultMachineDimensions(machineType);
  const siteWidthM = 40;
  const siteDepthM = 30;
  const machineX = 12;
  const machineY = 15;
  const plannedRadius = radiusM > 0 ? radiusM : 8;
  return {
    version: 1,
    drawingNumber,
    revision: "A",
    status: "draft",
    scaleMode: "verified-scale",
    units: "m",
    site: { widthM: siteWidthM, depthM: siteDepthM, northAngleDeg: 0 },
    machine: {
      type: machineType,
      label: machineLabel,
      hiredIn: false,
      xM: machineX,
      yM: machineY,
      rotationDeg: 0,
      lengthM: dims.lengthM,
      widthM: dims.widthM,
      centreOfRotationOffsetM: machineType.startsWith("hiab") ? 2.7 : 0,
      cabLengthM: "cabLengthM" in dims ? dims.cabLengthM : undefined,
      bedLengthM: "bedLengthM" in dims ? dims.bedLengthM : undefined,
      stabilisers: [
        { id: "front-left", xM: -2.2, yM: -3.5, extensionM: 3.5, padLengthM: 1, padWidthM: 1 },
        { id: "front-right", xM: -2.2, yM: 3.5, extensionM: 3.5, padLengthM: 1, padWidthM: 1 },
        { id: "rear-left", xM: 2.2, yM: -3.5, extensionM: 3.5, padLengthM: 1, padWidthM: 1 },
        { id: "rear-right", xM: 2.2, yM: 3.5, extensionM: 3.5, padLengthM: 1, padWidthM: 1 },
      ],
    },
    lift: {
      pick: { xM: machineX + plannedRadius, yM: machineY, levelM: 0 },
      landing: { xM: machineX, yM: machineY + plannedRadius, levelM: 0 },
      loadLengthM: 1,
      loadWidthM: 1,
      loadHeightM: 1,
      loadWeightKg,
      accessoryWeightKg,
      accessoryWeightConfirmed: accessoryWeightKg > 0,
      radiusM,
      boomLengthM,
      boomAngleDeg,
      hookHeightM,
      travelPath: [
        { xM: machineX + plannedRadius, yM: machineY },
        { xM: machineX + plannedRadius * 0.7, yM: machineY + plannedRadius * 0.7 },
        { xM: machineX, yM: machineY + plannedRadius },
      ],
      workingSectorStartDeg: -15,
      workingSectorEndDeg: 105,
    },
    technical: {
      exactConfiguration: "",
      counterweight: "",
      chartSource: "",
      chartPage: "",
      chartCapacityKg: 0,
      utilisationPercent: 0,
      stabiliserSetup: "",
      workingSector: "",
      operatingWeightKg: 0,
      groundPressureKgM2: 0,
      liftingAccessories: "",
      siteHazards: "",
      controlMeasures: "",
    },
    objects: [],
  };
}
