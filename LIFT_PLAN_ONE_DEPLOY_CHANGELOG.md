# AnnS CRM Lift Plan One-Deploy Update

Prepared from the confirmed live production source snapshot `anns-crane-crm-main (63).zip`.

## Mobile-crane lift plans

- The issued PDF now uses the **AP-saved crane setup, saved chart capacity and saved utilisation**. It does not run the setup recommendation engine again while rendering.
- Structured setup selection now locks the exact load-chart boom column through calculation, saving and print.
- Existing historical saved duties are preserved in issued PDFs. A renderer calculation cannot silently replace them.
- Approval/finalisation is blocked only when essential saved range-chart data is missing or the saved gross lifted load exceeds saved capacity. Internal advisory messages do not block approval.
- Internal chart warnings remain visible inside the CRM but are not printed in issued packs.
- The Lift Supervisor name is no longer removed when Shaun Robinson is selected.
- Ground-bearing wording now uses **“Worst-case outrigger load used for ground-bearing calculation”** and no longer claims AnnS created the formula.
- Published manufacturer/supplier support reactions continue to take precedence where available.

## Correct Tadano Faun HK40 data

- The newly supplied 16-page HK40 document is treated as the authoritative specification.
- Structured main-boom charts cover 4.5 t, 2.1 t, 1.4 t and 0 t counterweight configurations.
- The incorrect 8.5 t HK40 counterweight option is no longer accepted.
- The 9 m extension charts are included for the correct 10.5 m, 30.3 m and 35.2 m / 4.5 t configurations at 0°, 20° and 40°.
- Appendix mapping is corrected:
  - pages 4–11: main-boom charts and lifting-height diagrams;
  - pages 12–13: 9 m boom extension;
  - pages 14–16: technical data.
- Job-level HK40 technical copies are excluded so the managed crane document is the sole HK40 specification source in newly generated/regenerated packs.

## Owned HIAB profiles

### SN74 XPX — Artic HIAB

- HIAB X-HIPRO 858 EP-6.
- Main boom only; no jib.
- Six hydraulic extensions.
- 16.4 m maximum hydraulic outreach / 16.3 m final chart point.
- Exact EP-6 capacity curve included.

### SF25 XNB — Rigid HIAB

- Palfinger PK 65002 SH E.
- Main boom only; no fly jib.
- Seven hydraulic extensions.
- 15.7 m maximum charted hydraulic outreach.
- Exact E-configuration capacity curve included.

### SN25 XRA

- Retained as a historical hired vehicle for old records.
- Excluded from current automatic owned-HIAB profile selection.

## HIAB lift-plan workflow

- Adds a verified technical schedule for configuration, radius, gross lifted load, chart capacity and utilisation.
- Adds worst-case ground-bearing input and calculation fields.
- Requires the selected stabiliser/support position and permitted working sector before approval/finalisation.
- Owned machines use exact structured charts.
- Hired HIABs can build a profile from documents uploaded against the vehicle, but approval requires an AP-entered chart capacity, source/page and verifier.
- Exact owned HIAB specification/chart appendix images are always included. Additional vehicle documents can still be included without replacing the owned chart.
- Adds plan-view and side-elevation technical schematic pages driven by the saved lift radius, height, vehicle type, support arrangement and load description.
- No internal warnings are printed in the issued HIAB pack.

## Hired cranes and documents

- Vehicle documents are available to the equipment-profile matcher for hired HIABs.
- Generic words such as “HIAB”, “rigid” or “artic” cannot assign an AnnS-owned chart to a hired machine.
- Existing hired mobile-crane specification handling remains available and is not replaced.

## Database and deployment safety

- No Supabase migration is required.
- Existing `transport_lift_plans.pack_sections` JSONB storage is used for the new structured fields.
- `vercel.json` is unchanged and automatic Git deployment remains disabled.
- No live customer/job data is included in this source package.
