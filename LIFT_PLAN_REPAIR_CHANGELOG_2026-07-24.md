# Lift-plan repair handover

## Scope

This repository is based on the stopped `lift-plan-production-upgrade`
working tree supplied on 23 July 2026. It has not been deployed or connected
to production.

## Completed in this handover

- The shared drawing parser continues to restore empty, malformed, partial,
  and legacy version-1 drawing data as a safe draft instead of crashing the
  server-rendered pack.
- The normalised HIAB technical-plan record remains the source used by the
  transport pack when available, with the legacy schedule retained only as a
  compatibility fallback.
- The shared plan/elevation editor and renderer remain wired into both the
  mobile-crane and HIAB workflows.
- Technical drawings are now optional per lift plan for both mobile cranes and
  HIABs.
- The option is off by default for new and legacy plans that do not explicitly
  enable it.
- When disabled, the editor is hidden, drawing validation is excluded from
  finalisation/approval, and the plan/elevation PDF pages are omitted.
- Switching the option off does not delete or overwrite saved drawing JSON.
- When enabled, the existing strict drawing verification and consistency
  checks still apply.
- The mobile-crane and HIAB API routes independently enforce the same optional
  drawing rule, so browser-side changes cannot bypass it.
- The old fixed `HiabPlanDrawing` function is not rendered by the pack. The
  active output uses `LiftArrangementDrawing`.

## Preview regression repair

- Fixed the transport/HIAB pack server crash identified on preview with digest
  `1477070205`.
- The normalised technical-plan parser now rebuilds every nested machine, load,
  duty, ground-bearing, personnel, narrative, verification, and validation
  section defensively instead of trusting partial saved JSON.
- Invalid normalised-plan JSON falls back to the legacy saved technical fields.
- Non-object legacy `pack_sections` values are ignored safely.
- Added regression tests proving that partial and malformed normalised HIAB
  records can be converted to the print schedule without throwing.

## Data storage

No SQL migration is required. The per-plan flag is stored inside the existing
`pack_sections` JSON as:

```json
{
  "include_technical_drawing": "true"
}
```

Existing `lift_drawing_model_json` data remains untouched.

## Validation performed

- `npm run typecheck`: passed with zero diagnostics.
- `npm test`: 19 tests passed, 0 failed.
- `npm run build`: passed completely using non-secret placeholder Supabase
  values for build-time client creation. All 177 static pages generated and
  Next.js completed page optimisation and build-trace collection.

## Required preview checks

Before merge or production use, run the build in the existing Vercel preview
environment and complete:

1. Existing mobile-crane plan with drawing disabled.
2. Existing mobile-crane plan with drawing enabled and verified.
3. Owned HIAB plan with drawing disabled.
4. Owned HIAB plan with drawing enabled and verified.
5. Hired HIAB with the exact supplier chart page and LOLER verification.
6. Hired mobile crane with the exact supplier configuration and chart page.
7. Print each pack to PDF and inspect every page for blanks, clipping, and
   contradictory values.

## Known limitations

- A local authenticated browser run and real database-backed sample packs were
  not possible without preview credentials and representative job records.
- Supplier-document extraction remains a suggested-data workflow. Safety-
  critical supplier values still require AP verification; automatic acceptance
  of extracted chart data is intentionally not implemented.
- The drawing editor is a structured vector lift-arrangement tool, not a
  replacement for an external DWG/DXF CAD package.
- The repository contains broader existing application pages that require
  Supabase environment variables during Next.js static generation.
