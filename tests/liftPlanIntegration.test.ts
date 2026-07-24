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

test("crane pack drawing errors only affect the pack when the drawing is enabled", () => {
  const crane = source("app/jobs/[id]/lift-plan/pack/page.tsx");
  assert.match(
    crane,
    /const drawingIncomplete\s*=\s*includeTechnicalDrawing\s*&&/,
  );
  assert.match(
    crane,
    /\.\.\.\(includeTechnicalDrawing\s*\?\s*\[\["toc_item_drawing"/,
  );
  assert.match(crane, /\{includeTechnicalDrawing \? <><PageShell/);
});

test("PDF pack saves merge existing technical data before recalculation", () => {
  const route = source("app/api/jobs/[id]/lift-plan/pack-selections/route.ts");
  assert.match(route, /const mergedInputSections = \{[\s\S]*\.\.\.existingSections,[\s\S]*\.\.\.incomingSafeSections/);
  assert.match(route, /promoteChangedPackTechnicalInputs\([\s\S]*mergedInputSections/);
});

test("ordinary PDF edits cannot overwrite unchanged range-chart source columns", () => {
  const route = source("app/api/jobs/[id]/lift-plan/pack-selections/route.ts");
  assert.match(route, /const isRangeChartPayload =/);
  assert.match(route, /isRangeChartPayload[\s\S]*liftPlanColumnPatchFromRangeChart/);
  assert.doesNotMatch(
    route,
    /const liftPlanPatch = \{\s*\.\.\.liftPlanColumnPatchFromRangeChart/,
  );
});
