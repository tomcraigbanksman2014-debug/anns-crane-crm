# Lift Plan Upgrade Validation Report

Prepared: 23 July 2026

## Production baseline

- Confirmed source ZIP: `anns-crane-crm-main (63).zip`
- Baseline SHA-256: `5f0a988fd068e71c66ba2f47d8a6068ed55402da1cf6c5fa5b07b5c79691bddc`
- `vercel.json` remains byte-identical to the confirmed production baseline.
- Automatic Vercel Git deployment remains disabled.

## Source checks completed

- 15 changed TypeScript/TSX files transpile-checked: **15 passed, 0 failed**.
- Semantic TypeScript check over all changed TypeScript/TSX files with local project imports resolved: **0 diagnostics**.
- Direct TypeScript semantic check of the seven technical/profile libraries: **passed**.
- Technical calculation tests: **9 passed, 0 failed**.
- Deployment invariant/static checks: **29 passed, 0 failed**.
- Four owned-HIAB static appendix assets exist and passed file-size checks.

## Technical calculation tests

The automated tests confirm:

1. HIAB X-HIPRO 858 EP-6 gives the conservative 5,700 kg duty at a 10 m radius.
2. Palfinger PK 65002 SH E gives the conservative 4,350 kg duty at a 10 m radius.
3. HK40 30.3 m main boom + 9 m extension / 20° / 4.5 t gives 3,000 kg at 22 m.
4. HK40 35.2 m main boom + 9 m extension / 0° / 4.5 t gives 500 kg at 40 m.
5. HIAB gross lifted load, utilisation, worst-case outrigger load and pressure calculations are consistent.
6. An overload blocks approval/finalisation.
7. A hired HIAB requires an AP-checked chart duty, chart/page source and verifier.
8. Job 308 validates with its saved 47.21 m / 19.3 t duty and is not blocked by advisory text.
9. A missing saved chart capacity remains blocked.

## Live-data regression audit

The supplied read-only lift-plan export was tested without changing Supabase:

- Total live lift plans reviewed: **44**.
- Structured range-chart plans: **26**.
- Legacy plans with no structured range data: **18**; these remain compatible and are not forced through the new structured validator.
- Structured plans currently complete enough to pass approval validation: **17**.
- Structured plans currently incomplete and correctly blocked if approval/finalisation is attempted: **9**.
- Advisory messages present but correctly non-blocking: **17**.

Capacity regression:

- Existing saved capacities matching the current structured chart calculation exactly: **17**.
- One historical SPX532 saved capacity differs from the current structured curve. The issued PDF deliberately preserves the AP-saved historical value instead of silently replacing it during rendering.
- One existing saved mobile-crane duty remains manual/unmatched. Its saved issued duty is preserved; it must be rechecked if edited and re-approved.
- Seven structured drafts have no saved chart capacity and remain incomplete rather than being given a crane maximum or guessed capacity.

Job 308 regression point:

- Saved setup: 47.21 m main boom / 19.3 t counterweight.
- Saved radius: 40 m.
- Saved chart capacity: 1,800 kg.
- Saved gross lifted load: 1,250 kg.
- Saved utilisation: approximately 69.4%.
- The renderer no longer generates the conflicting 11 m setup.

## Schema compatibility

The supplied full schema export confirms:

- `public.transport_lift_plans.pack_sections` exists as non-null JSONB with default `{}`.
- `vehicle_documents.vehicle_id` has a validated foreign key to `vehicles.id`.
- No SQL migration is required for this deployment.

## Build status requiring final preview

A full local `npm ci` / `next build` could not be completed in the isolated environment because the dependency gateway returned HTTP 503 while fetching `web-push@3.6.7`. Repeated installation attempts were made, including a final clean-copy attempt before packaging.

This is not recorded as a successful production build. A clean full build and Vercel preview of the exact deployment commit are mandatory before promotion to Production. Follow `DEPLOYMENT_STEPS.md` and promote the tested preview commit unchanged.
