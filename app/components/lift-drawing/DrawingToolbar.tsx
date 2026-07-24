"use client";

import type { LiftDrawingObject } from "./types";

export default function DrawingToolbar({
  tool,
  onTool,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddObject,
  onDirectPath,
  onDuplicate,
  onDelete,
  hasSelection,
  onFit,
  grid,
  snap,
  onToggleGrid,
  onToggleSnap,
  disabled,
}: {
  tool: "select" | "pan" | "calibrate";
  onTool: (tool: "select" | "pan" | "calibrate") => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddObject: (type: LiftDrawingObject["type"]) => void;
  onDirectPath: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  hasSelection: boolean;
  onFit: () => void;
  grid: boolean;
  snap: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  disabled?: boolean;
}) {
  return (
    <div style={toolbar}>
      <div style={buttonGroup}>
        <ToolButton active={tool === "select"} onClick={() => onTool("select")} disabled={disabled}>Select</ToolButton>
        <ToolButton active={tool === "pan"} onClick={() => onTool("pan")} disabled={disabled}>Pan</ToolButton>
        <ToolButton active={tool === "calibrate"} onClick={() => onTool("calibrate")} disabled={disabled}>Calibrate</ToolButton>
      </div>
      <div style={buttonGroup}>
        <ToolButton onClick={onUndo} disabled={!canUndo || disabled}>Undo</ToolButton>
        <ToolButton onClick={onRedo} disabled={!canRedo || disabled}>Redo</ToolButton>
        <ToolButton onClick={onDuplicate} disabled={!hasSelection || disabled}>Duplicate</ToolButton>
        <ToolButton onClick={onDelete} disabled={!hasSelection || disabled}>Delete</ToolButton>
      </div>
      <div style={buttonGroup}>
        <ToolButton active={grid} onClick={onToggleGrid} disabled={disabled}>Grid</ToolButton>
        <ToolButton active={snap} onClick={onToggleSnap} disabled={disabled}>Snap</ToolButton>
        <ToolButton onClick={onFit}>Fit view</ToolButton>
        <ToolButton onClick={onDirectPath} disabled={disabled}>Direct load path</ToolButton>
      </div>
      <select
        disabled={disabled}
        defaultValue=""
        aria-label="Add drawing object"
        style={select}
        onChange={(event) => {
          const value = event.target.value as LiftDrawingObject["type"];
          if (value) onAddObject(value);
          event.target.value = "";
        }}
      >
        <option value="">+ Insert drawing object...</option>
        <optgroup label="Site">
          <option value="building">Building / obstruction</option>
          <option value="road">Road</option>
          <option value="pedestrian-route">Pedestrian route</option>
          <option value="fence">Fence / wall line</option>
        </optgroup>
        <optgroup label="Safety">
          <option value="exclusion-zone">Exclusion zone</option>
          <option value="underground-service">Underground service zone</option>
          <option value="overhead-service">Overhead service</option>
        </optgroup>
        <optgroup label="Technical annotation">
          <option value="dimension">Dimension line</option>
          <option value="line">Line</option>
          <option value="polyline">Polyline</option>
          <option value="polygon">Polygon</option>
          <option value="note">Text / callout</option>
        </optgroup>
      </select>
    </div>
  );
}

function ToolButton({
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      style={{
        ...button,
        ...(active ? activeButton : {}),
        ...(props.disabled ? disabledButton : {}),
      }}
    >
      {children}
    </button>
  );
}

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};
const buttonGroup: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: 3,
  borderRadius: 8,
  background: "#e8eef3",
};
const button: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #b8c4ce",
  borderRadius: 6,
  background: "#fff",
  color: "#111827",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};
const activeButton: React.CSSProperties = {
  background: "#0f2942",
  borderColor: "#0f2942",
  color: "#fff",
};
const disabledButton: React.CSSProperties = {
  opacity: .46,
  cursor: "not-allowed",
};
const select: React.CSSProperties = {
  ...button,
  minWidth: 210,
  minHeight: 34,
};
