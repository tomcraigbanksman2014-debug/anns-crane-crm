const PRODUCTION_PROJECT_REF = "bfqoxbugzfbcvspygroj";

const vercelEnvironment = String(process.env.VERCEL_ENV ?? "").trim().toLowerCase();
const databaseEnvironment = String(
  process.env.CRM_DATABASE_ENVIRONMENT ?? "",
).trim().toLowerCase();
const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const runStagingTests =
  String(process.env.RUN_STAGING_LIFT_PLAN_TESTS ?? "")
    .trim()
    .toLowerCase() === "true";

function fail(message) {
  console.error(`SUPABASE ENVIRONMENT SAFETY FAILURE: ${message}`);
  process.exit(1);
}

if (vercelEnvironment === "preview") {
  if (!supabaseUrl) {
    fail("Preview deployment has no NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (supabaseUrl.includes(PRODUCTION_PROJECT_REF)) {
    fail(
      "Preview deployment is pointing at the live AnnS Supabase project. Preview builds are blocked before any code can run.",
    );
  }
  if (databaseEnvironment !== "staging") {
    fail(
      "Preview deployment must set CRM_DATABASE_ENVIRONMENT=staging.",
    );
  }
  if (!runStagingTests) {
    fail(
      "Preview deployment must set RUN_STAGING_LIFT_PLAN_TESTS=true so the isolated database round-trip test runs automatically.",
    );
  }
  console.log("Supabase safety check passed: preview uses an isolated staging database.");
} else if (databaseEnvironment === "staging" && supabaseUrl.includes(PRODUCTION_PROJECT_REF)) {
  fail("An environment marked as staging is pointing at the live Supabase project.");
} else {
  console.log("Supabase safety check passed for non-preview build.");
}
