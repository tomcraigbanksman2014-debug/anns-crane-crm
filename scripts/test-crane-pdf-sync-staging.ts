import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { saveCranePackSectionsWithClient } from "../app/api/jobs/[id]/lift-plan/pack-selections/route";

const PRODUCTION_PROJECT_REF = "bfqoxbugzfbcvspygroj";
const isPreview = String(process.env.VERCEL_ENV ?? "").toLowerCase() === "preview";
const explicitlyEnabled =
  String(process.env.RUN_STAGING_LIFT_PLAN_TESTS ?? "").toLowerCase() === "true";

if (!isPreview && !explicitlyEnabled) {
  console.log("Skipping isolated lift-plan database test outside preview.");
  process.exit(0);
}

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const databaseEnvironment = String(
  process.env.CRM_DATABASE_ENVIRONMENT ?? "",
).trim().toLowerCase();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Isolated lift-plan test requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
}
if (supabaseUrl.includes(PRODUCTION_PROJECT_REF)) {
  throw new Error(
    "Refusing to run staging tests against the live AnnS Supabase project.",
  );
}
if (databaseEnvironment !== "staging") {
  throw new Error(
    "Refusing to run database tests unless CRM_DATABASE_ENVIRONMENT=staging.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const jobId = randomUUID();
const liftPlanId = randomUUID();
const today = new Date().toISOString().slice(0, 10);

const initialPackSections = {
  scope_of_works: "Original staging test scope",
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
  range_chart_mat_area_m2: "1.2",
  range_chart_bearing_pressure_kg_m2: "29062.5",
};

async function readLiftPlan() {
  const { data, error } = await supabase
    .from("lift_plans")
    .select(
      "id, job_id, load_description, load_weight, lift_radius, lift_height, weather_limitations, pack_sections",
    )
    .eq("id", liftPlanId)
    .single();
  if (error) throw new Error(error.message);
  return data as any;
}

async function cleanup() {
  await supabase.from("lift_plans").delete().eq("id", liftPlanId);
  await supabase.from("jobs").delete().eq("id", jobId);
  await supabase.from("audit_log").delete().eq("entity_id", liftPlanId);
  await supabase.from("audit_log").delete().eq("entity_id", jobId);
}

try {
  const { error: jobError } = await supabase.from("jobs").insert({
    id: jobId,
    site_name: "AUTOMATED STAGING LIFT-PLAN TEST",
    site_address: "TEST DATA - SAFE TO DELETE",
    job_date: today,
    status: "draft",
    hire_type: "Contract Lift",
    lift_type: "Test",
  });
  if (jobError) throw new Error(`Failed to seed test job: ${jobError.message}`);

  const { error: liftPlanError } = await supabase.from("lift_plans").insert({
    id: liftPlanId,
    job_id: jobId,
    load_description: "Original staging test scope",
    load_weight: 6000,
    lift_radius: 10,
    lift_height: 12,
    pack_sections: initialPackSections,
  });
  if (liftPlanError) {
    throw new Error(`Failed to seed test lift plan: ${liftPlanError.message}`);
  }

  await saveCranePackSectionsWithClient(
    supabase,
    jobId,
    { scope_of_works: "Updated only from the editable PDF pack" },
    ["scope_of_works"],
  );

  let row = await readLiftPlan();
  assert.equal(row.load_description, "Updated only from the editable PDF pack");
  assert.equal(Number(row.load_weight), 6000);
  assert.equal(Number(row.lift_radius), 10);
  assert.equal(Number(row.lift_height), 12);
  assert.equal(row.pack_sections.range_chart_total_lifted_weight_kg, "6500");
  assert.equal(row.pack_sections.range_chart_chart_capacity_kg, "10000");
  console.log("PASS  Narrative edit did not overwrite saved technical values.");

  await saveCranePackSectionsWithClient(
    supabase,
    jobId,
    { crane_load_weight: "7,000 kg" },
    ["crane_load_weight"],
  );

  row = await readLiftPlan();
  assert.equal(Number(row.load_weight), 7000);
  assert.equal(row.pack_sections.range_chart_load_weight_kg, "7000");
  assert.equal(row.pack_sections.range_chart_accessory_weight_kg, "500");
  assert.equal(row.pack_sections.range_chart_total_lifted_weight_kg, "7500");
  assert.equal(row.pack_sections.range_chart_chart_capacity_kg, null);
  assert.equal(row.pack_sections.range_chart_bearing_load_kg, "35625");
  console.log("PASS  PDF load edit updated the lift plan and recalculated dependent values.");

  await saveCranePackSectionsWithClient(
    supabase,
    jobId,
    { ground_bearing_mat_count: "2" },
    ["ground_bearing_mat_count"],
  );

  row = await readLiftPlan();
  assert.equal(row.pack_sections.range_chart_mats_under_loaded_outrigger, "2");
  assert.equal(row.pack_sections.range_chart_mat_area_m2, "2.4");
  assert.equal(row.pack_sections.range_chart_bearing_pressure_kg_m2, "14843.75");
  console.log("PASS  Mat-count edit recalculated area and ground-bearing pressure.");

  await saveCranePackSectionsWithClient(
    supabase,
    jobId,
    { weather_conditions: "Stop at the AP-selected chart wind limit." },
    ["weather_conditions"],
  );

  row = await readLiftPlan();
  assert.equal(
    row.weather_limitations,
    "Stop at the AP-selected chart wind limit.",
  );
  assert.equal(Number(row.load_weight), 7000);
  assert.equal(row.pack_sections.range_chart_load_weight_kg, "7000");
  assert.equal(row.pack_sections.range_chart_total_lifted_weight_kg, "7500");
  assert.equal(row.pack_sections.range_chart_mats_under_loaded_outrigger, "2");
  console.log("PASS  Second save did not resend or revert an earlier edit.");

  const reopened = await readLiftPlan();
  assert.equal(
    reopened.pack_sections.scope_of_works,
    "Updated only from the editable PDF pack",
  );
  assert.equal(
    reopened.pack_sections.weather_conditions,
    "Stop at the AP-selected chart wind limit.",
  );
  assert.equal(reopened.pack_sections.range_chart_load_weight_kg, "7000");
  console.log("PASS  Reopened pack retained every saved change.");

  console.log("\n5/5 isolated Supabase round-trip checks passed.");
} finally {
  await cleanup();
}
