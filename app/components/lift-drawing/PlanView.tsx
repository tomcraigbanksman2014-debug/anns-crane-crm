import type { LiftDrawingModelV1 } from "./types";
import { machineCentreOfRotation } from "./geometry";

function objectStyle(type: string) {
  if (type === "building") return { fill: "#d7dde4", stroke: "#263442" };
  if (type === "road") return { fill: "#eef0f2", stroke: "#52606d" };
  if (type === "exclusion-zone") return { fill: "rgba(197,48,48,.08)", stroke: "#b42318" };
  if (type === "underground-service") return { fill: "rgba(168,85,247,.08)", stroke: "#7e22ce" };
  return { fill: "rgba(14,116,144,.08)", stroke: "#0e7490" };
}

export default function PlanView({
  model,
  interactive = false,
  onPointDrag,
  onObjectDrag,
}: {
  model: LiftDrawingModelV1;
  interactive?: boolean;
  onPointDrag?: (kind: "machine" | "pick" | "landing", xM: number, yM: number) => void;
  onObjectDrag?: (id: string, xM: number, yM: number) => void;
}) {
  const width = Math.max(1, model.site.widthM);
  const depth = Math.max(1, model.site.depthM);
  const centre = machineCentreOfRotation(model);
  const grossLoadKg = Math.max(0, model.lift.loadWeightKg) + Math.max(0, model.lift.accessoryWeightKg);
  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const objectId = (event.target as SVGElement).getAttribute("data-drag-object");
    const target = (event.target as SVGElement).getAttribute("data-drag-kind") as "machine" | "pick" | "landing" | null;
    if (!target && !objectId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xM = ((event.clientX - rect.left) / rect.width) * width;
    const yM = ((event.clientY - rect.top) / rect.height) * depth;
    const snappedX = Math.round(xM * 10) / 10;
    const snappedY = Math.round(yM * 10) / 10;
    if (objectId && onObjectDrag) {
      onObjectDrag(objectId, snappedX, snappedY);
      return;
    }
    if (target && onPointDrag) onPointDrag(target, snappedX, snappedY);
  };
  const path = [model.lift.pick, ...model.lift.travelPath, model.lift.landing]
    .map((point) => `${point.xM},${point.yM}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${depth}`}
      role="img"
      aria-label="Scaled lift arrangement plan view"
      onPointerDown={handlePointer}
      style={{ width: "100%", height: "100%", background: "#fff", touchAction: "none" }}
    >
      <defs>
        <pattern id="liftGrid" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dce3e9" strokeWidth="0.025" />
        </pattern>
        <marker id="pathArrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill="#0b4f6c" />
        </marker>
        <marker id="dimensionArrow" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto-start-reverse">
          <path d="M5,0 L0,2.5 L5,5" fill="none" stroke="#111827" strokeWidth=".7" />
        </marker>
      </defs>
      <rect x="0" y="0" width={width} height={depth} fill="url(#liftGrid)" stroke="#111827" strokeWidth="0.08" />
      <line x1=".7" y1=".65" x2={width - .7} y2=".65" stroke="#475569" strokeWidth=".045" markerStart="url(#dimensionArrow)" markerEnd="url(#dimensionArrow)" />
      <text x={width / 2} y=".48" textAnchor="middle" fontSize=".46" fontWeight="700">VERIFIED SITE WIDTH {width} m</text>
      <line x1=".65" y1="1.1" x2=".65" y2={depth - .7} stroke="#475569" strokeWidth=".045" markerStart="url(#dimensionArrow)" markerEnd="url(#dimensionArrow)" />
      <text x=".38" y={depth / 2} textAnchor="middle" fontSize=".46" fontWeight="700" transform={`rotate(-90 .38 ${depth / 2})`}>VERIFIED SITE DEPTH {depth} m</text>
      {model.objects.map((item) => {
        if (item.type === "overhead-service") {
          return <g key={item.id}><line data-drag-object={item.id} x1={item.x1M} y1={item.y1M} x2={item.x2M} y2={item.y2M} stroke="#d97706" strokeWidth="0.16" strokeDasharray=".3 .2" /><text x={(item.x1M + item.x2M) / 2} y={(item.y1M + item.y2M) / 2 - .3} textAnchor="middle" fontSize=".55" fill="#92400e">{item.label} ({item.heightM}m)</text></g>;
        }
        if (item.type === "note") return <text key={item.id} data-drag-object={item.id} x={item.xM} y={item.yM} fontSize=".6" fill="#111827">{item.text}</text>;
        const style = objectStyle(item.type);
        return (
          <g key={item.id} transform={`rotate(${item.rotationDeg} ${item.xM + item.widthM / 2} ${item.yM + item.depthM / 2})`}>
            <rect data-drag-object={item.id} x={item.xM} y={item.yM} width={item.widthM} height={item.depthM} fill={style.fill} stroke={style.stroke} strokeWidth=".08" strokeDasharray={item.type.includes("zone") ? ".25 .15" : undefined} />
            <text x={item.xM + item.widthM / 2} y={item.yM + item.depthM / 2} textAnchor="middle" dominantBaseline="middle" fontSize=".55" fill="#111827">{item.label}</text>
          </g>
        );
      })}
      <path
        d={`M ${centre.xM} ${centre.yM} L ${centre.xM + Math.cos(model.lift.workingSectorStartDeg * Math.PI / 180) * model.lift.radiusM} ${centre.yM + Math.sin(model.lift.workingSectorStartDeg * Math.PI / 180) * model.lift.radiusM} A ${model.lift.radiusM} ${model.lift.radiusM} 0 0 1 ${centre.xM + Math.cos(model.lift.workingSectorEndDeg * Math.PI / 180) * model.lift.radiusM} ${centre.yM + Math.sin(model.lift.workingSectorEndDeg * Math.PI / 180) * model.lift.radiusM} Z`}
        fill="rgba(14,116,144,.07)"
        stroke="#0e7490"
        strokeWidth=".08"
        strokeDasharray=".25 .18"
      />
      <g transform={`translate(${model.machine.xM} ${model.machine.yM}) rotate(${model.machine.rotationDeg})`}>
        <rect data-drag-kind="machine" x={-model.machine.lengthM / 2} y={-model.machine.widthM / 2} width={model.machine.lengthM} height={model.machine.widthM} rx=".15" fill="#edf2f7" stroke="#111827" strokeWidth=".11" />
        {model.machine.type.startsWith("hiab") ? <rect x={-model.machine.lengthM / 2} y={-model.machine.widthM / 2} width={model.machine.cabLengthM ?? 2.8} height={model.machine.widthM} fill="#b8c4ce" stroke="#111827" strokeWidth=".08" /> : null}
        <line x1={-model.machine.lengthM / 2} y1="0" x2={model.machine.lengthM / 2} y2="0" stroke="#64748b" strokeWidth=".05" />
        <text x="0" y="-.35" textAnchor="middle" fontSize=".6" fontWeight="700">{model.machine.label || "MACHINE"}</text>
        <line x1={-model.machine.lengthM / 2} y1={model.machine.widthM / 2 + .55} x2={model.machine.lengthM / 2} y2={model.machine.widthM / 2 + .55} stroke="#111827" strokeWidth=".045" markerStart="url(#dimensionArrow)" markerEnd="url(#dimensionArrow)" />
        <text x="0" y={model.machine.widthM / 2 + 1.05} textAnchor="middle" fontSize=".42">MACHINE LENGTH {model.machine.lengthM} m</text>
      </g>
      {model.machine.stabilisers.map((stabiliser) => (
        <g key={stabiliser.id} transform={`translate(${model.machine.xM + stabiliser.xM} ${model.machine.yM + stabiliser.yM})`}>
          <line x1="0" y1="0" x2="0" y2={stabiliser.yM < 0 ? -stabiliser.extensionM : stabiliser.extensionM} stroke="#1f2937" strokeWidth=".1" />
          <rect x={-stabiliser.padLengthM / 2} y={-stabiliser.padWidthM / 2} width={stabiliser.padLengthM} height={stabiliser.padWidthM} fill="#f4df9b" stroke="#111827" strokeWidth=".07" />
        </g>
      ))}
      <circle cx={centre.xM} cy={centre.yM} r=".32" fill="#111827" />
      <text x={centre.xM} y={centre.yM + .85} textAnchor="middle" fontSize=".44" fontWeight="700">C.O.R.</text>
      <circle data-drag-kind="pick" cx={model.lift.pick.xM} cy={model.lift.pick.yM} r=".45" fill="#15803d" stroke="#14532d" strokeWidth=".08" />
      <text x={model.lift.pick.xM} y={model.lift.pick.yM - .7} textAnchor="middle" fontSize=".62" fontWeight="700">PICK</text>
      <text x={model.lift.pick.xM + .65} y={model.lift.pick.yM + .75} fontSize=".45">{grossLoadKg.toLocaleString("en-GB")} kg gross</text>
      <circle data-drag-kind="landing" cx={model.lift.landing.xM} cy={model.lift.landing.yM} r=".45" fill="#1d4ed8" stroke="#1e3a8a" strokeWidth=".08" />
      <text x={model.lift.landing.xM} y={model.lift.landing.yM - .7} textAnchor="middle" fontSize=".62" fontWeight="700">LAND</text>
      <polyline points={path} fill="none" stroke="#0b4f6c" strokeWidth=".14" strokeDasharray=".35 .18" markerEnd="url(#pathArrow)" />
      <line x1={centre.xM} y1={centre.yM} x2={model.lift.pick.xM} y2={model.lift.pick.yM} stroke="#111827" strokeWidth=".06" markerStart="url(#dimensionArrow)" markerEnd="url(#dimensionArrow)" />
      <text x={(centre.xM + model.lift.pick.xM) / 2} y={(centre.yM + model.lift.pick.yM) / 2 - .3} textAnchor="middle" fontSize=".58">R = {model.lift.radiusM || "—"} m</text>
      <g transform={`translate(${width - 2.3} 2.6) rotate(${model.site.northAngleDeg})`}>
        <path d="M0 1.6 L0 -1.1 M0 -1.1 L-.35 -.45 M0 -1.1 L.35 -.45" stroke="#111827" strokeWidth=".12" fill="none" />
        <text x="0" y="-1.35" textAnchor="middle" fontSize=".7" fontWeight="800">N</text>
      </g>
      <text x={width - .5} y={depth - .35} textAnchor="end" fontSize=".4" fill="#475569">DIMENSIONED PLAN VIEW — ALL DIMENSIONS IN METRES</text>
    </svg>
  );
}
