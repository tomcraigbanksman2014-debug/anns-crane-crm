"use client";

export default function DrawingToolbar({
  onUndo,
  canUndo,
  onAddObject,
  onDirectPath,
  disabled,
}: {
  onUndo: () => void;
  canUndo: boolean;
  onAddObject: (type: "building" | "road" | "pedestrian-route" | "exclusion-zone" | "underground-service" | "overhead-service" | "note") => void;
  onDirectPath: () => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" disabled={!canUndo || disabled} onClick={onUndo} style={button}>Undo</button>
      <button type="button" disabled={disabled} onClick={onDirectPath} style={button}>Set direct pick-to-land path</button>
      <select
        disabled={disabled}
        defaultValue=""
        aria-label="Add drawing object"
        style={select}
        onChange={(event) => {
          const value = event.target.value as Parameters<typeof onAddObject>[0];
          if (value) onAddObject(value);
          event.target.value = "";
        }}
      >
        <option value="">+ Add site object...</option>
        <option value="building">Building</option>
        <option value="road">Road</option>
        <option value="pedestrian-route">Pedestrian route</option>
        <option value="exclusion-zone">Exclusion zone</option>
        <option value="underground-service">Underground service</option>
        <option value="overhead-service">Overhead service</option>
        <option value="note">Note</option>
      </select>
    </div>
  );
}

const button: React.CSSProperties = { padding: "8px 11px", border: "1px solid rgba(0,0,0,.14)", borderRadius: 8, background: "#fff", fontWeight: 800, cursor: "pointer" };
const select: React.CSSProperties = { ...button, minWidth: 190 };
