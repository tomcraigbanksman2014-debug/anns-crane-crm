"use client";

import type { CSSProperties } from "react";
import { useMemo, useRef, useState } from "react";
import { clampToSite } from "./geometry";
import { createDefaultLiftDrawing } from "./defaults";
import DrawingToolbar from "./DrawingToolbar";
import DrawingValidationPanel from "./DrawingValidationPanel";
import PlanView from "./PlanView";
import ElevationView from "./ElevationView";
import type { LiftDrawingModelV1, LiftDrawingObject, LiftMachineType, LiftTechnicalSchedule } from "./types";
import { validateLiftDrawing } from "../../lib/liftDrawingValidation";

export default function LiftArrangementEditor({
  value,
  onChange,
  schedule,
  machineType,
  machineLabel,
  drawingNumber,
  disabled,
}: {
  value?: LiftDrawingModelV1 | null;
  onChange: (model: LiftDrawingModelV1) => void;
  schedule: LiftTechnicalSchedule;
  machineType: LiftMachineType;
  machineLabel: string;
  drawingNumber: string;
  disabled?: boolean;
}) {
  const model = value ?? createDefaultLiftDrawing({
    machineType,
    machineLabel,
    drawingNumber,
    loadWeightKg: Number(schedule.loadWeightKg) || 0,
    accessoryWeightKg: Number(schedule.accessoryWeightKg) || 0,
    radiusM: Number(schedule.radiusM) || 0,
    boomLengthM: Number(schedule.boomLengthM) || 0,
    boomAngleDeg: Number(schedule.boomAngleDeg) || 0,
    hookHeightM: Number(schedule.hookHeightM) || 0,
  });
  const [history, setHistory] = useState<LiftDrawingModelV1[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState("");
  const [view, setView] = useState<"plan" | "elevation">("plan");
  const lastModel = useRef(model);
  lastModel.current = model;
  const validation = useMemo(() => validateLiftDrawing(model, schedule), [model, schedule]);

  function commit(next: LiftDrawingModelV1) {
    if (disabled) return;
    setHistory((items) => [...items.slice(-19), lastModel.current]);
    onChange(next);
  }
  function patch(path: string, value: unknown) {
    const next = structuredClone(model);
    const keys = path.split(".");
    let target: any = next;
    for (const key of keys.slice(0, -1)) target = target[key];
    target[keys[keys.length - 1]] = value;
    if (path !== "status" && next.status === "verified") {
      next.status = "draft";
      next.verifiedBy = undefined;
      next.verifiedAt = undefined;
    }
    commit(next);
  }
  function numberPatch(path: string, value: string) {
    patch(path, Number(value) || 0);
  }
  function dragPoint(kind: "machine" | "pick" | "landing", xM: number, yM: number) {
    const next = structuredClone(model);
    if (kind === "machine") {
      next.machine.xM = clampToSite(xM, next.site.widthM);
      next.machine.yM = clampToSite(yM, next.site.depthM);
    } else {
      next.lift[kind].xM = clampToSite(xM, next.site.widthM);
      next.lift[kind].yM = clampToSite(yM, next.site.depthM);
    }
    next.status = "draft";
    commit(next);
  }
  function dragObject(id: string, xM: number, yM: number) {
    const next = structuredClone(model);
    next.objects = next.objects.map((item) => {
      if (item.id !== id) return item;
      if (item.type === "overhead-service") {
        const midpointX = (item.x1M + item.x2M) / 2;
        const midpointY = (item.y1M + item.y2M) / 2;
        const dx = xM - midpointX;
        const dy = yM - midpointY;
        return {
          ...item,
          x1M: clampToSite(item.x1M + dx, next.site.widthM),
          y1M: clampToSite(item.y1M + dy, next.site.depthM),
          x2M: clampToSite(item.x2M + dx, next.site.widthM),
          y2M: clampToSite(item.y2M + dy, next.site.depthM),
        };
      }
      return {
        ...item,
        xM: clampToSite(xM, next.site.widthM),
        yM: clampToSite(yM, next.site.depthM),
      };
    });
    next.status = "draft";
    commit(next);
  }
  function addObject(type: LiftDrawingObject["type"]) {
    const id = `${type}-${Date.now()}`;
    let item: LiftDrawingObject;
    if (type === "overhead-service") {
      item = { id, type, x1M: 5, y1M: 5, x2M: 25, y2M: 5, heightM: 10, label: "Overhead service" };
    } else if (type === "note") {
      item = { id, type, xM: 5, yM: 5, text: "Drawing note" };
    } else {
      item = { id, type, xM: 4, yM: 4, widthM: type === "road" ? 20 : 8, depthM: type === "road" ? 5 : 7, rotationDeg: 0, label: type.replace(/-/g, " ") };
    }
    commit({ ...model, status: "draft", objects: [...model.objects, item] });
    setSelectedObjectId(id);
  }
  function updateObject(id: string, key: string, value: string | number) {
    commit({
      ...model,
      status: "draft",
      objects: model.objects.map((item) => item.id === id ? { ...item, [key]: value } as LiftDrawingObject : item),
    });
  }
  const selectedObject = model.objects.find((item) => item.id === selectedObjectId) ?? null;

  return (
    <div style={editor}>
      <div style={header}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20 }}>Technical drawing</h3>
          <div style={hint}>Dimensioned plan view and side elevation. Drag the machine, pick and landing points; use the fields for exact measurements.</div>
        </div>
        <DrawingToolbar
          disabled={disabled}
          canUndo={history.length > 0}
          onUndo={() => {
            const previous = history[history.length - 1];
            if (!previous) return;
            setHistory((items) => items.slice(0, -1));
            onChange(previous);
          }}
          onDirectPath={() => patch("lift.travelPath", [
            { xM: model.lift.pick.xM, yM: model.lift.pick.yM },
            { xM: model.lift.landing.xM, yM: model.lift.landing.yM },
          ])}
          onAddObject={addObject}
        />
      </div>

      <div style={editorGrid}>
        <div style={propertyPanel}>
          <Group title="Drawing control">
            <Text label="Drawing number" value={model.drawingNumber} onChange={(v) => patch("drawingNumber", v)} disabled={disabled} />
            <Text label="Revision" value={model.revision} onChange={(v) => patch("revision", v)} disabled={disabled} />
            <Text label="Prepared by" value={model.preparedBy || ""} onChange={(v) => patch("preparedBy", v)} disabled={disabled} />
            <Select label="Scale/status" value={model.scaleMode} onChange={(v) => patch("scaleMode", v)} options={[["verified-scale", "Dimensioned model"], ["diagrammatic", "Diagrammatic"]]} disabled={disabled} />
          </Group>
          <Group title="Site and machine">
            <div style={grid2}><NumberField label="Site width (m)" value={model.site.widthM} onChange={(v) => numberPatch("site.widthM", v)} disabled={disabled} /><NumberField label="Site depth (m)" value={model.site.depthM} onChange={(v) => numberPatch("site.depthM", v)} disabled={disabled} /></div>
            <div style={grid2}><NumberField label="North angle (°)" value={model.site.northAngleDeg} onChange={(v) => numberPatch("site.northAngleDeg", v)} disabled={disabled} /><Select label="Machine type" value={model.machine.type} onChange={(v) => patch("machine.type", v)} options={[["mobile-crane", "Mobile crane"], ["spider-crane", "Spider crane"], ["hiab-rigid", "Rigid HIAB"], ["hiab-artic", "Artic HIAB"]]} disabled={disabled} /></div>
            <Text label="Exact machine" value={model.machine.label} onChange={(v) => patch("machine.label", v)} disabled={disabled} />
            <label style={check}><input type="checkbox" checked={model.machine.hiredIn} onChange={(e) => patch("machine.hiredIn", e.target.checked)} disabled={disabled} /> Hired-in machine</label>
            {model.machine.hiredIn ? <><Text label="Supplier" value={model.machine.supplier || ""} onChange={(v) => patch("machine.supplier", v)} disabled={disabled} /><div style={grid2}><Text label="Make" value={model.machine.make || ""} onChange={(v) => patch("machine.make", v)} disabled={disabled} /><Text label="Model" value={model.machine.model || ""} onChange={(v) => patch("machine.model", v)} disabled={disabled} /></div><Text label="Serial / fleet reference" value={model.machine.serialOrFleetReference || ""} onChange={(v) => patch("machine.serialOrFleetReference", v)} disabled={disabled} /></> : null}
            <div style={grid2}><NumberField label="Machine X (m)" value={model.machine.xM} onChange={(v) => numberPatch("machine.xM", v)} disabled={disabled} /><NumberField label="Machine Y (m)" value={model.machine.yM} onChange={(v) => numberPatch("machine.yM", v)} disabled={disabled} /></div>
            <div style={grid2}><NumberField label="Length (m)" value={model.machine.lengthM} onChange={(v) => numberPatch("machine.lengthM", v)} disabled={disabled} /><NumberField label="Width (m)" value={model.machine.widthM} onChange={(v) => numberPatch("machine.widthM", v)} disabled={disabled} /></div>
            <div style={grid2}><NumberField label="Rotation (°)" value={model.machine.rotationDeg} onChange={(v) => numberPatch("machine.rotationDeg", v)} disabled={disabled} /><NumberField label="Centre offset (m)" value={model.machine.centreOfRotationOffsetM} onChange={(v) => numberPatch("machine.centreOfRotationOffsetM", v)} disabled={disabled} /></div>
          </Group>
          <Group title="Lift geometry and load">
            <div style={grid2}><NumberField label="Pick X (m)" value={model.lift.pick.xM} onChange={(v) => numberPatch("lift.pick.xM", v)} disabled={disabled} /><NumberField label="Pick Y (m)" value={model.lift.pick.yM} onChange={(v) => numberPatch("lift.pick.yM", v)} disabled={disabled} /></div>
            <div style={grid2}><NumberField label="Landing X (m)" value={model.lift.landing.xM} onChange={(v) => numberPatch("lift.landing.xM", v)} disabled={disabled} /><NumberField label="Landing Y (m)" value={model.lift.landing.yM} onChange={(v) => numberPatch("lift.landing.yM", v)} disabled={disabled} /></div>
            <div style={grid2}><NumberField label="Load length (m)" value={model.lift.loadLengthM} onChange={(v) => numberPatch("lift.loadLengthM", v)} disabled={disabled} /><NumberField label="Load width (m)" value={model.lift.loadWidthM} onChange={(v) => numberPatch("lift.loadWidthM", v)} disabled={disabled} /><NumberField label="Load height (m)" value={model.lift.loadHeightM} onChange={(v) => numberPatch("lift.loadHeightM", v)} disabled={disabled} /></div>
            <div style={grid2}><NumberField label="Load weight (kg)" value={model.lift.loadWeightKg} onChange={(v) => numberPatch("lift.loadWeightKg", v)} disabled={disabled} /><NumberField label="Accessories (kg)" value={model.lift.accessoryWeightKg} onChange={(v) => numberPatch("lift.accessoryWeightKg", v)} disabled={disabled} /></div>
            <label style={check}><input type="checkbox" checked={model.lift.accessoryWeightConfirmed} onChange={(e) => patch("lift.accessoryWeightConfirmed", e.target.checked)} disabled={disabled} /> Accessory weight explicitly confirmed</label>
            <div style={grid2}><NumberField label="Planned radius (m)" value={model.lift.radiusM} onChange={(v) => numberPatch("lift.radiusM", v)} disabled={disabled} /><NumberField label="Boom length (m)" value={model.lift.boomLengthM} onChange={(v) => numberPatch("lift.boomLengthM", v)} disabled={disabled} /><NumberField label="Boom angle (°)" value={model.lift.boomAngleDeg} onChange={(v) => numberPatch("lift.boomAngleDeg", v)} disabled={disabled} /><NumberField label="Hook height (m)" value={model.lift.hookHeightM} onChange={(v) => numberPatch("lift.hookHeightM", v)} disabled={disabled} /></div>
            <div style={grid2}><NumberField label="Sector start (°)" value={model.lift.workingSectorStartDeg} onChange={(v) => numberPatch("lift.workingSectorStartDeg", v)} disabled={disabled} /><NumberField label="Sector end (°)" value={model.lift.workingSectorEndDeg} onChange={(v) => numberPatch("lift.workingSectorEndDeg", v)} disabled={disabled} /></div>
          </Group>
          <Group title="Technical verification">
            <Text label="Exact configuration" value={model.technical.exactConfiguration} onChange={(v) => patch("technical.exactConfiguration", v)} disabled={disabled} />
            <Text label="Counterweight / ballast" value={model.technical.counterweight || ""} onChange={(v) => patch("technical.counterweight", v)} disabled={disabled} />
            <div style={grid2}><Text label="Chart source" value={model.technical.chartSource} onChange={(v) => patch("technical.chartSource", v)} disabled={disabled} /><Text label="Chart page" value={model.technical.chartPage} onChange={(v) => patch("technical.chartPage", v)} disabled={disabled} /></div>
            <div style={grid2}><NumberField label="Capacity (kg)" value={model.technical.chartCapacityKg} onChange={(v) => numberPatch("technical.chartCapacityKg", v)} disabled={disabled} /><NumberField label="Utilisation (%)" value={model.technical.utilisationPercent} onChange={(v) => numberPatch("technical.utilisationPercent", v)} disabled={disabled} /></div>
            <Text label="Stabiliser setup" value={model.technical.stabiliserSetup} onChange={(v) => patch("technical.stabiliserSetup", v)} disabled={disabled} />
            <Text label="Working sector" value={model.technical.workingSector} onChange={(v) => patch("technical.workingSector", v)} disabled={disabled} />
            <div style={grid2}><NumberField label="Operating weight (kg)" value={model.technical.operatingWeightKg} onChange={(v) => numberPatch("technical.operatingWeightKg", v)} disabled={disabled} /><NumberField label="Ground pressure (kg/m²)" value={model.technical.groundPressureKgM2} onChange={(v) => numberPatch("technical.groundPressureKgM2", v)} disabled={disabled} /></div>
            <div style={grid2}><NumberField label="Published support reaction (kg)" value={model.technical.supportReactionKg ?? 0} onChange={(v) => numberPatch("technical.supportReactionKg", v)} disabled={disabled} /><Text label="Support reaction source" value={model.technical.supportReactionSource || ""} onChange={(v) => patch("technical.supportReactionSource", v)} disabled={disabled} /></div>
            <Text label="Lifting accessories / method" value={model.technical.liftingAccessories} onChange={(v) => patch("technical.liftingAccessories", v)} disabled={disabled} />
            <Text label="Site hazards" value={model.technical.siteHazards} onChange={(v) => patch("technical.siteHazards", v)} disabled={disabled} />
            <Text label="Control measures" value={model.technical.controlMeasures} onChange={(v) => patch("technical.controlMeasures", v)} disabled={disabled} />
            {model.machine.hiredIn ? <><Text label="Hired data verified by" value={model.technical.hiredMachineVerifiedBy || ""} onChange={(v) => patch("technical.hiredMachineVerifiedBy", v)} disabled={disabled} /><Text label="Verification date" type="date" value={model.technical.hiredMachineVerifiedAt || ""} onChange={(v) => patch("technical.hiredMachineVerifiedAt", v)} disabled={disabled} /><Text label="Current LOLER reference" value={model.technical.currentLolerReference || ""} onChange={(v) => patch("technical.currentLolerReference", v)} disabled={disabled} /></> : null}
          </Group>
          <Group title="Stabilisers and pads">
            {model.machine.stabilisers.map((item, index) => <div key={item.id} style={subCard}><strong>Support {index + 1}</strong><div style={grid2}><NumberField label="X offset (m)" value={item.xM} onChange={(v) => updateStabiliser(model, commit, index, "xM", v)} disabled={disabled} /><NumberField label="Y offset (m)" value={item.yM} onChange={(v) => updateStabiliser(model, commit, index, "yM", v)} disabled={disabled} /><NumberField label="Extension (m)" value={item.extensionM} onChange={(v) => updateStabiliser(model, commit, index, "extensionM", v)} disabled={disabled} /><NumberField label="Pad length (m)" value={item.padLengthM} onChange={(v) => updateStabiliser(model, commit, index, "padLengthM", v)} disabled={disabled} /><NumberField label="Pad width (m)" value={item.padWidthM} onChange={(v) => updateStabiliser(model, commit, index, "padWidthM", v)} disabled={disabled} /></div></div>)}
          </Group>
          <Group title="Site objects">
            <select value={selectedObjectId} onChange={(e) => setSelectedObjectId(e.target.value)} style={input} disabled={disabled}><option value="">Select object...</option>{model.objects.map((item) => <option key={item.id} value={item.id}>{item.type} - {"label" in item ? item.label : item.text}</option>)}</select>
            {selectedObject ? <ObjectEditor object={selectedObject} update={(key, value) => updateObject(selectedObject.id, key, value)} remove={() => { commit({ ...model, objects: model.objects.filter((item) => item.id !== selectedObject.id) }); setSelectedObjectId(""); }} disabled={disabled} /> : <div style={hint}>Add buildings, roads, exclusion zones and services using the toolbar.</div>}
          </Group>
        </div>

        <div style={previewPanel}>
          <div style={viewTabs}><button type="button" onClick={() => setView("plan")} style={view === "plan" ? activeTab : tab}>Plan view</button><button type="button" onClick={() => setView("elevation")} style={view === "elevation" ? activeTab : tab}>Side elevation</button></div>
          <div style={preview}>{view === "plan" ? <PlanView model={model} interactive={!disabled} onPointDrag={dragPoint} onObjectDrag={dragObject} /> : <ElevationView model={model} />}</div>
          <DrawingValidationPanel validation={validation} />
          <div style={verificationBox}>
            <Text label="Verified by" value={model.verifiedBy || ""} onChange={(v) => patch("verifiedBy", v)} disabled={disabled} />
            <Text label="Verified at" type="datetime-local" value={model.verifiedAt ? model.verifiedAt.slice(0, 16) : ""} onChange={(v) => patch("verifiedAt", v ? new Date(v).toISOString() : "")} disabled={disabled} />
            <button type="button" style={validation.errors.length ? disabledButton : verifyButton} disabled={disabled || validation.errors.length > 0} onClick={() => commit({ ...model, status: "verified", verifiedAt: model.verifiedAt || new Date().toISOString() })}>Mark drawing verified</button>
            {model.status === "verified" ? <div style={{ fontWeight: 900, color: "#087443" }}>Drawing verified</div> : <div style={{ fontWeight: 800, color: "#8a1f1f" }}>Draft drawing - the issued pack will be watermarked</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function updateStabiliser(model: LiftDrawingModelV1, commit: (model: LiftDrawingModelV1) => void, index: number, key: string, value: string) {
  const next = structuredClone(model);
  (next.machine.stabilisers[index] as any)[key] = Number(value) || 0;
  next.status = "draft";
  commit(next);
}
function ObjectEditor({ object, update, remove, disabled }: { object: LiftDrawingObject; update: (key: string, value: any) => void; remove: () => void; disabled?: boolean }) {
  return <div style={subCard}>{object.type === "overhead-service" ? <div style={grid2}><NumberField label="X1" value={object.x1M} onChange={(v) => update("x1M", Number(v) || 0)} disabled={disabled} /><NumberField label="Y1" value={object.y1M} onChange={(v) => update("y1M", Number(v) || 0)} disabled={disabled} /><NumberField label="X2" value={object.x2M} onChange={(v) => update("x2M", Number(v) || 0)} disabled={disabled} /><NumberField label="Y2" value={object.y2M} onChange={(v) => update("y2M", Number(v) || 0)} disabled={disabled} /><NumberField label="Height" value={object.heightM} onChange={(v) => update("heightM", Number(v) || 0)} disabled={disabled} /><Text label="Label" value={object.label} onChange={(v) => update("label", v)} disabled={disabled} /></div> : object.type === "note" ? <><div style={grid2}><NumberField label="X" value={object.xM} onChange={(v) => update("xM", Number(v) || 0)} disabled={disabled} /><NumberField label="Y" value={object.yM} onChange={(v) => update("yM", Number(v) || 0)} disabled={disabled} /></div><Text label="Text" value={object.text} onChange={(v) => update("text", v)} disabled={disabled} /></> : <><div style={grid2}><NumberField label="X" value={object.xM} onChange={(v) => update("xM", Number(v) || 0)} disabled={disabled} /><NumberField label="Y" value={object.yM} onChange={(v) => update("yM", Number(v) || 0)} disabled={disabled} /><NumberField label="Width" value={object.widthM} onChange={(v) => update("widthM", Number(v) || 0)} disabled={disabled} /><NumberField label="Depth" value={object.depthM} onChange={(v) => update("depthM", Number(v) || 0)} disabled={disabled} /><NumberField label="Rotation" value={object.rotationDeg} onChange={(v) => update("rotationDeg", Number(v) || 0)} disabled={disabled} /></div><Text label="Label" value={object.label} onChange={(v) => update("label", v)} disabled={disabled} /></>}<button type="button" onClick={remove} disabled={disabled} style={removeButton}>Remove object</button></div>;
}
function Group({ title, children }: { title: string; children: React.ReactNode }) { return <div style={group}><div style={groupTitle}>{title}</div><div style={{ display: "grid", gap: 9 }}>{children}</div></div>; }
function Text({ label, value, onChange, disabled, type = "text" }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; type?: string }) { return <label style={field}><span style={labelStyle}>{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={input} /></label>; }
function NumberField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (value: string) => void; disabled?: boolean }) { return <Text label={label} value={String(value ?? "")} onChange={onChange} disabled={disabled} type="number" />; }
function Select({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; disabled?: boolean }) { return <label style={field}><span style={labelStyle}>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={input}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>; }

