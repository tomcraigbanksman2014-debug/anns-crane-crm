import React from "react";
import type { LiftDrawingModelV1 } from "./types";

function MachineElevation({
  model,
  bodyX,
  groundY,
}: {
  model: LiftDrawingModelV1;
  bodyX: number;
  groundY: number;
}) {
  const length = model.machine.lengthM;
  const cab = Math.min(model.machine.cabLengthM ?? 2.8, length * .38);
  if (model.machine.type === "spider-crane") {
    return (
      <g>
        <rect x={bodyX + length * .3} y={groundY - 1.45} width={length * .4} height="1.2" rx=".12" fill="#dce3e9" stroke="#111827" strokeWidth=".09" />
        <path d={`M ${bodyX + length * .34} ${groundY - .25} L ${bodyX} ${groundY} M ${bodyX + length * .66} ${groundY - .25} L ${bodyX + length} ${groundY}`} stroke="#111827" strokeWidth=".11" />
        <circle cx={bodyX + length * .5} cy={groundY - 1.45} r=".23" fill="#111827" />
      </g>
    );
  }
  if (model.machine.type === "mobile-crane") {
    return (
      <g>
        <rect x={bodyX} y={groundY - 1.55} width={length} height="1.3" rx=".08" fill="#e7edf2" stroke="#111827" strokeWidth=".1" />
        <path d={`M ${bodyX + length - 2.4} ${groundY - 1.55} L ${bodyX + length - .5} ${groundY - 1.55} L ${bodyX + length} ${groundY - .8} L ${bodyX + length} ${groundY - .25} L ${bodyX + length - 2.4} ${groundY - .25} Z`} fill="#b7c4cf" stroke="#111827" strokeWidth=".07" />
        <rect x={bodyX + length * .36} y={groundY - 2.15} width={length * .28} height=".85" rx=".18" fill="#cbd5e1" stroke="#111827" strokeWidth=".08" />
        <circle cx={bodyX + length * .5} cy={groundY - 1.35} r=".24" fill="#111827" />
        {[.14, .33, .58, .82].map((factor) => (
          <circle key={factor} cx={bodyX + length * factor} cy={groundY - .05} r=".48" fill="#334155" />
        ))}
      </g>
    );
  }
  if (model.machine.type === "hiab-artic") {
    const tractor = Math.min(6.4, length * .4);
    return (
      <g>
        <path d={`M ${bodyX} ${groundY - .3} L ${bodyX} ${groundY - 1.75} L ${bodyX + cab * .65} ${groundY - 1.75} L ${bodyX + cab} ${groundY - 1.15} L ${bodyX + cab} ${groundY - .3} Z`} fill="#b7c4cf" stroke="#111827" strokeWidth=".09" />
        <rect x={bodyX + cab} y={groundY - 1.1} width={tractor - cab} height=".8" fill="#e7edf2" stroke="#111827" strokeWidth=".08" />
        <rect x={bodyX + tractor + .35} y={groundY - 1.15} width={length - tractor - .35} height=".85" fill="#f1f5f9" stroke="#111827" strokeWidth=".09" />
        <rect x={bodyX + cab - .25} y={groundY - 2.25} width=".55" height="1.95" fill="#0e7490" stroke="#111827" strokeWidth=".06" />
        <circle cx={bodyX + cab} cy={groundY - 1.95} r=".23" fill="#111827" />
        <circle cx={bodyX + tractor * .38} cy={groundY - .05} r=".5" fill="#334155" />
        <circle cx={bodyX + tractor * .78} cy={groundY - .05} r=".5" fill="#334155" />
        <circle cx={bodyX + length * .79} cy={groundY - .05} r=".5" fill="#334155" />
        <circle cx={bodyX + length * .88} cy={groundY - .05} r=".5" fill="#334155" />
      </g>
    );
  }
  return (
    <g>
      <path d={`M ${bodyX} ${groundY - .3} L ${bodyX} ${groundY - 1.75} L ${bodyX + cab * .65} ${groundY - 1.75} L ${bodyX + cab} ${groundY - 1.15} L ${bodyX + cab} ${groundY - .3} Z`} fill="#b7c4cf" stroke="#111827" strokeWidth=".09" />
      <rect x={bodyX + cab} y={groundY - 1.2} width={length - cab} height=".9" fill="#eef2f6" stroke="#111827" strokeWidth=".09" />
      <rect x={bodyX + cab - .25} y={groundY - 2.25} width=".55" height="1.95" fill="#0e7490" stroke="#111827" strokeWidth=".06" />
      <circle cx={bodyX + cab} cy={groundY - 1.95} r=".23" fill="#111827" />
      {[.2, .42, .72, .84].map((factor) => (
        <circle key={factor} cx={bodyX + length * factor} cy={groundY - .05} r=".48" fill="#334155" />
      ))}
    </g>
  );
}

