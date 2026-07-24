import React from "react";
import type { LiftDrawingModelV1, LiftDrawingObject } from "./types";
import { liftRadii, machineCentreOfRotation } from "./geometry";

export type LiftDrawingLayers = {
  basis?: boolean;
  grid?: boolean;
  site?: boolean;
  machine?: boolean;
  supports?: boolean;
  load?: boolean;
  services?: boolean;
  exclusion?: boolean;
  annotations?: boolean;
};

type Viewport = { xM: number; yM: number; widthM: number; heightM: number };

function objectStyle(type: string) {
  if (type === "building") return { fill: "#d9dee5", stroke: "#1f2937" };
  if (type === "road") return { fill: "#eef0f2", stroke: "#4b5563" };
  if (type === "pedestrian-route") return { fill: "#e0f2fe", stroke: "#0369a1" };
  if (type === "exclusion-zone") return { fill: "rgba(220,38,38,.09)", stroke: "#b91c1c" };
  if (type === "underground-service") return { fill: "rgba(126,34,206,.09)", stroke: "#7e22ce" };
  return { fill: "rgba(14,116,144,.08)", stroke: "#0e7490" };
}

function rotatePoint(
  xM: number,
  yM: number,
  rotationDeg: number,
) {
  const angle = rotationDeg * Math.PI / 180;
  return {
    xM: xM * Math.cos(angle) - yM * Math.sin(angle),
    yM: xM * Math.sin(angle) + yM * Math.cos(angle),
  };
}

function distance(a: { xM: number; yM: number }, b: { xM: number; yM: number }) {
  return Math.hypot(a.xM - b.xM, a.yM - b.yM);
}

