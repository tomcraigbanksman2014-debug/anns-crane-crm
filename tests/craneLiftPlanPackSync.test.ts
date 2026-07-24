import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLiftPlanPatchFromPackEdits,
  parsePackEditChangedKeys,
  promoteChangedPackTechnicalInputs,
  reapplyChangedPackDisplayOverrides,
} from "../app/lib/craneLiftPlanPackSync";

test("changed pack keys are parsed without duplicates", () => {
  assert.deepEqual(
    parsePackEditChangedKeys(
      '["scope_of_works","ground_conditions","scope_of_works"]',
    ),
    ["scope_of_works", "ground_conditions"],
  );
});

test("only fields actually edited in the PDF pack update the lift-plan record", () => {
  const patch = buildLiftPlanPatchFromPackEdits(
    {
      scope_of_works: "Lift the replacement chiller into position.",
      ground_conditions: "Verified reinforced slab.",
      weather_conditions: "Stop at the selected chart wind limit.",
    },
    ["scope_of_works", "weather_conditions"],
  );

  assert.deepEqual(patch, {
    load_description: "Lift the replacement chiller into position.",
    weather_limitations: "Stop at the selected chart wind limit.",
  });
});

test("personnel and RAMS wording edited in the pack sync to the lift-plan page", () => {
  const patch = buildLiftPlanPatchFromPackEdits(
    {
      personnel_lift_supervisor: "Shaun Robinson",
      personnel_crane_operator: "A Crane Operator",
      lifting_procedure: "Set up, test lift, slew and land under supervision.",
      site_hazards: "Overhead service and restricted public access.",
      control_measures: "Barrier the area and use a dedicated signaller.",
    },
    [
      "personnel_lift_supervisor",
      "personnel_crane_operator",
      "lifting_procedure",
      "site_hazards",
      "control_measures",
    ],
  );

  assert.deepEqual(patch, {
    lift_supervisor: "Shaun Robinson",
    crane_operator: "A Crane Operator",
    method_statement:
      "Set up, test lift, slew and land under supervision.",
    site_hazards: "Overhead service and restricted public access.",
    control_measures:
      "Barrier the area and use a dedicated signaller.",
  });
});

test("edited PDF load and chart capacity become canonical technical values", () => {
  const promoted = promoteChangedPackTechnicalInputs(
    {
      crane_load_weight: "6,000 kg / 6 t",
      crane_lifting_accessories_weight_text: "500 kg",
      crane_max_capacity: "10,000 kg / 10 t",
    },
    [
      "crane_load_weight",
      "crane_lifting_accessories_weight_text",
      "crane_max_capacity",
    ],
  );

  assert.equal(promoted.range_chart_load_weight_kg, "6000");
  assert.equal(promoted.range_chart_accessory_weight_kg, "500");
  assert.equal(promoted.range_chart_total_lifted_weight_kg, "6500");
  assert.equal(promoted.range_chart_chart_capacity_kg, "10000");
  assert.equal(promoted.range_chart_utilisation_percent, "65");
  assert.equal(promoted.range_chart_capacity_method, "manual");
  assert.match(
    String(promoted.range_chart_verification_note),
    /must be verified/i,
  );
});

test("edited mat dimensions and bearing load recalculate the stored pressure", () => {
  const promoted = promoteChangedPackTechnicalInputs(
    {
      ground_bearing_mat_size:
        "1.2m x 1.0m × 2 under worst-case loaded outrigger",
      ground_bearing_bearing_load: "24,000 kg / 24 t",
    },
    ["ground_bearing_mat_size", "ground_bearing_bearing_load"],
  );

  assert.equal(promoted.range_chart_mat_length_m, "1.2");
  assert.equal(promoted.range_chart_mat_width_m, "1.0");
  assert.equal(promoted.range_chart_mats_under_loaded_outrigger, "2");
  assert.equal(promoted.range_chart_mat_area_m2, "2.4");
  assert.equal(promoted.range_chart_bearing_load_kg, "24000");
  assert.equal(promoted.range_chart_bearing_pressure_kg_m2, "10000");
});