export default function ElevationView({ model }: { model: LiftDrawingModelV1 }) {
  const radius = Math.max(1, model.lift.radiusM);
  const boomLength = Math.max(1, model.lift.boomLengthM);
  const angleDeg = Math.max(1, model.lift.boomAngleDeg);
  const angle = angleDeg * Math.PI / 180;
  const maxObjectHeight = Math.max(
    0,
    ...model.objects.map((item) =>
      "heightM" in item ? Number(item.heightM) || 0 : 0,
    ),
  );
  const drawingHeight = Math.max(
    18,
    model.lift.hookHeightM + 6,
    boomLength * Math.sin(angle) + 6,
    maxObjectHeight + 5,
  );
  const drawingWidth = Math.max(
    28,
    model.machine.lengthM + radius + 10,
    boomLength * Math.cos(angle) + model.machine.lengthM / 2 + 10,
  );
  const groundY = drawingHeight - 2.2;
  const pivotX = Math.max(5.5, model.machine.lengthM * .48);
  const bodyX = pivotX - (
    model.machine.type.startsWith("hiab")
      ? Math.min(model.machine.cabLengthM ?? 2.8, model.machine.lengthM * .38)
      : model.machine.lengthM / 2
  );
  const pivotY = groundY - (model.machine.type.startsWith("hiab") ? 1.95 : 2.0);
  const tipX = pivotX + boomLength * Math.cos(angle);
  const tipY = pivotY - boomLength * Math.sin(angle);
  const loadBottomY = groundY - Math.max(0, model.lift.landing.levelM);
  const loadTopY = loadBottomY - model.lift.loadHeightM;
  const grossLoadKg = Math.max(0, model.lift.loadWeightKg) + Math.max(0, model.lift.accessoryWeightKg);
  const buildings = model.objects
    .filter((item) => item.type === "building")
    .map((item) => item as Extract<typeof item, { widthM: number }>);
  const overhead = model.objects
    .filter((item) => item.type === "overhead-service")
    .map((item) => item as Extract<typeof item, { type: "overhead-service" }>);

  return (
    <svg
      viewBox={`0 0 ${drawingWidth} ${drawingHeight}`}
      role="img"
      aria-label="Lift arrangement side elevation"
      style={{ width: "100%", height: "100%", background: "#fff" }}
    >
      <defs>
        <pattern id="elevationMinorGrid" width=".5" height=".5" patternUnits="userSpaceOnUse">
          <path d="M .5 0 L 0 0 0 .5" fill="none" stroke="#eef2f6" strokeWidth=".018" />
        </pattern>
        <pattern id="elevationGrid" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="url(#elevationMinorGrid)" />
          <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#cbd5df" strokeWidth=".035" />
        </pattern>
        <marker id="elevationDimensionArrow" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto-start-reverse">
          <path d="M5,0 L0,2.5 L5,5" fill="none" stroke="#111827" strokeWidth=".7" />
        </marker>
      </defs>
      <rect width={drawingWidth} height={drawingHeight} fill="url(#elevationGrid)" stroke="#111827" strokeWidth=".08" />
      <line x1="0" y1={groundY} x2={drawingWidth} y2={groundY} stroke="#111827" strokeWidth=".14" />
      <text x={drawingWidth - .6} y={groundY - .25} textAnchor="end" fontSize=".46" fill="#475569">GROUND / SUPPORT LEVEL 0.00 m</text>

      {buildings.map((building, index) => {
        const x = Math.min(
          drawingWidth - 5,
          Math.max(pivotX + radius * .62, tipX + 2 + index * 2),
        );
        const objectHeight = Math.max(.5, building.heightM ?? 3);
        return (
          <g key={building.id}>
            <rect x={x} y={groundY - objectHeight} width={Math.max(2, building.widthM)} height={objectHeight} fill="#d9dee5" stroke="#1f2937" strokeWidth=".08" />
            <text x={x + Math.max(2, building.widthM) / 2} y={groundY - objectHeight - .3} textAnchor="middle" fontSize=".45" fontWeight="700">{building.label} - H {objectHeight} m</text>
          </g>
        );
      })}
      {overhead.map((service, index) => (
        <g key={service.id}>
          <line x1={pivotX + radius * .8 + index * 1.2} y1={groundY - service.heightM} x2={drawingWidth - 1} y2={groundY - service.heightM} stroke="#d97706" strokeWidth=".11" strokeDasharray=".28 .16" />
          <text x={drawingWidth - 1.2} y={groundY - service.heightM - .25} textAnchor="end" fontSize=".45" fill="#92400e" fontWeight="700">{service.label} - {service.heightM} m</text>
        </g>
      ))}

      <MachineElevation model={model} bodyX={bodyX} groundY={groundY} />
      <g stroke="#111827" strokeWidth=".08">
        <line x1={pivotX - 2.2} y1={groundY - 1.6} x2={pivotX - 2.2} y2={groundY - .08} />
        <line x1={pivotX + 2.2} y1={groundY - 1.6} x2={pivotX + 2.2} y2={groundY - .08} />
      </g>
      <g fill="#f4df9b" stroke="#111827" strokeWidth=".06">
        <rect x={pivotX - 2.8} y={groundY - .08} width="1.2" height=".16" />
        <rect x={pivotX + 1.6} y={groundY - .08} width="1.2" height=".16" />
      </g>
      <circle cx={pivotX} cy={pivotY} r=".3" fill="#111827" />
      <text x={pivotX - .55} y={pivotY - .48} textAnchor="end" fontSize=".44" fontWeight="700">C.O.R.</text>

      <line x1={pivotX} y1={pivotY} x2={tipX} y2={tipY} stroke="#0f2942" strokeWidth=".42" />
      <line x1={pivotX} y1={pivotY - .12} x2={tipX} y2={tipY - .12} stroke="#64748b" strokeWidth=".07" />
      <circle cx={tipX} cy={tipY} r=".17" fill="#111827" />
      <line x1={tipX} y1={tipY} x2={tipX} y2={loadTopY - .25} stroke="#111827" strokeWidth=".07" />
      <path d={`M ${tipX - .18} ${loadTopY - .25} L ${tipX} ${loadTopY} L ${tipX + .18} ${loadTopY - .25}`} fill="none" stroke="#111827" strokeWidth=".07" />
      <rect
        x={tipX - model.lift.loadLengthM / 2}
        y={loadTopY}
        width={model.lift.loadLengthM}
        height={model.lift.loadHeightM}
        fill="#dbeafe"
        stroke="#1e3a8a"
        strokeWidth=".08"
      />
      <text x={tipX} y={loadTopY + model.lift.loadHeightM / 2} textAnchor="middle" dominantBaseline="middle" fontSize=".45" fontWeight="800">{grossLoadKg.toLocaleString("en-GB")} kg</text>
      <text x={tipX} y={loadBottomY + .5} textAnchor="middle" fontSize=".42">LOAD {model.lift.loadLengthM} x {model.lift.loadWidthM} x {model.lift.loadHeightM} m</text>

      <line x1={pivotX} y1={drawingHeight - 1.05} x2={tipX} y2={drawingHeight - 1.05} stroke="#111827" strokeWidth=".05" markerStart="url(#elevationDimensionArrow)" markerEnd="url(#elevationDimensionArrow)" />
      <line x1={pivotX} y1={groundY + .08} x2={pivotX} y2={drawingHeight - .62} stroke="#111827" strokeWidth=".04" />
      <line x1={tipX} y1={loadBottomY + .08} x2={tipX} y2={drawingHeight - .62} stroke="#111827" strokeWidth=".04" />
      <text x={(pivotX + tipX) / 2} y={drawingHeight - .35} textAnchor="middle" fontSize=".5" fontWeight="800">WORKING RADIUS {model.lift.radiusM || "-"} m</text>

      <line x1={tipX + 1.05} y1={groundY} x2={tipX + 1.05} y2={tipY} stroke="#111827" strokeWidth=".05" markerStart="url(#elevationDimensionArrow)" markerEnd="url(#elevationDimensionArrow)" />
      <text x={tipX + 1.35} y={(groundY + tipY) / 2} fontSize=".47" fontWeight="700">HOOK HEIGHT {model.lift.hookHeightM || "-"} m</text>
      <text x={pivotX + 1.8} y={pivotY - .95} fontSize=".48" fontWeight="800">BOOM {model.lift.boomLengthM || "-"} m @ {model.lift.boomAngleDeg || "-"} deg</text>

      <rect x={drawingWidth - 10.8} y=".6" width="10.1" height="1.1" rx=".1" fill="#fff" stroke="#111827" strokeWidth=".055" />
      <text x={drawingWidth - 5.75} y="1.27" textAnchor="middle" fontSize=".42" fontWeight="900">
        {model.scaleMode === "verified-scale" && model.site.scaleCalibrated
          ? "DIMENSIONED SIDE ELEVATION - METRES"
          : "DIAGRAMMATIC - NOT TO SCALE - VERIFICATION REQUIRED"}
      </text>
    </svg>
  );
}
