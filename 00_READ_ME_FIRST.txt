ANNS CRM — LIFT PLAN ONE-DEPLOY UPDATE
Prepared: 23 July 2026

This folder is a complete replacement source snapshot built from the confirmed live production ZIP:
anns-crane-crm-main (63).zip
Baseline SHA-256: 5f0a988fd068e71c66ba2f47d8a6068ed55402da1cf6c5fa5b07b5c79691bddc

IMPORTANT
1. Automatic Vercel Git deployment remains disabled.
2. Upload/commit this complete source as one commit while the live production deployment remains untouched.
3. Run: node scripts/verify-lift-plan-upgrade.mjs
4. Run a full npm production build and a Vercel preview deployment.
5. Test the exact preview commit using DEPLOYMENT_STEPS.md.
6. Promote that same tested preview to Production once. Do not make extra code changes between preview and promotion.

No Supabase migration is required.
No live lift-plan records are included in this package.
The old HK40 document does not need restoring. The correct HK40 document already uploaded against the crane is the sole managed HK40 technical source.

Read these files before deployment:
- DEPLOYMENT_STEPS.md
- LIFT_PLAN_VALIDATION_REPORT.md
- LIFT_PLAN_ONE_DEPLOY_CHANGELOG.md
- ROLLBACK.md
