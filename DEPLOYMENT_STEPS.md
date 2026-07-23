# One-Deploy Production Procedure

The live CRM must remain on its current production deployment until the completed source has passed a preview build and the checks below.

## 1. Prepare one source commit

1. Keep a copy of the current live repository/ZIP and note the current production deployment.
2. Replace the repository working tree with the complete contents of this package.
3. Do not copy `node_modules`, `.next`, local environment files or test exports into the repository.
4. Commit all changed/new files together in one commit. Suggested commit message:

   `Lift plan one-deploy upgrade: saved duties, HK40, HIAB and hired crane support`

5. Confirm `vercel.json` still contains `"deploymentEnabled": false`.

Pushing the commit must not change the live production deployment.

## 2. Run source verification

From the repository root:

```bash
node scripts/verify-lift-plan-upgrade.mjs
npm ci
npm run build
```

Required outcome:

- the verification script reports all checks passed;
- `npm ci` completes cleanly;
- `npm run build` completes without TypeScript, route, React or Next.js errors.

Do not create a production deployment if any command fails.

## 3. Create a preview from the exact commit

Create a Vercel **preview** deployment from the single completed commit. Do not promote it yet. Confirm the preview uses the same environment variables and Supabase project as the existing CRM, without changing production.

Do not edit source code between the preview and production promotion. Any code change requires a new preview and a repeat of the checks.

## 4. Preview acceptance checks

### Existing mobile-crane regression

Open and print the Job 308 lift-plan pack. Confirm:

- Grove GMK4080-1;
- 47.21 m main boom;
- 19.3 t counterweight;
- 40 m radius;
- 1,800 kg selected chart capacity;
- 1,250 kg gross lifted load;
- approximately 69.4% utilisation;
- no 11 m setup anywhere in the pack;
- Lift Supervisor is populated when Shaun Robinson is selected;
- no internal warning text appears in the issued PDF;
- ground-bearing section uses worst-case wording.

Print at least one existing plan for each available current profile:

- Grove GMK4080-1;
- Tadano Faun HK40;
- Marchetti MTK35;
- Jekko SPX532;
- Böcker AK46/6000;
- 60 t Liebherr where a suitable existing plan is available.

Confirm page order, signatures, appendices and existing text remain intact.

### HK40

1. Confirm the managed HK40 document shown against the crane is the new 16-page Tadano Faun HK40 document.
2. Confirm no old job-level HK40 technical copy appears in a newly generated/regenerated pack.
3. Confirm main-boom options use 4.5 t, 2.1 t, 1.4 t or 0 t only.
4. Confirm the 9 m extension options use the page-12 configurations.
5. Confirm a saved 35.2 m chart column remains 35.2 m throughout the pack.

### Artic HIAB — SN74 XPX

Confirm:

- HIAB X-HIPRO 858 EP-6;
- main boom only / no jib;
- exact EP-6 capacity at the entered radius;
- support position and permitted sector are required;
- technical schedule, ground-bearing schedule and drawing pages print correctly;
- EP-6 specification and chart appendices are present.

### Rigid HIAB — SF25 XNB

Confirm:

- Palfinger PK 65002 SH E;
- main boom only / no fly jib;
- exact E-chart capacity at the entered radius;
- support position and permitted sector are required;
- technical schedule, ground-bearing schedule and drawing pages print correctly;
- E specification and chart appendices are present.

### Hired HIAB

Use a non-owned test/hire vehicle with manufacturer/supplier documents uploaded against the vehicle. Confirm:

- it does not inherit the SN74 XPX or SF25 XNB chart;
- the uploaded document profile is shown;
- approval is blocked until chart capacity, chart/page source and verifier are entered;
- it can be saved as a draft before those fields are complete;
- the uploaded document appendices print.

### Approval controls

Confirm:

- advisory messages remain visible inside the planning screen;
- advisory messages alone do not prevent approval;
- missing setup, radius, gross lifted load or chart capacity does prevent approval;
- a gross lifted load over saved chart capacity prevents approval;
- no internal warnings appear in the issued PDF.

## 5. One production deployment

After every preview acceptance check passes, promote the **same unchanged preview deployment** to Production.

This is the single live production deployment. Do not create a second build or make a follow-up code change during promotion.

## 6. Immediate production smoke check

Without changing any saved data:

1. Log in.
2. Open Job 308 and its pack.
3. Open the HK40 crane document list.
4. Open the HIAB lift-plan page for SN74 XPX and SF25 XNB.
5. Confirm dashboard/planner access still works.
6. Confirm a draft save works on a test/draft plan.

If a critical issue is found, follow `ROLLBACK.md` immediately.
