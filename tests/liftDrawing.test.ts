import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createDefaultLiftDrawing } from "../app/components/lift-drawing/defaults";
import LiftArrangementDrawing from "../app/components/lift-drawing/LiftArrangementDrawing";
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
import {
  buildTransportLiftPlanContext,
  extractLoadMeasurements,
} from "../app/lib/transportLiftPlanDefaults";
import {
  parseNormalisedTechnicalPlan,
  technicalPlanToSchedule,
} from "../app/lib/normalisedLiftTechnicalPlan";

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
  model.scaleMode = "verified-scale";
  model.site.scaleCalibrated = true;
  model.site.calibrationDistanceM = 10;
  model.machine.dimensionsVerified = true;
  model.machine.dimensionsSource = "Verified Palfinger PK 65002-SH E profile";
  model.machine.supportGeometryVerified = true;
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
  assert.deepEqual(
    JSON.parse(serialiseLiftDrawingModel(parsed)),
    JSON.parse(serialiseLiftDrawingModel(model)),
  );
});

test("partial legacy drawing is rebuilt as a safe draft without throwing", () => {
  const parsed = parseLiftDrawingModel(JSON.stringify({
    version: 1,
    drawingNumber: "LEGACY-001",
    machine: {
      label: "Legacy HIAB",
      stabilisers: [{ id: "one", xM: 0, yM: 0 }],
    },
    lift: {
      loadWeightKg: 2_000,
      travelPath: [{ xM: 1, yM: 1 }],
    },
  }));
  assert.equal(parsed.status, "draft");
  assert.equal(parsed.normalisation?.state, "migrated");
  assert.equal(parsed.machine.stabilisers.length, 4);
  assert.ok(parsed.lift.travelPath.length >= 2);
  assert.ok(parsed.normalisation?.issues.length);
});

test("malformed drawing JSON is rebuilt as an invalid safe draft", () => {
  const parsed = parseLiftDrawingModel("{not-json");
  assert.equal(parsed.status, "draft");
  assert.equal(parsed.normalisation?.state, "invalid");
  assert.equal(parsed.machine.stabilisers.length, 4);
  assert.ok(parsed.site.widthM > 0);
});

test("partial normalised HIAB data is rebuilt safely for the pack", () => {
  const plan = parseNormalisedTechnicalPlan(JSON.stringify({
    schema: "anns-lift-technical-plan",
    version: 2,
    planType: "hiab",
    revision: "A",
    machine: {
      title: "HIAB X-HIPRO 858",
      exactConfiguration: "EP-6",
    },
    load: {
      description: "Steel frame",
      loadWeightKg: "6000",
      accessoryLabels: "chains, shackles",
    },
    duty: {
      worstCaseRadiusM: "8",
    },
    validation: {
      errors: "Chart page still requires AP verification",
    },
  }));

  assert.ok(plan);
  assert.equal(plan.machine.exactConfiguration, "EP-6");
  assert.equal(plan.machine.supportConfiguration.label, "");
  assert.equal(plan.machine.workingSector.startDeg, 0);
  assert.deepEqual(plan.load.accessoryLabels, ["chains", "shackles"]);
  assert.deepEqual(plan.validation.errors, [
    "Chart page still requires AP verification",
  ]);

  const schedule = technicalPlanToSchedule(plan);
  assert.equal(schedule.loadWeightKg, 6000);
  assert.equal(schedule.radiusM, 8);
  assert.equal(schedule.stabiliserSetup, "");
  assert.equal(schedule.workingSector, "");
});

test("invalid normalised technical data uses the legacy fallback", () => {
  assert.equal(parseNormalisedTechnicalPlan("{not-json"), null);
  assert.equal(parseNormalisedTechnicalPlan({
    schema: "wrong-schema",
    version: 2,
  }), null);
});

test("empty and unsupported drawing values never throw", () => {
  for (const value of [null, "", [], 42, { version: 99 }]) {
    const parsed = parseLiftDrawingModel(value);
    assert.equal(parsed.status, "draft");
    assert.equal(parsed.machine.stabilisers.length, 4);
  }
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

test("PRO STEEL transport description populates the load dimensions and weight", () => {
  const measurements = extractLoadMeasurements(
    "Frames for Wall panels/cladding.\n4540mm 9000mm 2340mm 6t",
  );
  assert.deepEqual(measurements, {
    loadLengthM: 9,
    loadWidthM: 4.54,
    loadHeightM: 2.34,
    loadWeightKg: 6000,
  });
  const context = buildTransportLiftPlanContext({
    job: {
      transport_number: "TR-20260416-125330",
      load_description: "4540mm 9000mm 2340mm 6t",
    },
    vehicle: {
      name: "Artic HIAB",
      vehicle_type: "Artic HIAB",
      reg_number: "SN74 XPX",
    },
  });
  assert.equal(context.loadWeightKg, 6000);
  assert.equal(context.loadLengthM, 9);
  assert.equal(context.vehicleLabel, "Artic HIAB SN74 XPX");
});

test("new HIAB drawing starts at the exact saved radius from the centre of rotation", () => {
  const model = createDefaultLiftDrawing({
    machineType: "hiab-artic",
    machineLabel: "HIAB X-HIPRO 858 EP-6",
    radiusM: 12,
  });
  assert.equal(liftRadii(model).maximumRadiusM, 12);
});

test("print drawing server-renders without client event handlers", () => {
  const model = completeModel();
  const html = renderToStaticMarkup(
    createElement(LiftArrangementDrawing, {
      model,
      client: "PRO STEEL",
      project: "Transport lift",
      jobNumber: "TR-20260416-125330",
      view: "plan",
    }),
  );
  assert.match(html, /PLAN VIEW/);
  assert.match(html, /PICK/);
  assert.doesNotMatch(html, /onpointerdown/i);
});

test("partial and malformed drawings server-render as marked drafts", () => {
  for (const value of [
    "{not-json",
    JSON.stringify({ version: 1, machine: { label: "Recovered machine" } }),
  ]) {
    const html = renderToStaticMarkup(
      createElement(LiftArrangementDrawing, {
        model: parseLiftDrawingModel(value),
        client: "PRO STEEL",
        project: "Recovered transport lift",
        jobNumber: "TR-RECOVERY",
        view: "plan",
      }),
    );
    assert.match(html, /DRAFT/);
    assert.doesNotMatch(html, /onpointerdown/i);
  }
});
