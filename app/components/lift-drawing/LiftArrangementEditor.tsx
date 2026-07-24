"use client";

import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useMemo, useRef, useState } from "react";
import DrawingToolbar from "./DrawingToolbar";
import DrawingValidationPanel from "./DrawingValidationPanel";
import ElevationView from "./ElevationView";
import PlanView, { type LiftDrawingLayers } from "./PlanView";
import { createDefaultLiftDrawing } from "./defaults";
import type {
  LiftDrawingModelV1,
  LiftDrawingObject,
  LiftMachineType,
  LiftTechnicalSchedule,
} from "./types";
import { validateLiftDrawing } from "../../lib/liftDrawingValidation";

type Viewport = { xM: number; yM: number; widthM: number; heightM: number };
type Tool = "select" | "pan" | "calibrate";
type Selection =
  | { kind: "machine" | "pick" | "landing"; id: string }
  | { kind: "object"; id: string }
  | null;

type DragState = {
  selection: Selection;
  startModel: LiftDrawingModelV1;
  startPoint: { xM: number; yM: number };
  panStart?: { clientX: number; clientY: number; viewport: Viewport };
};

const DEFAULT_LAYERS: Required<LiftDrawingLayers> = {
  basis: true,
  grid: true,
  site: true,
  machine: true,
  supports: true,
  load: true,
  services: true,
  exclusion: true,
  annotations: true,
};

