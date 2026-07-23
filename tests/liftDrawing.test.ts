import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultLiftDrawing } from "../app/components/lift-drawing/defaults";
import {
  liftRadii,
  machineCentreOfRotation,
} from "../app/components/lift-drawing/geometry";
import {
  parseLiftDrawingModel,
  serialiseLiftDrawingModel,
} from "../app/lib/liftDrawingPersistence";
import {
  liftDrawingApprovalErrors,
  validateLiftDrawing,
} from "../app/lib/liftDrawingValidation";

function completeModel() {
  const model = createDefaultLiftDrawing({
    machineType: "hiab-rigid",
    machineLabel: "Palfinger PK 65002-SH E / SF25 XNB",
    drawingNumber: "HIAB-TEST-001",
    loadWeightKg: 2_000,
    accessoryWeightKg: 150,
    radiusM: 8,
    boomLengthM: 12,
    boomAngleDeg: 48,
    hookHeightM: 8.9,
  });
  model.lift.accessoryWeightConfirmed = true;
  model.lift.loadLengthM = 6;
  model.lift.loadWidthM = 2.4;
  model.lift.loadHeightM = 2.6;
  model.lift.pick = { xM: 22.7, yM: 15, levelM: 0 };
  model.lift.landing = { xM: 14.7, yM: 23, levelM: 0 };
  model.lift.travelPath = [
    { xM: 22.7, yM: 15 },
    { xM: 20.36, yM: 20.66 },
    { xM: 14.7, yM: 23 },
  ];
  model.technical.exactConfiguration = "PK 65002-SH E, main boom only";
  model.technical.chartSource = "Palfinger PK 65002-SH load chart";
  model.technical.chartPage = "E configuration, page 7";
  model.technical.chartCapacityKg = 6_800;
  model.technical.utilisationPercent = 31.6;
  model.technical.stabiliserSetup = "Full stabiliser spread";
  model.technical.workingSector = "Near-side sector 0-105 degrees";
  model.technical.operatingWeightKg = 32_000;
  model.technical.groundPressureKgM2 = 7_200;
  model.technical.liftingAccessories = "4-leg chain sling and certified shackles";
  model.technical.siteHazards = "Public road and overhead lighting columns";
  model.technical.controlMeasures = "Traffic management and controlled exclusion zone";
  model.verifiedBy = "Appointed Person";
  model.verifiedAt = "2026-07-23T12:00:00.000Z";
  model.status = "verified";
  return model;
}

function schedule() {
  return {
    loadDescription: "Steel frame",
    loadWeightKg: 2_000,
    accessoryWeightKg: 150,
    grossLiftedWeightKg: 2_150,
    radiusM: 8,
    boomLengthM: 12,
    hookHeightM: 8.9,
    chartCapacityKg: 6_800,
    chartSource: "Palfinger PK 65002-SH load chart",
    chartPage: "E configuration, page 7",
    utilisationPercent: 31.6,
    exactConfiguration: "PK 65002-SH E, main boom only",
    stabiliserSetup: "Full stabiliser spread",
    workingSector: "Near-side sector 0-105 degrees",
    operatingWeightKg: 32_000,
    groundPressureKgM2: 7_200,
    matLengthM: 1,
    matWidthM: 1,
    liftingAccessories: "4-leg chain sling and certified shackles",
    siteHazards: "Public road and overhead lighting columns",
    controlMeasures: "Traffic management and controlled exclusion zone",
  };
}

test("versioned drawing survives JSON round-trip without changing AP data", () => {
  const model = completeModel();
  const parsed = parseLiftDrawingModel(serialiseLiftDrawingModel(model));
  assert.deepEqual(parsed, model);
});

test("complete verified drawing passes strict approval validation", () => {
  const model = completeModel();
  assert.deepEqual(validateLiftDrawing(model, schedule()).errors, []);
  assert.deepEqual(liftDrawingApprovalErrors(model, schedule()), []);
});

test("geometry uses the saved centre of rotation and travel path", () => {
  const model = completeModel();
  const centre = machineCentreOfRotation(model);
  const radii = liftRadii(model);
  assert.equal(centre.xM, 14.7);
  assert.equal(centre.yM, 15);
  assert.equal(radii.maximumRadiusM, 8);
});

test("drawing cannot be approved when saved duty and drawing radius disagree", () => {
  const model = completeModel();
  const result = liftDrawingApprovalErrors(model, {
    ...schedule(),
    radiusM: 12,
  });
  assert.ok(result.some((error) => error.includes("does not match the technical schedule")));
});

test("hired machine requires supplier, identity, LOLER and verification", () => {
  const model = completeModel();
  model.machine.hiredIn = true;
  model.machine.supplier = "";
  model.machine.serialOrFleetReference = "";
  model.technical.hiredMachineVerifiedBy = "";
  model.technical.hiredMachineVerifiedAt = "";
  model.technical.currentLolerReference = "";
  const result = validateLiftDrawing(model, schedule());
  assert.ok(result.errors.some((error) => error.includes("supplier, make, model")));
  assert.ok(result.errors.some((error) => error.includes("verified the hired-machine")));
  assert.ok(result.errors.some((error) => error.includes("LOLER")));
});

test("editing technical geometry invalidates a previously verified drawing", () => {
  const model = completeModel();
  model.lift.boomLengthM = 0;
  const result = validateLiftDrawing(model, schedule());
  assert.ok(result.errors.some((error) => error.includes("boom length")));
  assert.ok(result.errors.some((error) => error.includes("cannot remain verified")));
});

test("PRO STEEL regression: a 6,000 kg job cannot be completed with blank technical duty", () => {
  const model = createDefaultLiftDrawing({
    machineType: "hiab-rigid",
    machineLabel: "Test HIAB",
    drawingNumber: "PRO-STEEL-REGRESSION",
  });
  const result = liftDrawingApprovalErrors(model, {
    loadDescription: "6,000 kg steel load",
    loadWeightKg: 6_000,
    accessoryWeightKg: null,
    grossLiftedWeightKg: null,
    radiusM: null,
    chartCapacityKg: null,
    chartSource: null,
    chartPage: null,
  });
  assert.ok(result.some((error) => error.includes("load weight on the drawing")));
  assert.ok(result.some((error) => error.includes("lifting-accessory weight")));
  assert.ok(result.some((error) => error.includes("gross lifted load")));
  assert.ok(result.some((error) => error.includes("planned radius")));
  assert.ok(result.some((error) => error.includes("chart capacity, source and page")));
});
