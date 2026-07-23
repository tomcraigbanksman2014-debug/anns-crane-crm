"use client";

import type { LiftDrawingValidation } from "./types";

export default function DrawingValidationPanel({ validation }: { validation: LiftDrawingValidation }) {
  return (
    <div style={{
      padding: 12,
      borderRadius: 10,
      border: `1px solid ${validation.errors.length ? "rgba(180,0,0,.24)" : "rgba(0,120,60,.24)"}`,
      background: validation.errors.length ? "rgba(180,0,0,.07)" : "rgba(0,120,60,.08)",
    }}>
      <div style={{ fontWeight: 900 }}>
        {validation.errors.length ? `${validation.errors.length} item${validation.errors.length === 1 ? "" : "s"} must be completed` : "Technical drawing validation complete"}
      </div>
      {validation.errors.length ? <ul style={{ margin: "8px 0 0 18px", padding: 0, display: "grid", gap: 4 }}>{validation.errors.map((item) => <li key={item}>{item}</li>)}</ul> : null}
      {validation.warnings.length ? <div style={{ marginTop: 10 }}><strong>Review:</strong><ul style={{ margin: "5px 0 0 18px", padding: 0 }}>{validation.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      <div style={{ marginTop: 9, fontSize: 12, opacity: .76 }}>
        Pick radius {validation.calculated.pickRadiusM.toFixed(2)} m · Landing radius {validation.calculated.landingRadiusM.toFixed(2)} m · Maximum {validation.calculated.maximumRadiusM.toFixed(2)} m · Gross load {validation.calculated.grossLiftedWeightKg.toLocaleString("en-GB")} kg
      </div>
    </div>
  );
}
