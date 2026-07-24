import {
  allLiftPoints,
  angleWithinSector,
  boomTipGeometry,
  liftRadii,
  machineCentreOfRotation,
  nearestOverheadClearanceM,
  pointAngleDeg,
  roundTo,
} from "../components/lift-drawing/geometry";
import type {
  LiftDrawingModelV1,
  LiftDrawingValidation,
  LiftTechnicalSchedule,
} from "../components/lift-drawing/types";
import { parseLiftDrawingModel } from "./liftDrawingPersistence";

function positive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegative(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function present(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

export function validateLiftDrawing(
  model: LiftDrawingModelV1,
  schedule: LiftTechnicalSchedule,
): LiftDrawingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const radii = liftRadii(model);
  const boomTip = boomTipGeometry(model);
  const grossLiftedWeightKg =
    Math.max(0, Number(model.lift.loadWeightKg) || 0) +
    Math.max(0, Number(model.lift.accessoryWeightKg) || 0);
  const overheadClearance = nearestOverheadClearanceM(model);
  const centre = machineCentreOfRotation(model);

  if (
    model.normalisation?.state === "invalid" ||
    model.normalisation?.state === "migrated"
  ) {
    errors.push(
      "Review and re-save the restored drawing data before verification.",
    );
  }
  if (model.scaleMode !== "verified-scale" || !model.site.scaleCalibrated) {
    errors.push("Calibrate the site drawing to a verified scale.");
  }
  if (!present(model.drawingNumber)) errors.push("Enter a drawing number.");
  if (!present(model.revision)) errors.push("Enter a drawing revision.");
  if (!positive(model.site.widthM) || !positive(model.site.depthM)) errors.push("Enter the verified site width and depth.");
  if (!present(model.machine.label)) errors.push("Confirm the exact machine.");
  if (!positive(model.machine.lengthM) || !positive(model.machine.widthM)) errors.push("Enter the actual machine length and width.");
  if (!model.machine.dimensionsVerified || !present(model.machine.dimensionsSource)) {
    errors.push("Verify the machine dimensions against the selected machine profile or supplier document.");
  }
  if (!model.machine.supportGeometryVerified) {
    errors.push("Verify the stabiliser/outrigger geometry for the selected configuration.");
  }
  if (model.machine.stabilisers.length < 4) errors.push("Record all four stabiliser/outrigger positions.");
  if (model.machine.stabilisers.some((item) => !positive(item.padLengthM) || !positive(item.padWidthM))) {
    errors.push("Enter pad/mat dimensions for every stabiliser.");
  }
  if (!positive(model.lift.loadLengthM) || !positive(model.lift.loadWidthM) || !positive(model.lift.loadHeightM)) {
    errors.push("Enter the exact load length, width and height.");
  }
  if (!positive(model.lift.loadWeightKg)) errors.push("Enter the load weight on the drawing.");
  if (nonNegative(model.lift.accessoryWeightKg) === null || !model.lift.accessoryWeightConfirmed) {
    errors.push("Confirm the lifting-accessory weight, including when it is zero.");
  }
  if (!positive(model.lift.boomLengthM) || !positive(model.lift.hookHeightM)) errors.push("Enter boom length and hook height.");
  if (model.lift.travelPath.length < 2) errors.push("Define the load travel path from pick to landing.");
  if (!present(model.technical.exactConfiguration)) errors.push("Confirm the exact machine configuration.");
  if (!present(model.technical.chartSource) || !present(model.technical.chartPage)) errors.push("Record the manufacturer/supplier chart source and page.");
  if (!positive(model.technical.chartCapacityKg)) errors.push("Enter the chart capacity at the planned radius.");
  if (!positive(model.technical.utilisationPercent)) errors.push("Confirm the chart utilisation.");
  if (!present(model.technical.stabiliserSetup)) errors.push("Record the stabiliser/outrigger setup.");
  if (!present(model.technical.workingSector)) errors.push("Record the permitted working sector.");
  if (!positive(model.technical.operatingWeightKg) && !positive(model.technical.supportReactionKg)) {
    errors.push("Enter the operating/gross planning weight or a published support reaction.");
  }
  if (!positive(model.technical.groundPressureKgM2)) errors.push("Enter the calculated worst-case ground pressure.");
  if (!present(model.technical.liftingAccessories)) errors.push("Record the lifting accessories/method.");
  if (!present(model.technical.siteHazards) || !present(model.technical.controlMeasures)) {
    errors.push("Record the site hazards and control measures.");
  }

  const scheduleRadius = positive(schedule.radiusM);
  if (scheduleRadius && Math.abs(radii.maximumRadiusM - scheduleRadius) > 0.1) {
    errors.push(`Drawing maximum radius ${radii.maximumRadiusM.toFixed(2)} m does not match the technical schedule ${scheduleRadius.toFixed(2)} m.`);
  }
  const scheduleLoad = positive(schedule.loadWeightKg);
  if (scheduleLoad && Math.abs(model.lift.loadWeightKg - scheduleLoad) > 1) {
    errors.push(`Drawing load weight ${model.lift.loadWeightKg.toLocaleString("en-GB")} kg does not match the technical schedule ${scheduleLoad.toLocaleString("en-GB")} kg.`);
  }
  const scheduleAccessory = nonNegative(schedule.accessoryWeightKg);
  if (scheduleAccessory !== null && Math.abs(model.lift.accessoryWeightKg - scheduleAccessory) > 1) {
    errors.push("Drawing lifting-accessory weight does not match the technical schedule.");
  }
  const scheduleBoom = positive(schedule.boomLengthM);
  if (scheduleBoom && Math.abs(model.lift.boomLengthM - scheduleBoom) > 0.1) errors.push("Drawing boom length does not match the technical schedule.");
  const scheduleHeight = positive(schedule.hookHeightM);
  if (scheduleHeight && Math.abs(model.lift.hookHeightM - scheduleHeight) > 0.1) errors.push("Drawing hook height does not match the technical schedule.");
  const scheduleCapacity = positive(schedule.chartCapacityKg);
  if (scheduleCapacity && Math.abs(model.technical.chartCapacityKg - scheduleCapacity) > 1) errors.push("Drawing chart capacity does not match the technical schedule.");
  if (scheduleCapacity && grossLiftedWeightKg > scheduleCapacity) errors.push("Gross lifted load exceeds the selected chart capacity.");
  if (schedule.matLengthM && model.machine.stabilisers.some((item) => Math.abs(item.padLengthM - Number(schedule.matLengthM)) > 0.01)) {
    errors.push("Drawing pad/mat length does not match the ground-bearing calculation.");
  }
  if (schedule.matWidthM && model.machine.stabilisers.some((item) => Math.abs(item.padWidthM - Number(schedule.matWidthM)) > 0.01)) {
    errors.push("Drawing pad/mat width does not match the ground-bearing calculation.");
  }

  const outsideSector = allLiftPoints(model).some((point) => !angleWithinSector(
    pointAngleDeg(centre, point),
    model.lift.workingSectorStartDeg,
    model.lift.workingSectorEndDeg,
  ));
  if (outsideSector) errors.push("Pick point, travel path or landing point lies outside the permitted working sector.");
  if (overheadClearance !== null && overheadClearance < 3) {
    warnings.push(`Overhead-service clearance is only ${overheadClearance.toFixed(2)} m; verify the applicable safe-clearance requirement.`);
  }
  if (Math.abs(boomTip.radiusM - radii.maximumRadiusM) > 0.25) {
    warnings.push("Boom-tip geometry does not closely match the maximum plan radius.");
  }
  if (model.machine.hiredIn) {
    if (
      !present(model.machine.supplier) ||
      !present(model.machine.make) ||
      !present(model.machine.model) ||
      !present(model.machine.serialOrFleetReference)
    ) {
      errors.push("Enter the hired-machine supplier, make, model and serial/fleet reference.");
    }
    if (!present(model.technical.counterweight)) {
      errors.push("Record the hired-machine counterweight/ballast configuration.");
    }
    if (!present(model.technical.hiredMachineVerifiedBy) || !present(model.technical.hiredMachineVerifiedAt)) {
      errors.push("Record who verified the hired-machine data and the verification date.");
    }
    if (!present(model.technical.currentLolerReference)) errors.push("Record the hired machine's current LOLER reference.");
  }
  if (model.status === "verified" && errors.length) errors.push("Drawing cannot remain verified while validation errors exist.");

  return {
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    calculated: {
      pickRadiusM: radii.pickRadiusM,
      landingRadiusM: radii.landingRadiusM,
      maximumRadiusM: radii.maximumRadiusM,
      boomTipRadiusM: boomTip.radiusM,
      boomTipHeightM: boomTip.heightM,
      grossLiftedWeightKg: roundTo(grossLiftedWeightKg, 1),
      minimumOverheadClearanceM: overheadClearance,
    },
  };
}

export function liftDrawingApprovalErrors(
  drawingValue: unknown,
  schedule: LiftTechnicalSchedule,
) {
  const model = parseLiftDrawingModel(drawingValue);
  const result = validateLiftDrawing(model, schedule);
  const errors = [...result.errors];
  if (model.status !== "verified") errors.push("Mark the technical drawing verified.");
  if (!model.verifiedBy || !model.verifiedAt) errors.push("Record who verified the technical drawing and when.");
  if (!present(schedule.loadDescription)) errors.push("Enter the load description.");
  if (!positive(schedule.loadWeightKg)) errors.push("Enter the technical load weight.");
  if (nonNegative(schedule.accessoryWeightKg) === null) errors.push("Enter the lifting-accessory weight.");
  if (!positive(schedule.grossLiftedWeightKg)) errors.push("Confirm the gross lifted load.");
  if (!present(schedule.exactConfiguration) && !present(model.technical.exactConfiguration)) {
    errors.push("Confirm the exact machine/configuration.");
  }
  if (!positive(schedule.radiusM)) errors.push("Enter the planned radius.");
  if (
    !positive(schedule.chartCapacityKg ?? model.technical.chartCapacityKg) ||
    !present(schedule.chartSource ?? model.technical.chartSource) ||
    !present(schedule.chartPage ?? model.technical.chartPage)
  ) {
    errors.push("Record the chart capacity, source and page.");
  }
  if (!positive(schedule.utilisationPercent ?? model.technical.utilisationPercent)) {
    errors.push("Confirm utilisation.");
  }
  if (
    !present(schedule.stabiliserSetup ?? model.technical.stabiliserSetup) ||
    !present(schedule.workingSector ?? model.technical.workingSector)
  ) {
    errors.push("Record the stabiliser setup and permitted working sector.");
  }
  if (
    !positive(schedule.operatingWeightKg ?? model.technical.operatingWeightKg) &&
    !positive(model.technical.supportReactionKg)
  ) {
    errors.push("Enter the operating/gross planning weight or a published support reaction.");
  }
  const padsComplete = model.machine.stabilisers.every(
    (item) => positive(item.padLengthM) && positive(item.padWidthM),
  );
  if (
    (!positive(schedule.matLengthM) || !positive(schedule.matWidthM)) &&
    !padsComplete
  ) {
    errors.push("Complete the mat/pad dimensions.");
  }
  if (!positive(schedule.groundPressureKgM2 ?? model.technical.groundPressureKgM2)) {
    errors.push("Complete the mat/pad dimensions and ground-pressure calculation.");
  }
  if (!present(schedule.liftingAccessories)) errors.push("Record the lifting accessories/method.");
  if (!present(schedule.siteHazards) || !present(schedule.controlMeasures)) errors.push("Record site hazards and controls.");
  return Array.from(new Set(errors));
}
