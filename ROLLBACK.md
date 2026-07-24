# Rollback Procedure

This update has no Supabase migration, so rollback is source/deployment-only.

## Immediate rollback

1. In Vercel, restore/promote the production deployment that was live immediately before the lift-plan upgrade.
2. Confirm login, Job 308 pack and dashboard access.
3. Keep the failed deployment available for diagnosis; do not delete live data or run SQL.

## Repository rollback

Revert the single lift-plan upgrade commit or restore the confirmed baseline source:

- Baseline file: `anns-crane-crm-main (63).zip`
- Baseline SHA-256: `5f0a988fd068e71c66ba2f47d8a6068ed55402da1cf6c5fa5b07b5c79691bddc`

Because no database migration is included, no reverse SQL is required.

## Data written during a brief production window

New structured HIAB fields are stored only inside the existing `pack_sections` JSONB object. The previous source ignores unknown keys, so they do not prevent rollback. Do not manually delete these keys.
