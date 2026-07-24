# Safe automated lift-plan testing

This package prevents Vercel Preview deployments from using the live AnnS Supabase project and runs automatic lift-plan PDF-edit round-trip tests against an isolated Supabase staging branch.

## Required Vercel Preview variables

Set these for **Preview only** (not Production):

- `NEXT_PUBLIC_SUPABASE_URL` = staging branch URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = staging branch anon/publishable key
- `SUPABASE_SERVICE_ROLE_KEY` = staging branch service-role/secret key
- `SUPABASE_SECRET_KEY` = staging branch secret key
- `CRM_DATABASE_ENVIRONMENT` = `staging`
- `RUN_STAGING_LIFT_PLAN_TESTS` = `true`

Remove Preview from the existing live Supabase variable entries, or add branch-specific Preview overrides for `lift-plan-production-upgrade`.

## What happens automatically

1. Every GitHub push runs TypeScript, regression and lift-plan verification checks without any Supabase credentials.
2. Every Vercel Preview build checks that it is not pointing at live project `bfqoxbugzfbcvspygroj`.
3. The Preview build creates a temporary test job and lift plan in staging.
4. It tests narrative edits, technical load edits, mat-count recalculation, repeat saves and reopening saved values.
5. It deletes the temporary job, lift plan and their audit rows.
6. Any failed check stops the Preview deployment.

Production builds never run the staging database test.
