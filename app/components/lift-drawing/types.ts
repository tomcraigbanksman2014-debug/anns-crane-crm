export type LiftMachineType =
  | "mobile-crane"
  | "spider-crane"
  | "hiab-rigid"
  | "hiab-artic";

export type LiftPoint = {
  xM: number;
  yM: number;
  levelM: number;
};

export type LiftDrawingObject =
  | {
      id: string;
      type:
        | "building"
        | "road"
        | "pedestrian-route"
        | "exclusion-zone"
        | "underground-service";
      xM: number;
      yM: number;
      widthM: number;
      depthM: number;
      heightM?: number;
      rotationDeg: number;
      label: string;
    }
  | {
      id: string;
      type: "line" | "fence" | "dimension";
      x1M: number;
      y1M: number;
      x2M: number;
      y2M: number;
      label: string;
    }
  | {
      id: string;
      type: "polyline" | "polygon";
      points: Array<{ xM: number; yM: number }>;
      label: string;
    }
  | {
      id: string;
      type: "overhead-service";
      x1M: number;
      y1M: number;
      x2M: number;
      y2M: number;
      heightM: number;
      label: string;
    }
  | {
      id: string;
      type: "note";
      xM: number;
      yM: number;
      text: string;
    };

export type LiftDrawingModelV1 = {
  version: 1;
  normalisation?: {
    state: "valid" | "migrated" | "invalid";
    issues: string[];
  };
  drawingNumber: string;
  revision: string;
  status: "draft" | "verified";
  preparedBy?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  scaleMode: "verified-scale" | "diagrammatic";
  units: "m";
  site: {
    widthM: number;
    depthM: number;
    northAngleDeg: number;
    scaleCalibrated?: boolean;
    calibrationDistanceM?: number;
    basis?: {
      kind: "blank-grid" | "image" | "pdf-page" | "dxf-reference";
      name: string;
      dataUrl?: string;
      sourceUrl?: string;
      pageNumber?: number;
      opacity: number;
      rotationDeg: number;
    };
  };
  machine: {
    type: LiftMachineType;
    label: string;
    make?: string;
    model?: string;
    hiredIn: boolean;
    supplier?: string;
    serialOrFleetReference?: string;
    xM: number;
    yM: number;
    rotationDeg: number;
    lengthM: number;
    widthM: number;
    centreOfRotationOffsetM: number;
    cabLengthM?: number;
    bedLengthM?: number;
    dimensionsVerified?: boolean;
    dimensionsSource?: string;
    supportGeometryVerified?: boolean;
    profileGeometryKey?: string;
    stabilisers: Array<{
      id: string;
      xM: number;
      yM: number;
      extensionM: number;
      padLengthM: number;
      padWidthM: number;
    }>;
  };
  lift: {
    pick: LiftPoint;
    landing: LiftPoint;
    loadLengthM: number;
    loadWidthM: number;
    loadHeightM: number;
    loadWeightKg: number;
    accessoryWeightKg: number;
    accessoryWeightConfirmed: boolean;
    radiusM: number;
    boomLengthM: number;
    boomAngleDeg: number;
    hookHeightM: number;
    travelPath: Array<{ xM: number; yM: number }>;
    workingSectorStartDeg: number;
    workingSectorEndDeg: number;
  };
  technical: {
    exactConfiguration: string;
    counterweight: string;
    chartSource: string;
    chartPage: string;
    chartCapacityKg: number;
    utilisationPercent: number;
    stabiliserSetup: string;
    workingSector: string;
    operatingWeightKg: number;
    supportReactionKg?: number;
    supportReactionSource?: string;
    groundPressureKgM2: number;
    liftingAccessories: string;
    siteHazards: string;
    controlMeasures: string;
    hiredMachineVerifiedBy?: string;
    hiredMachineVerifiedAt?: string;
    currentLolerReference?: string;
  };
  objects: LiftDrawingObject[];
};

export type LiftTechnicalSchedule = {
  loadDescription?: string | null;
  loadWeightKg?: number | null;
  accessoryWeightKg?: number | null;
  accessoryWeightConfirmed?: boolean | null;
  grossLiftedWeightKg?: number | null;
  loadLengthM?: number | null;
  loadWidthM?: number | null;
  loadHeightM?: number | null;
  radiusM?: number | null;
  boomLengthM?: number | null;
  boomAngleDeg?: number | null;
  hookHeightM?: number | null;
  chartCapacityKg?: number | null;
  chartSource?: string | null;
  chartPage?: string | null;
  utilisationPercent?: number | null;
  exactConfiguration?: string | null;
  stabiliserSetup?: string | null;
  workingSector?: string | null;
  workingSectorStartDeg?: number | null;
  workingSectorEndDeg?: number | null;
  operatingWeightKg?: number | null;
  groundPressureKgM2?: number | null;
  matLengthM?: number | null;
  matWidthM?: number | null;
  liftingAccessories?: string | null;
  siteHazards?: string | null;
  controlMeasures?: string | null;
};

export type LiftDrawingValidation = {
  errors: string[];
  warnings: string[];
  calculated: {
    pickRadiusM: number;
    landingRadiusM: number;
    maximumRadiusM: number;
    boomTipRadiusM: number;
    boomTipHeightM: number;
    grossLiftedWeightKg: number;
    minimumOverheadClearanceM: number | null;
  };
};