const editor: CSSProperties = { border: "1px solid rgba(0,0,0,.12)", borderRadius: 14, background: "rgba(255,255,255,.74)", padding: 16, display: "grid", gap: 14 };
const header: CSSProperties = { display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" };
const hint: CSSProperties = { fontSize: 12, opacity: .72, marginTop: 4, lineHeight: 1.45 };
const editorGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 14, alignItems: "start" };
const propertyPanel: CSSProperties = { display: "grid", gap: 10, maxHeight: 870, overflowY: "auto", paddingRight: 4 };
const previewPanel: CSSProperties = { display: "grid", gap: 10, position: "sticky", top: 8 };
const preview: CSSProperties = { height: 520, border: "1px solid #64748b", background: "#fff" };
const group: CSSProperties = { border: "1px solid rgba(0,0,0,.1)", borderRadius: 10, padding: 11, background: "rgba(255,255,255,.8)" };
const groupTitle: CSSProperties = { fontWeight: 900, marginBottom: 9 };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 8 };
const field: CSSProperties = { display: "grid", gap: 4 };
const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 800, color: "#334155" };
const input: CSSProperties = { width: "100%", minHeight: 36, borderRadius: 7, border: "1px solid #b7c1ca", padding: "0 8px", boxSizing: "border-box", background: "#fff" };
const check: CSSProperties = { display: "flex", gap: 7, alignItems: "center", fontWeight: 700, fontSize: 12 };
const subCard: CSSProperties = { border: "1px dashed #94a3b8", borderRadius: 8, padding: 9, display: "grid", gap: 8 };
const viewTabs: CSSProperties = { display: "flex", gap: 6 };
const tab: CSSProperties = { padding: "8px 12px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, fontWeight: 800 };
const activeTab: CSSProperties = { ...tab, background: "#0f2942", color: "#fff" };
const verificationBox: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end", border: "1px solid rgba(0,0,0,.1)", borderRadius: 10, padding: 10, background: "#fff" };
const verifyButton: CSSProperties = { padding: "9px 12px", border: 0, borderRadius: 8, background: "#087443", color: "#fff", fontWeight: 900 };
const disabledButton: CSSProperties = { ...verifyButton, background: "#94a3b8" };
const removeButton: CSSProperties = { padding: "7px 9px", border: "1px solid #b42318", color: "#b42318", borderRadius: 7, background: "#fff", fontWeight: 800, justifySelf: "start" };
