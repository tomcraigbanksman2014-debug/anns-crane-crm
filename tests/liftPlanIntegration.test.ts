import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("both planning forms use the shared technical drawing editor", () => {
  const crane = source("app/jobs/[id]/LiftPlanForm.tsx");
  const hiab = source("app/transport-jobs/[id]/TransportLiftPlanForm.tsx");
  assert.match(crane, /<LiftArrangementEditor/);
  assert.match(hiab, /<LiftArrangementEditor/);
  assert.match(crane, /liftDrawingApprovalErrors/);
  assert.match(hiab, /liftDrawingApprovalErrors/);
});

test("both approval APIs enforce the same shared drawing validation", () => {
  const crane = source("app/api/jobs/[id]/lift-plan/route.ts");
  const hiab = source("app/api/transport-jobs/[id]/lift-plan/route.ts");
  assert.match(crane, /liftDrawingApprovalErrors/);
  assert.match(hiab, /liftDrawingApprovalErrors/);
});

test("both packs contain vector plan and elevation pages with draft watermarking", () => {
  const crane = source("app/jobs/[id]/lift-plan/pack/page.tsx");
  const hiab = source("app/transport-jobs/[id]/lift-plan/pack/page.tsx");
  for (const pack of [crane, hiab]) {
    assert.match(pack, /Technical Drawing - Plan View/);
    assert.match(pack, /Technical Drawing - Side Elevation/);
    assert.match(pack, /<LiftArrangementDrawing/);
    assert.match(pack, /DRAFT - TECHNICAL INFORMATION INCOMPLETE - NOT FOR USE/);
  }
  assert.doesNotMatch(hiab, /HiabTechnicalDrawing/);
});
