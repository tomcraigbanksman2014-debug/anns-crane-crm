import assert from "node:assert/strict";
import test from "node:test";
import { buildLiftPlanPatchFromPackEdits } from "../app/lib/craneLiftPlanPackSync";

const cases: Array<[string, string, string, string | number]> = [
  ["scope_of_works", "load_description", "Lift item", "Lift item"],
  ["crane_load_weight", "load_weight", "6,500 kg", 6500],
  ["range_chart_radius_m", "lift_radius", "12.5", 12.5],
  ["range_chart_tip_height_m", "lift_height", "18", 18],
  ["boom_configuration", "crane_configuration", "Main boom", "Main boom"],
  ["configuration_outrigger_note", "outrigger_setup", "Full outriggers", "Full outriggers"],
  ["ground_conditions", "ground_conditions", "Reinforced slab", "Reinforced slab"],
  ["equipment_sling_type", "sling_type", "4-leg chain", "4-leg chain"],
  ["equipment_lifting_accessories", "lifting_accessories", "Shackles", "Shackles"],
  ["lifting_procedure", "method_statement", "Test lift then slew", "Test lift then slew"],
  ["risk_assessment_summary", "risk_assessment", "RAMS summary", "RAMS summary"],
  ["site_hazards", "site_hazards", "Overhead service", "Overhead service"],
  ["control_measures", "control_measures", "Barrier area", "Barrier area"],
  ["ppe_required", "ppe_required", "Standard PPE", "Standard PPE"],
  ["traffic_pedestrian_management", "exclusion_zone_details", "Banksman controls", "Banksman controls"],
  ["weather_conditions", "weather_limitations", "Stop at wind limit", "Stop at wind limit"],
  ["emergency_procedure", "emergency_procedures", "Lower load safely", "Lower load safely"],
  ["personnel_lift_supervisor", "lift_supervisor", "Supervisor Test", "Supervisor Test"],
  ["cover_appointed_person", "appointed_person", "AP Test", "AP Test"],
  ["personnel_crane_operator", "crane_operator", "Operator Test", "Operator Test"],
  ["signoff_approval_notes", "approval_notes", "Approval note", "Approval note"],
];

for (const [packKey, column, value, expected] of cases) {
  test(`${packKey} updates only ${column}`, () => {
    const patch = buildLiftPlanPatchFromPackEdits(
      { [packKey]: value },
      [packKey],
    );
    assert.deepEqual(patch, { [column]: expected });
  });
}

test("unchanged fields never create a lift-plan patch", () => {
  const patch = buildLiftPlanPatchFromPackEdits(
    {
      scope_of_works: "Stale scope",
      weather_conditions: "Stale weather",
      crane_load_weight: "9,000 kg",
    },
    [],
  );
  assert.deepEqual(patch, {});
});