test("an unrelated PDF edit leaves saved technical values untouched", () => {
  const existing = {
    scope_of_works: "Original scope",
    range_chart_load_weight_kg: "6000",
    range_chart_accessory_weight_kg: "500",
    range_chart_total_lifted_weight_kg: "6500",
    range_chart_chart_capacity_kg: "10000",
    range_chart_utilisation_percent: "65",
  };

  const promoted = promoteChangedPackTechnicalInputs(
    { ...existing, scope_of_works: "Updated scope" },
    ["scope_of_works"],
  );

  assert.equal(promoted.range_chart_total_lifted_weight_kg, "6500");
  assert.equal(promoted.range_chart_chart_capacity_kg, "10000");
  assert.equal(promoted.range_chart_utilisation_percent, "65");
});

test("editing only the PDF load keeps the saved accessory weight in the recalculation", () => {
  const promoted = promoteChangedPackTechnicalInputs(
    {
      crane_load_weight: "7,000 kg",
      range_chart_load_weight_kg: "6000",
      range_chart_accessory_weight_kg: "500",
      range_chart_total_lifted_weight_kg: "6500",
      range_chart_chart_capacity_kg: "10000",
      range_chart_utilisation_percent: "65",
      range_chart_bearing_load_kg: "34875",
      range_chart_bearing_method: "automatic",
      range_chart_bearing_source:
        "Worst-case ground-bearing planning estimate using existing lift-plan formula",
      range_chart_mat_length_m: "1",
      range_chart_mat_width_m: "1",
      range_chart_mats_under_loaded_outrigger: "1",
    },
    ["crane_load_weight"],
  );

  assert.equal(promoted.range_chart_load_weight_kg, "7000");
  assert.equal(promoted.range_chart_accessory_weight_kg, "500");
  assert.equal(promoted.range_chart_total_lifted_weight_kg, "7500");
  assert.equal(promoted.range_chart_chart_capacity_kg, null);
  assert.equal(promoted.range_chart_bearing_load_kg, "35625");
  assert.equal(promoted.range_chart_bearing_pressure_kg_m2, "35625");
});

test("editing only the PDF mat count recalculates support area and pressure", () => {
  const promoted = promoteChangedPackTechnicalInputs(
    {
      ground_bearing_mat_count: "2",
      range_chart_mat_length_m: "1.2",
      range_chart_mat_width_m: "1",
      range_chart_mats_under_loaded_outrigger: "1",
      range_chart_bearing_load_kg: "24000",
    },
    ["ground_bearing_mat_count"],
  );

  assert.equal(promoted.range_chart_mats_under_loaded_outrigger, "2");
  assert.equal(promoted.range_chart_mat_area_m2, "2.4");
  assert.equal(promoted.range_chart_bearing_pressure_kg_m2, "10000");
});


test("explicit PDF narrative overrides survive the calculation synchroniser", () => {
  const merged = reapplyChangedPackDisplayOverrides(
    {
      boom_configuration: "Main boom",
      crane_jib_reference: "No jib / main boom only",
      ground_bearing_notes: "Calculated formula",
    },
    {
      boom_configuration: "AP-approved alternative boom arrangement",
      crane_jib_reference: "Supplier extension arrangement",
      ground_bearing_notes: "AP note entered in the PDF pack",
    },
    [
      "boom_configuration",
      "crane_jib_reference",
      "ground_bearing_notes",
    ],
  );

  assert.equal(
    merged.boom_configuration,
    "AP-approved alternative boom arrangement",
  );
  assert.equal(
    merged.crane_jib_reference,
    "Supplier extension arrangement",
  );
  assert.equal(
    merged.ground_bearing_notes,
    "AP note entered in the PDF pack",
  );
});
