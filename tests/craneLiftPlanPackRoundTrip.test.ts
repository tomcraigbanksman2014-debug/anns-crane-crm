import assert from "node:assert/strict";
import test from "node:test";
import { prepareCranePackSavePayload } from "../app/api/jobs/[id]/lift-plan/pack-selections/route";

const initialSections = {
  scope_of_works: "Original scope",
  weather_conditions: "Original weather wording",
  range_chart_load_weight_kg: "6000",
  range_chart_accessory_weight_kg: "500",
  range_chart_total_lifted_weight_kg: "6500",
  range_chart_radius_m: "10",
  range_chart_tip_height_m: "12",
  range_chart_chart_capacity_kg: "10000",
  range_chart_utilisation_percent: "65",
  range_chart_bearing_load_kg: "34875",
  range_chart_bearing_method: "automatic",
  range_chart_bearing_source:
    "Worst-case ground-bearing planning estimate using existing lift-plan formula",
  range_chart_mat_length_m: "1.2",
  range_chart_mat_width_m: "1",
  range_chart_mat_count: "1",
  range_chart_mats_under_loaded_outrigger: "1",
};

test("full save preparation preserves technical values during a narrative-only PDF edit", () => {
  const result = prepareCranePackSavePayload({
    existingSections: initialSections,
    incomingSections: { scope_of_works: "Updated PDF scope" },
    changedKeys: ["scope_of_works"],
    currentCraneName: null,
  });

  assert.deepEqual(result.liftPlanPatch, {
    load_description: "Updated PDF scope",
  });
  assert.equal(result.mergedSections.range_chart_load_weight_kg, "6000");
  assert.equal(result.mergedSections.range_chart_total_lifted_weight_kg, "6500");
  assert.equal(result.mergedSections.range_chart_chart_capacity_kg, "10000");
});

test("full save preparation promotes a PDF load edit and invalidates stale chart capacity", () => {
  const result = prepareCranePackSavePayload({
    existingSections: initialSections,
    incomingSections: { crane_load_weight: "7,000 kg" },
    changedKeys: ["crane_load_weight"],
    currentCraneName: null,
  });

  assert.equal(result.liftPlanPatch.load_weight, 7000);
  assert.equal(result.mergedSections.range_chart_load_weight_kg, "7000");
  assert.equal(result.mergedSections.range_chart_accessory_weight_kg, "500");
  assert.equal(result.mergedSections.range_chart_total_lifted_weight_kg, "7500");
  assert.equal(result.mergedSections.range_chart_chart_capacity_kg, null);
  assert.equal(result.mergedSections.range_chart_bearing_load_kg, "35625");
});

test("successive saves retain earlier edits and only patch the newly changed field", () => {
  const first = prepareCranePackSavePayload({
    existingSections: initialSections,
    incomingSections: { scope_of_works: "First saved scope" },
    changedKeys: ["scope_of_works"],
    currentCraneName: null,
  });

  const second = prepareCranePackSavePayload({
    existingSections: first.mergedSections,
    incomingSections: {
      weather_conditions: "Second saved weather limit",
    },
    changedKeys: ["weather_conditions"],
    currentCraneName: null,
  });

  assert.deepEqual(second.liftPlanPatch, {
    weather_limitations: "Second saved weather limit",
  });
  assert.equal(second.mergedSections.scope_of_works, "First saved scope");
  assert.equal(
    second.mergedSections.weather_conditions,
    "Second saved weather limit",
  );
  assert.equal(second.mergedSections.range_chart_load_weight_kg, "6000");
});

test("range-chart source saves still update canonical load, radius and height", () => {
  const result = prepareCranePackSavePayload({
    existingSections: {},
    incomingSections: {
      range_chart_load_weight_kg: "6250",
      range_chart_radius_m: "14.5",
      range_chart_tip_height_m: "18",
    },
    changedKeys: [],
    currentCraneName: null,
  });

  assert.equal(result.liftPlanPatch.load_weight, 6250);
  assert.equal(result.liftPlanPatch.lift_radius, 14.5);
  assert.equal(result.liftPlanPatch.lift_height, 18);
});

test("explicit display wording survives automatic pack synchronisation", () => {
  const result = prepareCranePackSavePayload({
    existingSections: {
      ...initialSections,
      boom_configuration: "Main boom",
      crane_jib_reference: "No jib / main boom only",
    },
    incomingSections: {
      boom_configuration: "AP-approved alternative boom arrangement",
      crane_jib_reference: "Supplier extension arrangement",
    },
    changedKeys: ["boom_configuration", "crane_jib_reference"],
    currentCraneName: null,
  });

  assert.equal(
    result.mergedSections.boom_configuration,
    "AP-approved alternative boom arrangement",
  );
  assert.equal(
    result.mergedSections.crane_jib_reference,
    "Supplier extension arrangement",
  );
});
