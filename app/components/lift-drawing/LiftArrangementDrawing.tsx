import type { CSSProperties } from "react";
import type { LiftDrawingModelV1 } from "./types";
import PlanView from "./PlanView";
import ElevationView from "./ElevationView";
import { validateLiftDrawing } from "../../lib/liftDrawingValidation";

export default function LiftArrangementDrawing({
  model,
  client,
  project,
  jobNumber,
  view = "plan",
  forceDraft,
}: {
  model: LiftDrawingModelV1;
  client?: string | null;
  project?: string | null;
  jobNumber?: string | null;
  view?: "plan" | "elevation";
  forceDraft?: boolean;
}) {
  const validation = validateLiftDrawing(model, {});
  const draft = forceDraft || model.status !== "verified" || validation.errors.length > 0;
  return (
    <div style={sheet}>
      {draft ? <div style={watermark}>DRAFT - TECHNICAL INFORMATION INCOMPLETE - NOT FOR USE</div> : null}
      <div style={heading}>
        <div>
          <div style={eyebrow}>ANNS CRANE HIRE - TECHNICAL LIFT ARRANGEMENT</div>
          <div style={title}>{view === "plan" ? "PLAN VIEW" : "SIDE ELEVATION"}</div>
        </div>
        <div style={statusBadge}>{model.status.toUpperCase()}</div>
      </div>
      <div style={drawingArea}>{view === "plan" ? <PlanView model={model} /> : <ElevationView model={model} />}</div>
      <div style={titleBlock}>
        <Cell label="Client" value={client} />
        <Cell label="Project" value={project} />
        <Cell label="Job" value={jobNumber} />
        <Cell label="Machine" value={`${model.machine.hiredIn ? "HIRED-IN - " : ""}${model.machine.label}`} />
        <Cell label="Drawing no." value={model.drawingNumber} />
        <Cell label="Revision" value={model.revision} />
        <Cell label="Scale/status" value={`${model.scaleMode === "verified-scale" ? "Dimensioned model" : "Diagrammatic"} / ${model.status}`} />
        <Cell label="Prepared by" value={model.preparedBy} />
        <Cell label="Verified by/date" value={[model.verifiedBy, model.verifiedAt ? new Date(model.verifiedAt).toLocaleDateString("en-GB") : ""].filter(Boolean).join(" - ")} />
      </div>
      <div style={legend}>
        <span><b style={{ color: "#15803d" }}>●</b> Pick</span>
        <span><b style={{ color: "#1d4ed8" }}>●</b> Landing</span>
        <span>Dashed blue: travel path / working sector</span>
        <span>All dimensions in metres</span>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value?: string | null }) {
  return <div style={cell}><div style={cellLabel}>{label}</div><div style={cellValue}>{value || "—"}</div></div>;
}

const sheet: CSSProperties = { position: "relative", border: "1.5px solid #111827", padding: 10, background: "#fff", overflow: "hidden" };
const heading: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #111827", paddingBottom: 7, marginBottom: 8 };
const eyebrow: CSSProperties = { fontSize: 9, letterSpacing: ".08em", color: "#475569", fontWeight: 800 };
const title: CSSProperties = { fontSize: 17, fontWeight: 900, marginTop: 2 };
const statusBadge: CSSProperties = { border: "1px solid #111827", padding: "4px 8px", fontSize: 9, fontWeight: 900 };
const drawingArea: CSSProperties = { height: 470, border: "1px solid #64748b" };
const titleBlock: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderLeft: "1px solid #111827", borderTop: "1px solid #111827", marginTop: 8 };
const cell: CSSProperties = { minHeight: 38, padding: "4px 6px", borderRight: "1px solid #111827", borderBottom: "1px solid #111827" };
const cellLabel: CSSProperties = { fontSize: 7, fontWeight: 900, textTransform: "uppercase", color: "#475569" };
const cellValue: CSSProperties = { fontSize: 9, fontWeight: 700, marginTop: 2, overflowWrap: "anywhere" };
const legend: CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 8, marginTop: 6 };
const watermark: CSSProperties = { position: "absolute", zIndex: 5, top: "46%", left: "-8%", width: "116%", transform: "rotate(-24deg)", textAlign: "center", fontSize: 24, fontWeight: 900, color: "rgba(180,0,0,.18)", letterSpacing: ".04em", pointerEvents: "none" };