export default function LiftArrangementEditor({
  value,
  onChange,
  schedule,
  machineType,
  machineLabel,
  drawingNumber,
  personnelOptions,
  disabled,
}: {
  value?: LiftDrawingModelV1 | null;
  onChange: (model: LiftDrawingModelV1) => void;
  schedule: LiftTechnicalSchedule;
  machineType: LiftMachineType;
  machineLabel: string;
  drawingNumber: string;
  personnelOptions?: string[];
  disabled?: boolean;
}) {
  const model = value ?? createDefaultLiftDrawing({
    machineType,
    machineLabel,
    drawingNumber,
    loadWeightKg: Number(schedule.loadWeightKg) || 0,
    accessoryWeightKg: Number(schedule.accessoryWeightKg) || 0,
    accessoryWeightConfirmed: Boolean(schedule.accessoryWeightConfirmed),
    loadLengthM: Number(schedule.loadLengthM) || 0,
    loadWidthM: Number(schedule.loadWidthM) || 0,
    loadHeightM: Number(schedule.loadHeightM) || 0,
    radiusM: Number(schedule.radiusM) || 0,
    boomLengthM: Number(schedule.boomLengthM) || 0,
    boomAngleDeg: Number(schedule.boomAngleDeg) || 0,
    hookHeightM: Number(schedule.hookHeightM) || 0,
    exactConfiguration: String(schedule.exactConfiguration ?? ""),
    chartSource: String(schedule.chartSource ?? ""),
    chartPage: String(schedule.chartPage ?? ""),
    chartCapacityKg: Number(schedule.chartCapacityKg) || 0,
    utilisationPercent: Number(schedule.utilisationPercent) || 0,
    stabiliserSetup: String(schedule.stabiliserSetup ?? ""),
    workingSector: String(schedule.workingSector ?? ""),
    workingSectorStartDeg: Number(schedule.workingSectorStartDeg) || -15,
    workingSectorEndDeg: Number(schedule.workingSectorEndDeg) || 105,
    operatingWeightKg: Number(schedule.operatingWeightKg) || 0,
    groundPressureKgM2: Number(schedule.groundPressureKgM2) || 0,
    matLengthM: Number(schedule.matLengthM) || 1,
    matWidthM: Number(schedule.matWidthM) || 1,
    liftingAccessories: String(schedule.liftingAccessories ?? ""),
    siteHazards: String(schedule.siteHazards ?? ""),
    controlMeasures: String(schedule.controlMeasures ?? ""),
  });
  const [undoStack, setUndoStack] = useState<LiftDrawingModelV1[]>([]);
  const [redoStack, setRedoStack] = useState<LiftDrawingModelV1[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [view, setView] = useState<"plan" | "elevation">("plan");
  const [tool, setTool] = useState<Tool>("select");
  const [snap, setSnap] = useState(true);
  const [layers, setLayers] = useState<Required<LiftDrawingLayers>>(DEFAULT_LAYERS);
  const [viewport, setViewport] = useState<Viewport>(() => fullViewport(model));
  const [calibrationPoints, setCalibrationPoints] = useState<Array<{ xM: number; yM: number }>>([]);
  const [knownDistanceM, setKnownDistanceM] = useState("");
  const [basisMessage, setBasisMessage] = useState("");
  const drag = useRef<DragState | null>(null);
  const liveModel = useRef(model);
  liveModel.current = model;
  const validation = useMemo(
    () => validateLiftDrawing(model, schedule),
    [model, schedule],
  );

  function invalidate(next: LiftDrawingModelV1) {
    return {
      ...next,
      status: "draft" as const,
      verifiedBy: undefined,
      verifiedAt: undefined,
    };
  }

  function commit(next: LiftDrawingModelV1, invalidateVerification = true) {
    if (disabled) return;
    setUndoStack((items) => [...items.slice(-39), liveModel.current]);
    setRedoStack([]);
    onChange(invalidateVerification ? invalidate(next) : next);
  }

  function patch(path: string, value: unknown) {
    const next = structuredClone(model);
    const keys = path.split(".");
    let target: any = next;
    for (const key of keys.slice(0, -1)) target = target[key];
    target[keys[keys.length - 1]] = value;
    commit(next);
  }

  function numberPatch(path: string, value: string) {
    patch(path, finiteNumber(value));
  }

  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((items) => items.slice(0, -1));
    setRedoStack((items) => [...items.slice(-39), model]);
    onChange(previous);
  }

  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((items) => items.slice(0, -1));
    setUndoStack((items) => [...items.slice(-39), model]);
    onChange(next);
  }

  function addObject(type: LiftDrawingObject["type"]) {
    const id = `${type}-${Date.now()}`;
    const centre = { xM: model.site.widthM / 2, yM: model.site.depthM / 2 };
    let item: LiftDrawingObject;
    if (type === "overhead-service") {
      item = {
        id,
        type,
        x1M: centre.xM - 6,
        y1M: centre.yM - 4,
        x2M: centre.xM + 6,
        y2M: centre.yM - 4,
        heightM: 8,
        label: "Overhead service",
      };
    } else if (type === "note") {
      item = { id, type, ...centre, text: "Drawing note" };
    } else if (type === "line" || type === "fence" || type === "dimension") {
      item = {
        id,
        type,
        x1M: centre.xM - 3,
        y1M: centre.yM,
        x2M: centre.xM + 3,
        y2M: centre.yM,
        label: type === "dimension" ? "CLEARANCE" : type.toUpperCase(),
      };
    } else if (type === "polyline" || type === "polygon") {
      item = {
        id,
        type,
        points: [
          { xM: centre.xM - 3, yM: centre.yM - 2 },
          { xM: centre.xM + 3, yM: centre.yM - 2 },
          { xM: centre.xM + 2, yM: centre.yM + 2 },
        ],
        label: type.toUpperCase(),
      };
    } else {
      item = {
        id,
        type,
        xM: centre.xM - 4,
        yM: centre.yM - 3,
        widthM: type === "road" ? 12 : 8,
        depthM: type === "road" ? 5 : 6,
        heightM: type === "building" ? 6 : undefined,
        rotationDeg: 0,
        label: titleCase(type),
      };
    }
    commit({ ...model, objects: [...model.objects, item] });
    setSelection({ kind: "object", id });
    setTool("select");
  }

  function selectedObject() {
    return selection?.kind === "object"
      ? model.objects.find((item) => item.id === selection.id) ?? null
      : null;
  }

  function updateObject(id: string, key: string, value: unknown) {
    commit({
      ...model,
      objects: model.objects.map((item) =>
        item.id === id
          ? ({ ...item, [key]: value } as LiftDrawingObject)
          : item,
      ),
    });
  }

  function removeSelection() {
    if (!selection || disabled) return;
    if (selection.kind === "object") {
      commit({
        ...model,
        objects: model.objects.filter((item) => item.id !== selection.id),
      });
      setSelection(null);
    }
  }

  function duplicateSelection() {
    const source = selectedObject();
    if (!source || disabled) return;
    const duplicate = offsetObject(
      structuredClone(source),
      `${source.type}-${Date.now()}`,
      1,
      1,
    );
    commit({ ...model, objects: [...model.objects, duplicate] });
    setSelection({ kind: "object", id: duplicate.id });
  }

  function pointFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      xM: viewport.xM + ((event.clientX - rect.left) / rect.width) * viewport.widthM,
      yM: viewport.yM + ((event.clientY - rect.top) / rect.height) * viewport.heightM,
    };
    const increment = snap ? .25 : .01;
    return {
      xM: clamp(Math.round(point.xM / increment) * increment, 0, model.site.widthM),
      yM: clamp(Math.round(point.yM / increment) * increment, 0, model.site.depthM),
    };
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (view !== "plan" || disabled) return;
    const point = pointFromEvent(event);
    if (tool === "calibrate") {
      setCalibrationPoints((points) => [...points.slice(-1), point]);
      return;
    }
    if (tool === "pan") {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        selection: null,
        startModel: structuredClone(model),
        startPoint: point,
        panStart: {
          clientX: event.clientX,
          clientY: event.clientY,
          viewport,
        },
      };
      return;
    }
    const element = event.target as SVGElement;
    const objectId = element.closest("[data-drag-object]")?.getAttribute("data-drag-object");
    const kind = element.closest("[data-drag-kind]")?.getAttribute("data-drag-kind") as
      | "machine"
      | "pick"
      | "landing"
      | null;
    const nextSelection: Selection = objectId
      ? { kind: "object", id: objectId }
      : kind
        ? { kind, id: kind }
        : null;
    setSelection(nextSelection);
    if (!nextSelection) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      selection: nextSelection,
      startModel: structuredClone(model),
      startPoint: point,
    };
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || disabled) return;
    if (active.panStart) {
      const rect = event.currentTarget.getBoundingClientRect();
      const dx = ((event.clientX - active.panStart.clientX) / rect.width) * active.panStart.viewport.widthM;
      const dy = ((event.clientY - active.panStart.clientY) / rect.height) * active.panStart.viewport.heightM;
      setViewport(clampViewport({
        ...active.panStart.viewport,
        xM: active.panStart.viewport.xM - dx,
        yM: active.panStart.viewport.yM - dy,
      }, model));
      return;
    }
    if (!active.selection) return;
    const point = pointFromEvent(event);
    const dx = point.xM - active.startPoint.xM;
    const dy = point.yM - active.startPoint.yM;
    const next = structuredClone(active.startModel);
    if (active.selection.kind === "machine") {
      next.machine.xM = clamp(active.startModel.machine.xM + dx, 0, next.site.widthM);
      next.machine.yM = clamp(active.startModel.machine.yM + dy, 0, next.site.depthM);
    } else if (active.selection.kind === "pick" || active.selection.kind === "landing") {
      const sourcePoint = active.startModel.lift[active.selection.kind];
      next.lift[active.selection.kind].xM = clamp(sourcePoint.xM + dx, 0, next.site.widthM);
      next.lift[active.selection.kind].yM = clamp(sourcePoint.yM + dy, 0, next.site.depthM);
    } else {
      next.objects = next.objects.map((item) =>
        item.id === active.selection?.id
          ? offsetObject(item, item.id, dx, dy)
          : item,
      );
    }
    onChange(invalidate(next));
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active) return;
    if (!active.panStart) {
      setUndoStack((items) => [...items.slice(-39), active.startModel]);
      setRedoStack([]);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
  }

  function zoom(event: ReactWheelEvent<HTMLDivElement>) {
    if (view !== "plan") return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = {
      xM: viewport.xM + ((event.clientX - rect.left) / rect.width) * viewport.widthM,
      yM: viewport.yM + ((event.clientY - rect.top) / rect.height) * viewport.heightM,
    };
    const scale = event.deltaY > 0 ? 1.18 : .84;
    const nextWidth = clamp(viewport.widthM * scale, Math.min(8, model.site.widthM), model.site.widthM);
    const nextHeight = clamp(viewport.heightM * scale, Math.min(6, model.site.depthM), model.site.depthM);
    const ratioX = (pointer.xM - viewport.xM) / viewport.widthM;
    const ratioY = (pointer.yM - viewport.yM) / viewport.heightM;
    setViewport(clampViewport({
      xM: pointer.xM - nextWidth * ratioX,
      yM: pointer.yM - nextHeight * ratioY,
      widthM: nextWidth,
      heightM: nextHeight,
    }, model));
  }

  async function loadSiteBasis(file: File | null) {
    if (!file || disabled) return;
    setBasisMessage("Preparing site basis...");
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (["dxf", "dwg"].includes(extension || "")) {
        const next = structuredClone(model);
        next.site.basis = {
          kind: "dxf-reference",
          name: file.name,
          opacity: .55,
          rotationDeg: 0,
        };
        commit(next);
        setBasisMessage("CAD file retained as a drawing reference. Use an exported image/PDF page for browser overlay.");
        return;
      }
      if (file.size > 4_000_000) {
        throw new Error("Use a site-plan image or PDF page smaller than 4 MB.");
      }
      let dataUrl = "";
      let kind: "image" | "pdf-page" = "image";
      if (file.type === "application/pdf" || extension === "pdf") {
        kind = "pdf-page";
        dataUrl = await renderPdfFirstPage(file);
      } else if (file.type.startsWith("image/")) {
        dataUrl = await fileToDataUrl(file);
      } else {
        throw new Error("Use PNG, JPG, WEBP, PDF, DXF or DWG.");
      }
      if (dataUrl.length > 2_800_000) {
        throw new Error("The rendered site basis is too large. Use a lower-resolution image.");
      }
      const next = structuredClone(model);
      next.site.basis = {
        kind,
        name: file.name,
        dataUrl,
        pageNumber: kind === "pdf-page" ? 1 : undefined,
        opacity: .55,
        rotationDeg: 0,
      };
      next.scaleMode = "diagrammatic";
      next.site.scaleCalibrated = false;
      commit(next);
      setTool("calibrate");
      setCalibrationPoints([]);
      setBasisMessage("Site basis loaded. Select Calibrate, click two known points and enter their real distance.");
    } catch (error: any) {
      setBasisMessage(error?.message || "Could not load the site basis.");
    }
  }

  function calibrate() {
    if (calibrationPoints.length !== 2) return;
    const known = Number(knownDistanceM);
    const current = Math.hypot(
      calibrationPoints[1].xM - calibrationPoints[0].xM,
      calibrationPoints[1].yM - calibrationPoints[0].yM,
    );
    if (!Number.isFinite(known) || known <= 0 || current <= 0) {
      setBasisMessage("Enter a valid known distance and select two different points.");
      return;
    }
    const ratio = known / current;
    const next = scaleSiteCoordinates(model, ratio);
    next.scaleMode = "verified-scale";
    next.site.scaleCalibrated = true;
    next.site.calibrationDistanceM = known;
    commit(next);
    setViewport(fullViewport(next));
    setCalibrationPoints([]);
    setKnownDistanceM("");
    setTool("select");
    setBasisMessage(`Site basis calibrated from ${known.toFixed(2)} m.`);
  }

  function verifyEnteredSiteDimensions() {
    const next = structuredClone(model);
    next.scaleMode = "verified-scale";
    next.site.scaleCalibrated = true;
    next.site.calibrationDistanceM = Math.max(model.site.widthM, model.site.depthM);
    commit(next);
    setBasisMessage("Entered site dimensions marked as verified by the AP.");
  }

  function verifyMachineGeometry() {
    const next = structuredClone(model);
    next.machine.dimensionsVerified = true;
    next.machine.supportGeometryVerified = true;
    next.machine.dimensionsSource =
      next.machine.dimensionsSource || "AP verified against machine/supplier dimensions";
    commit(next);
  }

  function updateSupportSpan(axis: "x" | "y", value: string) {
    const half = Math.max(0, Number(value) || 0) / 2;
    const next = structuredClone(model);
    next.machine.stabilisers = next.machine.stabilisers.map((support, index) => ({
      ...support,
      xM: axis === "x" ? (index < 2 ? -half : half) : support.xM,
      yM: axis === "y" ? (index % 2 === 0 ? -half : half) : support.yM,
      extensionM: axis === "y" ? half : support.extensionM,
    }));
    next.machine.supportGeometryVerified = false;
    commit(next);
  }

  const object = selectedObject();
  const longitudinal = Math.abs(
    (model.machine.stabilisers[2]?.xM ?? 0) -
    (model.machine.stabilisers[0]?.xM ?? 0),
  );
  const lateral = Math.abs(
    (model.machine.stabilisers[1]?.yM ?? 0) -
    (model.machine.stabilisers[0]?.yM ?? 0),
  );
  const grossLoad =
    Math.max(0, Number(schedule.loadWeightKg) || 0) +
    Math.max(0, Number(schedule.accessoryWeightKg) || 0);

  return (
    <section style={editor}>
      <header style={header}>
        <div>
          <div style={eyebrow}>SHARED CRANE / HIAB DRAWING ENGINE</div>
          <h3 style={heading}>Technical lift arrangement</h3>
          <div style={hint}>
            Technical duty values come from the saved lift plan. This workspace
            positions the verified machine, load path, site features and
            dimensions; it does not create a second copy of the engineering data.
          </div>
        </div>
        <div style={statusPill(model.status === "verified")}>
          {model.status === "verified" ? "VERIFIED" : "DRAFT"}
        </div>
      </header>

      <div style={technicalStrip}>
        <Fact label="Machine" value={machineLabel || "Not selected"} />
        <Fact label="Configuration" value={String(schedule.exactConfiguration || "Not selected")} />
        <Fact label="Gross load" value={grossLoad > 0 ? `${grossLoad.toLocaleString("en-GB")} kg` : "-"} />
        <Fact label="Worst radius" value={schedule.radiusM ? `${schedule.radiusM} m` : "-"} />
        <Fact label="Chart capacity" value={schedule.chartCapacityKg ? `${Number(schedule.chartCapacityKg).toLocaleString("en-GB")} kg` : "-"} />
        <Fact label="Utilisation" value={schedule.utilisationPercent ? `${schedule.utilisationPercent}%` : "-"} />
        <Fact label="Supports" value={String(schedule.stabiliserSetup || "Not selected")} />
        <Fact label="Sector" value={String(schedule.workingSector || "Not selected")} />
      </div>

      <DrawingToolbar
        tool={tool}
        onTool={setTool}
        onUndo={undo}
        onRedo={redo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onAddObject={addObject}
        onDirectPath={() => patch("lift.travelPath", [
          { xM: model.lift.pick.xM, yM: model.lift.pick.yM },
          { xM: model.lift.landing.xM, yM: model.lift.landing.yM },
        ])}
        onDuplicate={duplicateSelection}
        onDelete={removeSelection}
        hasSelection={Boolean(object)}
        onFit={() => setViewport(fullViewport(model))}
        grid={layers.grid}
        snap={snap}
        onToggleGrid={() => setLayers((current) => ({ ...current, grid: !current.grid }))}
        onToggleSnap={() => setSnap((current) => !current)}
        disabled={disabled}
      />

      <div style={workspace}>
        <aside style={leftRail}>
          <Panel title="Site basis and scale">
            <label style={uploadButton}>
              Import site plan / PDF / CAD reference
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,.dxf,.dwg,image/*,application/pdf"
                onChange={(event) => void loadSiteBasis(event.target.files?.[0] ?? null)}
                disabled={disabled}
                style={{ display: "none" }}
              />
            </label>
            <ReadOnly label="Current basis" value={model.site.basis?.name || "Blank scaled grid"} />
            <div style={twoColumns}>
              <NumberField label="Site width (m)" value={model.site.widthM} onChange={(value) => numberPatch("site.widthM", value)} disabled={disabled} />
              <NumberField label="Site depth (m)" value={model.site.depthM} onChange={(value) => numberPatch("site.depthM", value)} disabled={disabled} />
              <NumberField label="North (deg)" value={model.site.northAngleDeg} onChange={(value) => numberPatch("site.northAngleDeg", value)} disabled={disabled} />
              <NumberField label="Basis opacity" value={model.site.basis?.opacity ?? .55} step=".05" onChange={(value) => {
                const next = structuredClone(model);
                next.site.basis = {
                  ...(next.site.basis ?? { kind: "blank-grid", name: "Blank scaled grid", rotationDeg: 0 }),
                  opacity: clamp(Number(value) || 0, 0, 1),
                };
                commit(next);
              }} disabled={disabled || !model.site.basis} />
            </div>
            <button type="button" style={smallButton} onClick={verifyEnteredSiteDimensions} disabled={disabled}>
              Verify entered site dimensions
            </button>
            {tool === "calibrate" || calibrationPoints.length ? (
              <div style={calibrationBox}>
                <strong>Scale calibration</strong>
                <div>Click two known points on the plan ({calibrationPoints.length}/2 selected).</div>
                <NumberField label="Known distance (m)" value={knownDistanceM} onChange={setKnownDistanceM} disabled={disabled} />
                <button type="button" style={smallPrimary} onClick={calibrate} disabled={disabled || calibrationPoints.length !== 2}>Apply calibration</button>
              </div>
            ) : null}
            {basisMessage ? <div style={message}>{basisMessage}</div> : null}
          </Panel>

          <Panel title="Layers">
            {Object.entries(layers).map(([key, enabled]) => (
              <label key={key} style={layerRow}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => setLayers((current) => ({
                    ...current,
                    [key]: !current[key as keyof typeof current],
                  }))}
                />
                {titleCase(key)}
              </label>
            ))}
          </Panel>

          <Panel title="Drawing identity">
            <Text label="Drawing number" value={model.drawingNumber} onChange={(value) => patch("drawingNumber", value)} disabled={disabled} />
            <Text label="Revision" value={model.revision} onChange={(value) => patch("revision", value)} disabled={disabled} />
            <Select
              label="Prepared by"
              value={model.preparedBy || ""}
              onChange={(value) => patch("preparedBy", value)}
              options={[
                ["", "Select preparer..."],
                ...(personnelOptions ?? []).map((name) => [name, name] as [string, string]),
              ]}
              disabled={disabled}
            />
          </Panel>
        </aside>

        <main style={canvasColumn}>
          <div style={viewTabs}>
            <button type="button" onClick={() => setView("plan")} style={view === "plan" ? activeTab : tab}>Plan view</button>
            <button type="button" onClick={() => setView("elevation")} style={view === "elevation" ? activeTab : tab}>Elevation</button>
            <span style={zoomHint}>{view === "plan" ? "Mouse wheel: zoom | Pan tool: move view | Select tool: drag objects" : "Elevation is generated from the same saved duty and site objects"}</span>
          </div>
          <div
            style={{ ...canvas, cursor: tool === "pan" ? "grab" : tool === "calibrate" ? "crosshair" : "default" }}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            onWheel={zoom}
          >
            {view === "plan" ? (
              <PlanView model={model} viewport={viewport} layers={layers} />
            ) : (
              <ElevationView model={model} />
            )}
            {view === "plan" && calibrationPoints.map((point, index) => (
              <div
                key={`${point.xM}-${point.yM}`}
                style={{
                  ...calibrationMarker,
                  left: `${((point.xM - viewport.xM) / viewport.widthM) * 100}%`,
                  top: `${((point.yM - viewport.yM) / viewport.heightM) * 100}%`,
                }}
              >
                {index + 1}
              </div>
            ))}
          </div>
          <div style={canvasFooter}>
            <span>{model.scaleMode === "verified-scale" && model.site.scaleCalibrated ? "Calibrated scale" : "Diagrammatic - cannot be finalised"}</span>
            <span>View: {viewport.widthM.toFixed(1)} x {viewport.heightM.toFixed(1)} m</span>
            <span>Snap: {snap ? "0.25 m" : "off"}</span>
          </div>
        </main>

        <aside style={rightRail}>
          <Panel title="Selected properties">
            {!selection ? <div style={hint}>Select the machine, PICK, LANDING or a site object.</div> : null}
            {selection?.kind === "machine" ? (
              <>
                <div style={selectedTitle}>{model.machine.label}</div>
                <div style={twoColumns}>
                  <NumberField label="X (m)" value={model.machine.xM} onChange={(value) => numberPatch("machine.xM", value)} disabled={disabled} />
                  <NumberField label="Y (m)" value={model.machine.yM} onChange={(value) => numberPatch("machine.yM", value)} disabled={disabled} />
                  <NumberField label="Rotation (deg)" value={model.machine.rotationDeg} onChange={(value) => numberPatch("machine.rotationDeg", value)} disabled={disabled} />
                </div>
              </>
            ) : null}
            {selection?.kind === "pick" || selection?.kind === "landing" ? (
              <>
                <div style={selectedTitle}>{selection.kind === "pick" ? "Pick position" : "Landing position"}</div>
                <div style={twoColumns}>
                  <NumberField label="X (m)" value={model.lift[selection.kind].xM} onChange={(value) => numberPatch(`lift.${selection.kind}.xM`, value)} disabled={disabled} />
                  <NumberField label="Y (m)" value={model.lift[selection.kind].yM} onChange={(value) => numberPatch(`lift.${selection.kind}.yM`, value)} disabled={disabled} />
                  <NumberField label="Level (m)" value={model.lift[selection.kind].levelM} onChange={(value) => numberPatch(`lift.${selection.kind}.levelM`, value)} disabled={disabled} />
                </div>
              </>
            ) : null}
            {object ? (
              <ObjectProperties
                object={object}
                update={(key, value) => updateObject(object.id, key, value)}
                disabled={disabled}
              />
            ) : null}
          </Panel>

          <Panel title="Verified machine geometry">
            <div style={truthBanner(model.machine.dimensionsVerified && model.machine.supportGeometryVerified)}>
              {model.machine.dimensionsVerified && model.machine.supportGeometryVerified
                ? `Verified - ${model.machine.dimensionsSource || "source recorded"}`
                : "Unverified dimensions - final issue is blocked"}
            </div>
            <div style={twoColumns}>
              <NumberField label="Length (m)" value={model.machine.lengthM} onChange={(value) => {
                numberPatch("machine.lengthM", value);
              }} disabled={disabled || Boolean(model.machine.dimensionsVerified)} />
              <NumberField label="Width (m)" value={model.machine.widthM} onChange={(value) => numberPatch("machine.widthM", value)} disabled={disabled || Boolean(model.machine.dimensionsVerified)} />
              <NumberField label="Crane centre offset (m)" value={model.machine.centreOfRotationOffsetM} onChange={(value) => numberPatch("machine.centreOfRotationOffsetM", value)} disabled={disabled || Boolean(model.machine.dimensionsVerified)} />
              <NumberField label="Longitudinal support span (m)" value={Number(longitudinal.toFixed(2))} onChange={(value) => updateSupportSpan("x", value)} disabled={disabled || Boolean(model.machine.supportGeometryVerified)} />
              <NumberField label="Lateral support spread (m)" value={Number(lateral.toFixed(2))} onChange={(value) => updateSupportSpan("y", value)} disabled={disabled || Boolean(model.machine.supportGeometryVerified)} />
            </div>
            <Text
              label="Dimension source / supplier document"
              value={model.machine.dimensionsSource || ""}
              onChange={(value) => patch("machine.dimensionsSource", value)}
              disabled={disabled || Boolean(model.machine.dimensionsVerified)}
            />
            {!model.machine.dimensionsVerified || !model.machine.supportGeometryVerified ? (
              <button type="button" style={smallPrimary} onClick={verifyMachineGeometry} disabled={disabled || !model.machine.dimensionsSource}>
                AP verify machine and support geometry
              </button>
            ) : null}
          </Panel>

          <Panel title="Drawing verification">
            <DrawingValidationPanel validation={validation} />
            <Select
              label="Verified by"
              value={model.verifiedBy || ""}
              onChange={(value) => patch("verifiedBy", value)}
              options={[
                ["", "Select verifier..."],
                ...(personnelOptions ?? []).map((name) => [name, name] as [string, string]),
              ]}
              disabled={disabled}
            />
            <button
              type="button"
              style={validation.errors.length ? disabledButton : verifyButton}
              disabled={disabled || validation.errors.length > 0 || !model.verifiedBy}
              onClick={() => onChange({
                ...model,
                status: "verified",
                verifiedAt: new Date().toISOString(),
                normalisation: { state: "valid", issues: [] },
              })}
            >
              Mark drawing verified
            </button>
          </Panel>
        </aside>
      </div>
    </section>
  );
}

function ObjectProperties({
  object,
  update,
  disabled,
}: {
  object: LiftDrawingObject;
  update: (key: string, value: any) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <div style={selectedTitle}>{titleCase(object.type)}</div>
      {object.type === "overhead-service" ? (
        <>
          <Text label="Label" value={object.label} onChange={(value) => update("label", value)} disabled={disabled} />
          <div style={twoColumns}>
            <NumberField label="Start X" value={object.x1M} onChange={(value) => update("x1M", finiteNumber(value))} disabled={disabled} />
            <NumberField label="Start Y" value={object.y1M} onChange={(value) => update("y1M", finiteNumber(value))} disabled={disabled} />
            <NumberField label="End X" value={object.x2M} onChange={(value) => update("x2M", finiteNumber(value))} disabled={disabled} />
            <NumberField label="End Y" value={object.y2M} onChange={(value) => update("y2M", finiteNumber(value))} disabled={disabled} />
            <NumberField label="Height (m)" value={object.heightM} onChange={(value) => update("heightM", finiteNumber(value))} disabled={disabled} />
          </div>
        </>
      ) : object.type === "note" ? (
        <>
          <TextArea label="Callout text" value={object.text} onChange={(value) => update("text", value)} disabled={disabled} />
          <div style={twoColumns}>
            <NumberField label="X (m)" value={object.xM} onChange={(value) => update("xM", finiteNumber(value))} disabled={disabled} />
            <NumberField label="Y (m)" value={object.yM} onChange={(value) => update("yM", finiteNumber(value))} disabled={disabled} />
          </div>
        </>
      ) : object.type === "line" || object.type === "fence" || object.type === "dimension" ? (
        <>
          <Text label="Label" value={object.label} onChange={(value) => update("label", value)} disabled={disabled} />
          <div style={twoColumns}>
            <NumberField label="Start X" value={object.x1M} onChange={(value) => update("x1M", finiteNumber(value))} disabled={disabled} />
            <NumberField label="Start Y" value={object.y1M} onChange={(value) => update("y1M", finiteNumber(value))} disabled={disabled} />
            <NumberField label="End X" value={object.x2M} onChange={(value) => update("x2M", finiteNumber(value))} disabled={disabled} />
            <NumberField label="End Y" value={object.y2M} onChange={(value) => update("y2M", finiteNumber(value))} disabled={disabled} />
          </div>
        </>
      ) : object.type === "polyline" || object.type === "polygon" ? (
        <>
          <Text label="Label" value={object.label} onChange={(value) => update("label", value)} disabled={disabled} />
          <div style={hint}>Move the whole object by dragging it. Add another line/polygon for additional vertices.</div>
        </>
      ) : (
        (() => {
          const area = object as Extract<LiftDrawingObject, { widthM: number }>;
          return <>
          <Text label="Label" value={area.label} onChange={(value) => update("label", value)} disabled={disabled} />
          <div style={twoColumns}>
            <NumberField label="X (m)" value={area.xM} onChange={(value) => update("xM", finiteNumber(value))} disabled={disabled} />
            <NumberField label="Y (m)" value={area.yM} onChange={(value) => update("yM", finiteNumber(value))} disabled={disabled} />
            <NumberField label="Width (m)" value={area.widthM} onChange={(value) => update("widthM", finiteNumber(value))} disabled={disabled} />
            <NumberField label="Depth (m)" value={area.depthM} onChange={(value) => update("depthM", finiteNumber(value))} disabled={disabled} />
            <NumberField label="Rotation (deg)" value={area.rotationDeg} onChange={(value) => update("rotationDeg", finiteNumber(value))} disabled={disabled} />
            {area.type === "building" ? (
              <NumberField label="Height (m)" value={area.heightM ?? 0} onChange={(value) => update("heightM", finiteNumber(value))} disabled={disabled} />
            ) : null}
          </div>
        </>;
        })()
      )}
    </>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={panel}>
      <div style={panelTitle}>{title}</div>
      <div style={panelBody}>{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div style={fact}><span>{label}</span><strong>{value}</strong></div>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div style={readOnly}><span>{label}</span><strong>{value || "-"}</strong></div>;
}

function Text({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return <FieldWrap label={label}><input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} style={input} /></FieldWrap>;
}

function TextArea({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return <FieldWrap label={label}><textarea value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={3} style={{ ...input, minHeight: 72, paddingTop: 8, resize: "vertical" }} /></FieldWrap>;
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
  step = ".01",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
  step?: string;
}) {
  return <FieldWrap label={label}><input type="number" step={step} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} style={input} /></FieldWrap>;
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  disabled?: boolean;
}) {
  return <FieldWrap label={label}><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} style={input}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></FieldWrap>;
}

function FieldWrap({ label, children }: { label: string; children: ReactNode }) {
  return <label style={field}><span>{label}</span>{children}</label>;
}

function finiteNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function fullViewport(model: LiftDrawingModelV1): Viewport {
  return {
    xM: 0,
    yM: 0,
    widthM: Math.max(1, model.site.widthM),
    heightM: Math.max(1, model.site.depthM),
  };
}

function clampViewport(viewport: Viewport, model: LiftDrawingModelV1): Viewport {
  return {
    ...viewport,
    xM: clamp(viewport.xM, 0, Math.max(0, model.site.widthM - viewport.widthM)),
    yM: clamp(viewport.yM, 0, Math.max(0, model.site.depthM - viewport.heightM)),
  };
}

function offsetObject(
  item: LiftDrawingObject,
  id: string,
  dx: number,
  dy: number,
): LiftDrawingObject {
  if (item.type === "overhead-service" || item.type === "line" || item.type === "fence" || item.type === "dimension") {
    return {
      ...item,
      id,
      x1M: item.x1M + dx,
      y1M: item.y1M + dy,
      x2M: item.x2M + dx,
      y2M: item.y2M + dy,
    };
  }
  if (item.type === "polyline" || item.type === "polygon") {
    return {
      ...item,
      id,
      points: item.points.map((point) => ({
        xM: point.xM + dx,
        yM: point.yM + dy,
      })),
    };
  }
  if ("xM" in item && "yM" in item) {
    return { ...item, id, xM: item.xM + dx, yM: item.yM + dy };
  }
  return { ...item, id };
}

function scaleSiteCoordinates(model: LiftDrawingModelV1, ratio: number) {
  const next = structuredClone(model);
  next.site.widthM *= ratio;
  next.site.depthM *= ratio;
  next.machine.xM *= ratio;
  next.machine.yM *= ratio;
  next.lift.pick.xM *= ratio;
  next.lift.pick.yM *= ratio;
  next.lift.landing.xM *= ratio;
  next.lift.landing.yM *= ratio;
  next.lift.travelPath = next.lift.travelPath.map((point) => ({
    xM: point.xM * ratio,
    yM: point.yM * ratio,
  }));
  next.objects = next.objects.map((item) => {
    if (item.type === "overhead-service" || item.type === "line" || item.type === "fence" || item.type === "dimension") {
      return {
        ...item,
        x1M: item.x1M * ratio,
        y1M: item.y1M * ratio,
        x2M: item.x2M * ratio,
        y2M: item.y2M * ratio,
      };
    }
    if (item.type === "polyline" || item.type === "polygon") {
      return {
        ...item,
        points: item.points.map((point) => ({
          xM: point.xM * ratio,
          yM: point.yM * ratio,
        })),
      };
    }
    if (item.type === "note") {
      return { ...item, xM: item.xM * ratio, yM: item.yM * ratio };
    }
    if ("widthM" in item && "depthM" in item && "xM" in item && "yM" in item) {
      return {
        ...item,
        xM: item.xM * ratio,
        yM: item.yM * ratio,
        widthM: item.widthM * ratio,
        depthM: item.depthM * ratio,
      };
    }
    return item;
  });
  return next;
}

function titleCase(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function renderPdfFirstPage(file: File) {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  }
  const document = await pdfjs.getDocument({
    data: await file.arrayBuffer(),
    useSystemFonts: true,
  }).promise;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 1.35 });
  const canvas = window.document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the PDF preview canvas.");
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/jpeg", .78);
}

const editor: CSSProperties = {
  display: "grid",
  gap: 12,
  width: "100%",
  padding: 14,
  borderRadius: 14,
  border: "1px solid #9fb0bf",
  background: "#f3f6f8",
  boxSizing: "border-box",
};
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 };
const eyebrow: CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: ".1em", color: "#0e7490" };
const heading: CSSProperties = { margin: "3px 0 4px", fontSize: 23 };
const hint: CSSProperties = { fontSize: 12, lineHeight: 1.45, color: "#52606d" };
const statusPill = (verified: boolean): CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  color: verified ? "#065f46" : "#991b1b",
  background: verified ? "#d1fae5" : "#fee2e2",
  border: `1px solid ${verified ? "#6ee7b7" : "#fca5a5"}`,
});
const technicalStrip: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(8, minmax(105px,1fr))", gap: 6, overflowX: "auto" };
const fact: CSSProperties = { minWidth: 105, padding: "8px 9px", borderRadius: 8, background: "#fff", border: "1px solid #c8d2db", display: "grid", gap: 2, fontSize: 10 };
const workspace: CSSProperties = { display: "grid", gridTemplateColumns: "235px minmax(640px,1fr) 290px", gap: 10, alignItems: "start", overflowX: "auto" };
const leftRail: CSSProperties = { display: "grid", gap: 9, minWidth: 225 };
const rightRail: CSSProperties = { display: "grid", gap: 9, minWidth: 275 };
const panel: CSSProperties = { background: "#fff", border: "1px solid #c8d2db", borderRadius: 9, overflow: "hidden" };
const panelTitle: CSSProperties = { padding: "8px 10px", background: "#e8eef3", borderBottom: "1px solid #c8d2db", fontSize: 12, fontWeight: 900 };
const panelBody: CSSProperties = { padding: 10, display: "grid", gap: 8 };
const canvasColumn: CSSProperties = { minWidth: 640, display: "grid", gap: 0 };
const viewTabs: CSSProperties = { display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", background: "#0f2942", borderRadius: "9px 9px 0 0" };
const tab: CSSProperties = { padding: "7px 11px", border: "1px solid #597083", borderRadius: 6, background: "#1f3f5b", color: "#fff", fontWeight: 800, cursor: "pointer" };
const activeTab: CSSProperties = { ...tab, background: "#fff", color: "#0f2942" };
const zoomHint: CSSProperties = { marginLeft: "auto", color: "#dce7ef", fontSize: 10 };
const canvas: CSSProperties = { position: "relative", height: 650, border: "1px solid #0f2942", borderTop: 0, background: "#fff", overflow: "hidden", touchAction: "none", userSelect: "none" };
const canvasFooter: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 9px", border: "1px solid #9fb0bf", borderTop: 0, borderRadius: "0 0 9px 9px", background: "#e8eef3", fontSize: 10, fontWeight: 700 };
const calibrationMarker: CSSProperties = { position: "absolute", width: 22, height: 22, transform: "translate(-50%,-50%)", borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", background: "#dc2626", border: "2px solid #fff", boxShadow: "0 0 0 1px #991b1b", fontSize: 11, fontWeight: 900, pointerEvents: "none" };
const twoColumns: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 7 };
const field: CSSProperties = { display: "grid", gap: 3, fontSize: 10, fontWeight: 800, color: "#344454" };
const input: CSSProperties = { width: "100%", minHeight: 32, boxSizing: "border-box", border: "1px solid #b8c4ce", borderRadius: 6, padding: "0 8px", background: "#fff", color: "#111827", fontSize: 11 };
const readOnly: CSSProperties = { padding: 7, borderRadius: 6, background: "#f1f5f9", border: "1px solid #d8e0e7", display: "grid", gap: 2, fontSize: 10 };
const uploadButton: CSSProperties = { padding: "9px 10px", borderRadius: 7, background: "#0f2942", color: "#fff", fontSize: 11, fontWeight: 900, textAlign: "center", cursor: "pointer" };
const smallButton: CSSProperties = { padding: "7px 9px", borderRadius: 6, border: "1px solid #9fb0bf", background: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer" };
const smallPrimary: CSSProperties = { ...smallButton, color: "#fff", background: "#0e7490", borderColor: "#0e7490" };
const calibrationBox: CSSProperties = { padding: 8, borderRadius: 7, border: "1px solid #f59e0b", background: "#fffbeb", display: "grid", gap: 6, fontSize: 10, lineHeight: 1.4 };
const message: CSSProperties = { fontSize: 10, lineHeight: 1.4, color: "#334155" };
const layerRow: CSSProperties = { display: "flex", gap: 7, alignItems: "center", fontSize: 11, fontWeight: 750, textTransform: "capitalize" };
const selectedTitle: CSSProperties = { fontSize: 13, fontWeight: 900, color: "#0f2942" };
const truthBanner = (verified: boolean): CSSProperties => ({ padding: 8, borderRadius: 7, background: verified ? "#ecfdf5" : "#fff7ed", border: `1px solid ${verified ? "#6ee7b7" : "#fdba74"}`, color: verified ? "#065f46" : "#9a3412", fontSize: 10, fontWeight: 850, lineHeight: 1.35 });
const verifyButton: CSSProperties = { padding: "9px 12px", border: 0, borderRadius: 7, background: "#087443", color: "#fff", fontWeight: 900, cursor: "pointer" };
const disabledButton: CSSProperties = { ...verifyButton, background: "#94a3b8", cursor: "not-allowed" };
