import type { LiftDrawingModelV1 } from "./types";

export default function ElevationView({ model }: { model: LiftDrawingModelV1 }) {
  const width = Math.max(model.site.widthM, model.lift.radiusM + model.machine.lengthM + 8, 25);
  const height = Math.max(model.lift.hookHeightM + 8, 20);
  const pivotX = Math.max(4, model.machine.lengthM / 2 + 2);
  const groundY = height - 2;
  const pivotY = groundY - 1.4;
  const boomAngle = (model.lift.boomAngleDeg * Math.PI) / 180;
  const tipX = pivotX + model.lift.boomLengthM * Math.cos(boomAngle);
  const tipY = pivotY - model.lift.boomLengthM * Math.sin(boomAngle);
  const loadBottomY = groundY - Math.max(0, model.lift.landing.levelM);
  const loadTopY = loadBottomY - model.lift.loadHeightM;
  const grossLoadKg = Math.max(0, model.lift.loadWeightKg) + Math.max(0, model.lift.accessoryWeightKg);
  const bodyX = pivotX - model.machine.lengthM / 2;
  const cabWidth = model.machine.type.startsWith("hiab")
    ? Math.min(model.machine.cabLengthM ?? 2.8, model.machine.lengthM * 0.35)
    : Math.min(2.4, model.machine.lengthM * 0.25);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lift arrangement side elevation" style={{ width: "100%", height: "100%", background: "#fff" }}>
      <defs>
        <pattern id="elevationGrid" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dce3e9" strokeWidth="0.025" />
        </pattern>
        <marker id="elevationDimensionArrow" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto-start-reverse">
          <path d="M5,0 L0,2.5 L5,5" fill="none" stroke="#111827" strokeWidth=".7" />
        </marker>
      </defs>
      <rect width={width} height={height} fill="url(#elevationGrid)" stroke="#111827" strokeWidth=".08" />
      <line x1="0" y1={groundY} x2={width} y2={groundY} stroke="#111827" strokeWidth=".14" />
      <text x={width - .6} y={groundY - .25} textAnchor="end" fontSize=".48" fill="#475569">GROUND / SUPPORT LEVEL</text>
      <rect x={bodyX} y={groundY - 1.8} width={model.machine.lengthM} height="1.55" rx=".08" fill="#edf2f7" stroke="#111827" strokeWidth=".1" />
      <path d={`M ${bodyX} ${groundY - .25} L ${bodyX} ${groundY - 1.8} L ${bodyX + cabWidth * .72} ${groundY - 1.8} L ${bodyX + cabWidth} ${groundY - .95} L ${bodyX + cabWidth} ${groundY - .25} Z`} fill="#b8c4ce" stroke="#111827" strokeWidth=".08" />
      <line x1={bodyX + cabWidth * .65} y1={groundY - 1.72} x2={bodyX + cabWidth * .9} y2={groundY - 1.02} stroke="#64748b" strokeWidth=".05" />
      <text x={bodyX + model.machine.lengthM / 2} y={groundY - .72} textAnchor="middle" fontSize=".48" fontWeight="700">{model.machine.label || "MACHINE"}</text>
      <circle cx={pivotX - model.machine.lengthM * .3} cy={groundY} r=".55" fill="#334155" />
      <circle cx={pivotX + model.machine.lengthM * .3} cy={groundY} r=".55" fill="#334155" />
      <circle cx={pivotX - model.machine.lengthM * .08} cy={groundY} r=".48" fill="#334155" />
      <circle cx={pivotX + model.machine.lengthM * .18} cy={groundY} r=".48" fill="#334155" />
      <g stroke="#111827" strokeWidth=".08">
        <line x1={pivotX - 2.2} y1={groundY - 1.8} x2={pivotX - 2.2} y2={groundY - .08} />
        <line x1={pivotX + 2.2} y1={groundY - 1.8} x2={pivotX + 2.2} y2={groundY - .08} />
      </g>
      <g fill="#f4df9b" stroke="#111827" strokeWidth=".06">
        <rect x={pivotX - 2.8} y={groundY - .08} width="1.2" height=".16" />
        <rect x={pivotX + 1.6} y={groundY - .08} width="1.2" height=".16" />
      </g>
      <circle cx={pivotX} cy={pivotY} r=".32" fill="#111827" />
      <text x={pivotX - .6} y={pivotY - .5} textAnchor="end" fontSize=".48">CENTRE OF ROTATION</text>
      <line x1={pivotX} y1={pivotY} x2={tipX} y2={tipY} stroke="#0f2942" strokeWidth=".42" />
      <line x1={pivotX} y1={pivotY - .12} x2={tipX} y2={tipY - .12} stroke="#64748b" strokeWidth=".07" />
      <circle cx={tipX} cy={tipY} r=".18" fill="#111827" />
      <line x1={tipX} y1={tipY} x2={tipX} y2={loadTopY - .25} stroke="#111827" strokeWidth=".07" />
      <path d={`M ${tipX - .18} ${loadTopY - .25} L ${tipX} ${loadTopY} L ${tipX + .18} ${loadTopY - .25}`} fill="none" stroke="#111827" strokeWidth=".07" />
      <rect x={tipX - model.lift.loadLengthM / 2} y={loadTopY} width={model.lift.loadLengthM} height={model.lift.loadHeightM} fill="#dbeafe" stroke="#1e3a8a" strokeWidth=".08" />
      <text x={tipX} y={loadTopY + model.lift.loadHeightM / 2} textAnchor="middle" dominantBaseline="middle" fontSize=".5" fontWeight="700">{grossLoadKg.toLocaleString("en-GB")} kg GROSS LOAD</text>
      <line x1={pivotX} y1={height - .95} x2={tipX} y2={height - .95} stroke="#111827" strokeWidth=".05" markerStart="url(#elevationDimensionArrow)" markerEnd="url(#elevationDimensionArrow)" />
      <line x1={pivotX} y1={groundY + .08} x2={pivotX} y2={height - .55} stroke="#111827" strokeWidth=".05" />
      <line x1={tipX} y1={loadBottomY + .08} x2={tipX} y2={height - .55} stroke="#111827" strokeWidth=".05" />
      <text x={(pivotX + tipX) / 2} y={height - .25} textAnchor="middle" fontSize=".55" fontWeight="700">WORKING RADIUS {model.lift.radiusM || "—"} m</text>
      <line x1={tipX + 1.15} y1={groundY} x2={tipX + 1.15} y2={tipY} stroke="#111827" strokeWidth=".05" markerStart="url(#elevationDimensionArrow)" markerEnd="url(#elevationDimensionArrow)" />
      <line x1={tipX + .75} y1={groundY} x2={tipX + 1.5} y2={groundY} stroke="#111827" strokeWidth=".05" />
      <line x1={tipX + .75} y1={tipY} x2={tipX + 1.5} y2={tipY} stroke="#111827" strokeWidth=".05" />
      <text x={tipX + 1.45} y={(groundY + tipY) / 2} fontSize=".52" fontWeight="700">HOOK HEIGHT {model.lift.hookHeightM || "—"} m</text>
      <text x={pivotX + 2.1} y={pivotY - 1.05} fontSize=".55" fontWeight="700">BOOM {model.lift.boomLengthM || "—"} m @ {model.lift.boomAngleDeg || "—"}°</text>
      <text x={width - .6} y={height - .25} textAnchor="end" fontSize=".42" fill="#475569">DIMENSIONED SIDE ELEVATION — ALL DIMENSIONS IN METRES</text>
    </svg>
  );
}
