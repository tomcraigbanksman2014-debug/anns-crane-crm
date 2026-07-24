# Preview branch steps

1. Keep the live `main` branch unchanged.
2. Back up the existing remote `lift-plan-production-upgrade` branch.
3. Extract this repository into a clean local folder.
4. Restore the branch's `.git` metadata by checking out
   `lift-plan-production-upgrade` in GitHub Desktop, then copy this repository's
   files over that checked-out working tree.
5. Do not copy `node_modules`, `.next`, `.npm-cache`, `.env*`, or Vercel
   metadata.
6. Confirm the change list contains only the intended lift-plan files and these
   handover documents.
7. Run:

```text
npm ci
npm run typecheck
npm test
npm run build
```

8. Commit to `lift-plan-production-upgrade`.
9. Create a Vercel Preview deployment for that branch only.
10. Complete every check in `LIFT_PLAN_REPAIR_CHANGELOG_2026-07-24.md`.
11. Do not merge to `main` until the AP has inspected completed HIAB and crane
    PDFs page by page.

No SQL migration is required for this handover.