function SiteObject({ item }: { item: LiftDrawingObject }) {
  if (item.type === "overhead-service") {
    return (
      <g>
        <line
          data-drag-object={item.id}
          x1={item.x1M}
          y1={item.y1M}
          x2={item.x2M}
          y2={item.y2M}
          stroke="#d97706"
          strokeWidth="0.14"
          strokeDasharray=".28 .16"
        />
        <circle cx={item.x1M} cy={item.y1M} r=".12" fill="#d97706" />
        <circle cx={item.x2M} cy={item.y2M} r=".12" fill="#d97706" />
        <text
          x={(item.x1M + item.x2M) / 2}
          y={(item.y1M + item.y2M) / 2 - .28}
          textAnchor="middle"
          fontSize=".48"
          fill="#92400e"
          fontWeight="700"
        >
          {item.label} - {item.heightM} m
        </text>
      </g>
    );
  }
  if (item.type === "note") {
    return (
      <g data-drag-object={item.id}>
        <circle cx={item.xM} cy={item.yM} r=".16" fill="#111827" />
        <path d={`M ${item.xM} ${item.yM} l .65 -.65`} stroke="#111827" strokeWidth=".06" />
        <text x={item.xM + .72} y={item.yM - .65} fontSize=".5" fill="#111827">
          {item.text}
        </text>
      </g>
    );
  }
  if (item.type === "line" || item.type === "fence" || item.type === "dimension") {
    const measured = distance(
      { xM: item.x1M, yM: item.y1M },
      { xM: item.x2M, yM: item.y2M },
    );
    const dimension = item.type === "dimension";
    return (
      <g data-drag-object={item.id}>
        <line
          x1={item.x1M}
          y1={item.y1M}
          x2={item.x2M}
          y2={item.y2M}
          stroke={dimension ? "#111827" : item.type === "fence" ? "#475569" : "#0f172a"}
          strokeWidth={dimension ? ".055" : ".1"}
          strokeDasharray={item.type === "fence" ? ".18 .12" : undefined}
          markerStart={dimension ? "url(#dimensionArrow)" : undefined}
          markerEnd={dimension ? "url(#dimensionArrow)" : undefined}
        />
        <text
          x={(item.x1M + item.x2M) / 2}
          y={(item.y1M + item.y2M) / 2 - .22}
          textAnchor="middle"
          fontSize=".45"
          fontWeight="700"
          fill="#111827"
        >
          {dimension ? `${item.label || "DIM"} ${measured.toFixed(2)} m` : item.label}
        </text>
      </g>
    );
  }
  if (item.type === "polyline" || item.type === "polygon") {
    const points = item.points.map((point) => `${point.xM},${point.yM}`).join(" ");
    return (
      <g data-drag-object={item.id}>
        {item.type === "polygon" ? (
          <polygon
            points={points}
            fill="rgba(71,85,105,.08)"
            stroke="#334155"
            strokeWidth=".08"
          />
        ) : (
          <polyline
            points={points}
            fill="none"
            stroke="#334155"
            strokeWidth=".1"
          />
        )}
        <text
          x={item.points[0]?.xM ?? 0}
          y={(item.points[0]?.yM ?? 0) - .25}
          fontSize=".45"
          fontWeight="700"
        >
          {item.label}
        </text>
      </g>
    );
  }
  const area = item as Extract<LiftDrawingObject, { widthM: number }>;
  const style = objectStyle(area.type);
  return (
    <g
      transform={`rotate(${area.rotationDeg} ${area.xM + area.widthM / 2} ${area.yM + area.depthM / 2})`}
    >
      <rect
        data-drag-object={area.id}
        x={area.xM}
        y={area.yM}
        width={area.widthM}
        height={area.depthM}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth=".08"
        strokeDasharray={area.type.includes("zone") ? ".25 .15" : undefined}
      />
      {area.type === "road" ? (
        <line
          x1={area.xM + .25}
          y1={area.yM + area.depthM / 2}
          x2={area.xM + area.widthM - .25}
          y2={area.yM + area.depthM / 2}
          stroke="#94a3b8"
          strokeWidth=".05"
          strokeDasharray=".45 .25"
        />
      ) : null}
      <text
        x={area.xM + area.widthM / 2}
        y={area.yM + area.depthM / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize=".5"
        fill="#111827"
        fontWeight="700"
      >
        {area.label}{area.heightM ? ` - H ${area.heightM} m` : ""}
      </text>
    </g>
  );
}

function MachinePlan({ model }: { model: LiftDrawingModelV1 }) {
  const machine = model.machine;
  const halfL = machine.lengthM / 2;
  const halfW = machine.widthM / 2;
  const cab = Math.min(machine.cabLengthM ?? 2.8, machine.lengthM * .38);
  if (machine.type === "spider-crane") {
    return (
      <g data-drag-kind="machine">
        <rect x={-halfL * .38} y={-halfW * .4} width={halfL * .76} height={halfW * .8} rx=".18" fill="#dce3e9" stroke="#111827" strokeWidth=".1" />
        <circle cx="0" cy="0" r=".32" fill="#111827" />
        <path d={`M ${-halfL * .25} ${-halfW * .3} L ${-halfL} ${-halfW * 1.9} M ${halfL * .25} ${-halfW * .3} L ${halfL} ${-halfW * 1.9} M ${-halfL * .25} ${halfW * .3} L ${-halfL} ${halfW * 1.9} M ${halfL * .25} ${halfW * .3} L ${halfL} ${halfW * 1.9}`} stroke="#0f172a" strokeWidth=".13" />
      </g>
    );
  }
  if (machine.type === "mobile-crane") {
    return (
      <g data-drag-kind="machine">
        <rect x={-halfL} y={-halfW} width={machine.lengthM} height={machine.widthM} rx=".16" fill="#e7edf2" stroke="#111827" strokeWidth=".11" />
        <path d={`M ${halfL - 2.2} ${-halfW} L ${halfL} ${-halfW * .62} L ${halfL} ${halfW * .62} L ${halfL - 2.2} ${halfW} Z`} fill="#b7c4cf" stroke="#111827" strokeWidth=".07" />
        <rect x={-2.4} y={-1.05} width="4.8" height="2.1" rx=".35" fill="#cbd5e1" stroke="#111827" strokeWidth=".08" />
        <circle cx="0" cy="0" r=".34" fill="#111827" />
        {[-4.5, -1.6, 1.8, 4.6].map((x) => (
          <g key={x}>
            <rect x={x - .42} y={-halfW - .18} width=".84" height=".34" rx=".08" fill="#334155" />
            <rect x={x - .42} y={halfW - .16} width=".84" height=".34" rx=".08" fill="#334155" />
          </g>
        ))}
      </g>
    );
  }
  if (machine.type === "hiab-artic") {
    const tractorL = Math.min(6.4, machine.lengthM * .39);
    const trailerStart = -halfL + tractorL + .35;
    return (
      <g data-drag-kind="machine">
        <path d={`M ${-halfL} ${-halfW} L ${-halfL + cab * .75} ${-halfW} L ${-halfL + cab} ${-halfW * .7} L ${-halfL + cab} ${halfW * .7} L ${-halfL + cab * .75} ${halfW} L ${-halfL} ${halfW} Z`} fill="#b7c4cf" stroke="#111827" strokeWidth=".1" />
        <rect x={-halfL + cab} y={-halfW * .84} width={tractorL - cab} height={machine.widthM * .84} fill="#e7edf2" stroke="#111827" strokeWidth=".08" />
        <rect x={trailerStart} y={-halfW} width={halfL - trailerStart} height={machine.widthM} fill="#f1f5f9" stroke="#111827" strokeWidth=".1" />
        <rect x={-halfL + cab - .28} y={-halfW * .92} width=".58" height={machine.widthM * .92} fill="#0e7490" stroke="#111827" strokeWidth=".06" />
        <circle cx={-halfL + cab} cy="0" r=".25" fill="#111827" />
        <circle cx={trailerStart + .4} cy="0" r=".16" fill="#64748b" />
        <text x={trailerStart + (halfL - trailerStart) / 2} y=".2" textAnchor="middle" fontSize=".42" fill="#475569">TRAILER / LOAD BED</text>
      </g>
    );
  }
  return (
    <g data-drag-kind="machine">
      <path d={`M ${-halfL} ${-halfW} L ${-halfL + cab * .72} ${-halfW} L ${-halfL + cab} ${-halfW * .68} L ${-halfL + cab} ${halfW * .68} L ${-halfL + cab * .72} ${halfW} L ${-halfL} ${halfW} Z`} fill="#b7c4cf" stroke="#111827" strokeWidth=".1" />
      <rect x={-halfL + cab} y={-halfW} width={machine.lengthM - cab} height={machine.widthM} fill="#eef2f6" stroke="#111827" strokeWidth=".1" />
      <rect x={-halfL + cab - .28} y={-halfW * .92} width=".58" height={machine.widthM * .92} fill="#0e7490" stroke="#111827" strokeWidth=".06" />
      <circle cx={-halfL + cab} cy="0" r=".25" fill="#111827" />
      <text x={-halfL + cab + (machine.lengthM - cab) / 2} y=".2" textAnchor="middle" fontSize=".42" fill="#475569">LOAD BED</text>
    </g>
  );
}

export default function PlanView({
  model,
  viewport,
  layers = {},
}: {
  model: LiftDrawingModelV1;
  viewport?: Viewport;
  layers?: LiftDrawingLayers;
}) {
  const width = Math.max(1, model.site.widthM);
  const depth = Math.max(1, model.site.depthM);
  const view = viewport ?? { xM: 0, yM: 0, widthM: width, heightM: depth };
  const centre = machineCentreOfRotation(model);
  const radii = liftRadii(model);
  const grossLoadKg = Math.max(0, model.lift.loadWeightKg) + Math.max(0, model.lift.accessoryWeightKg);
  const pathPoints = [
    model.lift.pick,
    ...model.lift.travelPath,
    model.lift.landing,
  ];
  const path = pathPoints.map((point) => `${point.xM},${point.yM}`).join(" ");
  const start = model.lift.workingSectorStartDeg;
  const end = model.lift.workingSectorEndDeg;
  const sweep = ((end - start) % 360 + 360) % 360;
  const radius = Math.max(.01, radii.maximumRadiusM || model.lift.radiusM);
  const startPoint = {
    xM: centre.xM + Math.cos(start * Math.PI / 180) * radius,
    yM: centre.yM + Math.sin(start * Math.PI / 180) * radius,
  };
  const endPoint = {
    xM: centre.xM + Math.cos(end * Math.PI / 180) * radius,
    yM: centre.yM + Math.sin(end * Math.PI / 180) * radius,
  };
  const visible = (key: keyof LiftDrawingLayers) => layers[key] !== false;
  const isService = (item: LiftDrawingObject) =>
    item.type === "overhead-service" || item.type === "underground-service";
  const isExclusion = (item: LiftDrawingObject) => item.type === "exclusion-zone";
  const isAnnotation = (item: LiftDrawingObject) =>
    ["note", "dimension", "line", "polyline"].includes(item.type);
  const scaleBar = Math.max(1, Math.min(10, Math.round(width / 5)));

  return (
    <svg
      viewBox={`${view.xM} ${view.yM} ${view.widthM} ${view.heightM}`}
      role="img"
      aria-label="Lift arrangement plan view"
      style={{ width: "100%", height: "100%", background: "#fff" }}
    >
      <defs>
        <pattern id="liftMinorGrid" width=".5" height=".5" patternUnits="userSpaceOnUse">
          <path d="M .5 0 L 0 0 0 .5" fill="none" stroke="#edf1f4" strokeWidth="0.018" />
        </pattern>
        <pattern id="liftGrid" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="url(#liftMinorGrid)" />
          <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#cbd5df" strokeWidth="0.035" />
        </pattern>
        <marker id="pathArrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill="#075985" />
        </marker>
        <marker id="dimensionArrow" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto-start-reverse">
          <path d="M5,0 L0,2.5 L5,5" fill="none" stroke="#111827" strokeWidth=".7" />
        </marker>
        <pattern id="exclusionHatch" width=".7" height=".7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2=".7" stroke="#dc2626" strokeWidth=".035" opacity=".38" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={width} height={depth} fill="#fff" />
      {visible("basis") && model.site.basis?.dataUrl ? (
        <image
          href={model.site.basis.dataUrl}
          x="0"
          y="0"
          width={width}
          height={depth}
          opacity={model.site.basis.opacity}
          preserveAspectRatio="none"
          transform={`rotate(${model.site.basis.rotationDeg} ${width / 2} ${depth / 2})`}
        />
      ) : null}
      {visible("grid") ? <rect x="0" y="0" width={width} height={depth} fill="url(#liftGrid)" /> : null}
      <rect x="0" y="0" width={width} height={depth} fill="none" stroke="#111827" strokeWidth=".08" />

      {model.objects.map((item) => {
        if (!visible("site") && !isService(item) && !isExclusion(item) && !isAnnotation(item)) return null;
        if (!visible("services") && isService(item)) return null;
        if (!visible("exclusion") && isExclusion(item)) return null;
        if (!visible("annotations") && isAnnotation(item)) return null;
        return <SiteObject key={item.id} item={item} />;
      })}

      {visible("load") ? (
        <g>
          <path
            d={`M ${centre.xM} ${centre.yM} L ${startPoint.xM} ${startPoint.yM} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${endPoint.xM} ${endPoint.yM} Z`}
            fill="rgba(14,116,144,.06)"
            stroke="#0e7490"
            strokeWidth=".075"
            strokeDasharray=".24 .16"
          />
          <polyline
            points={path}
            fill="none"
            stroke="#075985"
            strokeWidth=".14"
            strokeDasharray=".34 .17"
            markerEnd="url(#pathArrow)"
          />
          <g data-drag-kind="pick">
            <rect
              x={model.lift.pick.xM - model.lift.loadLengthM / 2}
              y={model.lift.pick.yM - model.lift.loadWidthM / 2}
              width={model.lift.loadLengthM}
              height={model.lift.loadWidthM}
              fill="rgba(21,128,61,.16)"
              stroke="#166534"
              strokeWidth=".09"
            />
            <circle cx={model.lift.pick.xM} cy={model.lift.pick.yM} r=".3" fill="#15803d" />
            <text x={model.lift.pick.xM} y={model.lift.pick.yM - model.lift.loadWidthM / 2 - .35} textAnchor="middle" fontSize=".5" fontWeight="800">PICK - {grossLoadKg.toLocaleString("en-GB")} kg</text>
          </g>
          <g data-drag-kind="landing">
            <rect
              x={model.lift.landing.xM - model.lift.loadLengthM / 2}
              y={model.lift.landing.yM - model.lift.loadWidthM / 2}
              width={model.lift.loadLengthM}
              height={model.lift.loadWidthM}
              fill="rgba(29,78,216,.13)"
              stroke="#1d4ed8"
              strokeWidth=".09"
            />
            <circle cx={model.lift.landing.xM} cy={model.lift.landing.yM} r=".3" fill="#1d4ed8" />
            <text x={model.lift.landing.xM} y={model.lift.landing.yM - model.lift.loadWidthM / 2 - .35} textAnchor="middle" fontSize=".5" fontWeight="800">LANDING</text>
          </g>
          <line x1={centre.xM} y1={centre.yM} x2={model.lift.pick.xM} y2={model.lift.pick.yM} stroke="#111827" strokeWidth=".055" markerStart="url(#dimensionArrow)" markerEnd="url(#dimensionArrow)" />
          <text x={(centre.xM + model.lift.pick.xM) / 2} y={(centre.yM + model.lift.pick.yM) / 2 - .28} textAnchor="middle" fontSize=".48" fontWeight="800">PICK R {radii.pickRadiusM.toFixed(2)} m</text>
          <line x1={centre.xM} y1={centre.yM} x2={model.lift.landing.xM} y2={model.lift.landing.yM} stroke="#111827" strokeWidth=".055" markerStart="url(#dimensionArrow)" markerEnd="url(#dimensionArrow)" />
          <text x={(centre.xM + model.lift.landing.xM) / 2} y={(centre.yM + model.lift.landing.yM) / 2 + .52} textAnchor="middle" fontSize=".48" fontWeight="800">LAND R {radii.landingRadiusM.toFixed(2)} m</text>
        </g>
      ) : null}

      {visible("machine") ? (
        <g transform={`translate(${model.machine.xM} ${model.machine.yM}) rotate(${model.machine.rotationDeg})`}>
          <MachinePlan model={model} />
          {visible("supports") ? model.machine.stabilisers.map((support) => (
            <g key={support.id}>
              <line x1="0" y1="0" x2={support.xM} y2={support.yM} stroke="#1f2937" strokeWidth=".1" />
              <rect
                x={support.xM - support.padLengthM / 2}
                y={support.yM - support.padWidthM / 2}
                width={support.padLengthM}
                height={support.padWidthM}
                fill="#f4df9b"
                stroke="#111827"
                strokeWidth=".07"
              />
              <text x={support.xM} y={support.yM + support.padWidthM / 2 + .35} textAnchor="middle" fontSize=".34">{support.id.replace(/-/g, " ").toUpperCase()}</text>
            </g>
          )) : null}
          <text x="0" y={-model.machine.widthM / 2 - .42} textAnchor="middle" fontSize=".48" fontWeight="800">{model.machine.label || "MACHINE"}</text>
        </g>
      ) : null}
      <circle cx={centre.xM} cy={centre.yM} r=".25" fill="#111827" />
      <circle cx={centre.xM} cy={centre.yM} r=".48" fill="none" stroke="#111827" strokeWidth=".045" />
      <text x={centre.xM} y={centre.yM + .86} textAnchor="middle" fontSize=".4" fontWeight="800">C.O.R.</text>

      <g transform={`translate(${width - 2.1} 2.25) rotate(${model.site.northAngleDeg})`}>
        <path d="M0 1.45 L0 -1 M0 -1 L-.32 -.35 M0 -1 L.32 -.35" stroke="#111827" strokeWidth=".12" fill="none" />
        <text x="0" y="-1.25" textAnchor="middle" fontSize=".65" fontWeight="900">N</text>
      </g>
      <g transform={`translate(1.2 ${depth - 1.2})`}>
        <line x1="0" y1="0" x2={scaleBar} y2="0" stroke="#111827" strokeWidth=".18" />
        <line x1="0" y1="-.22" x2="0" y2=".22" stroke="#111827" strokeWidth=".08" />
        <line x1={scaleBar} y1="-.22" x2={scaleBar} y2=".22" stroke="#111827" strokeWidth=".08" />
        <text x={scaleBar / 2} y="-.32" textAnchor="middle" fontSize=".42" fontWeight="800">{scaleBar} m</text>
      </g>
      <rect x={width - 10.8} y={depth - 1.75} width="10.1" height="1.1" rx=".1" fill="#fff" stroke="#111827" strokeWidth=".055" />
      <text x={width - 5.75} y={depth - 1.28} textAnchor="middle" fontSize=".45" fontWeight="900">
        {model.scaleMode === "verified-scale" && model.site.scaleCalibrated
          ? "CALIBRATED PLAN - ALL DIMENSIONS IN METRES"
          : "DIAGRAMMATIC - NOT TO SCALE - VERIFICATION REQUIRED"}
      </text>
    </svg>
  );
}
