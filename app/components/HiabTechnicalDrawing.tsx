import type { CSSProperties } from "react";

type Props = {
  profileId?: string | null;
  vehicleLabel: string;
  radiusM?: number | null;
  liftHeightM?: number | null;
  loadDescription?: string | null;
  supportPosition?: string | null;
  workingSector?: string | null;
};

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function metres(value: number | null) {
  return value === null
    ? "NOT SPECIFIED"
    : `${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m`;
}

function cleanVehicleLabel(value: string, isArtic: boolean) {
  const words = String(value || "")
    .replace(/\barctic\b/gi, "Artic")
    .trim()
    .split(/\s+/);
  const result: string[] = [];
  for (const word of words) {
    if (result[result.length - 1]?.toLowerCase() === word.toLowerCase()) continue;
    result.push(word);
  }
  const joined = result.join(" ").trim();
  if (!joined) return isArtic ? "Artic HIAB" : "Rigid HIAB";
  return joined
    .replace(/\b(Artic HIAB)(?:\s+\1)+\b/gi, "$1")
    .replace(/\b(Rigid HIAB)(?:\s+\1)+\b/gi, "$1");
}

function shortText(value: string | null | undefined, fallback: string, max = 36) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function TechnicalCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={technicalCell}>
      <span style={technicalCellLabel}>{label}</span>
      <strong style={technicalCellValue}>{value}</strong>
    </div>
  );
}

export default function HiabTechnicalDrawing({
  profileId,
  vehicleLabel,
  radiusM,
  liftHeightM,
  loadDescription,
  supportPosition,
  workingSector,
}: Props) {
  const isArtic =
    profileId === "hiab-x-hipro-858" ||
    /\b(?:artic|arctic|tractor)\b/i.test(vehicleLabel);
  const radius = finite(radiusM);
  const height = finite(liftHeightM);
  const label = cleanVehicleLabel(vehicleLabel, isArtic);
  const support = shortText(supportPosition, "NOT SPECIFIED", 44);
  const sector = shortText(workingSector, "NOT SPECIFIED", 44);
  const load = shortText(loadDescription, "PLANNED LOAD", 30);

  // Drawing geometry is scaled from the saved lift radius and height. The
  // vehicle footprint remains diagrammatic because site survey dimensions
  // are not stored in the lift plan.
  const boomStartX = isArtic ? 224 : 218;
  const boomStartY = 250;
  const loadX = 665;
  const loadTopY = 205;
  const targetY = height === null ? 104 : Math.max(68, Math.min(175, 236 - height * 7));
  const elbowX = boomStartX + Math.max(88, (loadX - boomStartX) * 0.28);
  const elbowY = Math.max(105, targetY + 38);
  const boomTipY = targetY;
  const planVehicleEnd = isArtic ? 615 : 535;
  const planCraneX = isArtic ? 227 : 220;
  const sheetStatus = radius !== null && height !== null && support !== "NOT SPECIFIED" && sector !== "NOT SPECIFIED"
    ? "DIMENSIONED FROM SAVED LIFT-PLAN DATA"
    : "DRAFT - TECHNICAL VALUES INCOMPLETE";

  return (
    <div style={sheet}>
      <div style={sheetHeader}>
        <div>
          <div style={eyebrow}>LIFT ARRANGEMENT DRAWING</div>
          <div style={sheetTitle}>{label}</div>
        </div>
        <div style={statusBox}>{sheetStatus}</div>
      </div>

      <div style={drawingPanel}>
        <div style={panelHeader}>
          <strong>PLAN VIEW</strong>
          <span>Vehicle footprint, stabilisers, operating sector and load position</span>
        </div>
        <svg viewBox="0 0 820 365" role="img" aria-label="HIAB lift arrangement plan view" style={svg}>
          <defs>
            <marker id="hiab-plan-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 z" fill="#111827" />
            </marker>
            <pattern id="hiab-grid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M25 0H0V25" fill="none" stroke="#d9e0e7" strokeWidth="0.7" />
            </pattern>
          </defs>
          <rect x="1" y="1" width="818" height="363" fill="url(#hiab-grid)" />

          <g aria-label="north arrow">
            <path d="M765 58V20" stroke="#111827" strokeWidth="2" markerEnd="url(#hiab-plan-arrow)" />
            <text x="765" y="76" textAnchor="middle" fontSize="12" fontWeight="800">N</text>
          </g>

          <rect x="75" y="133" width="142" height="96" rx="7" fill="#edf2f7" stroke="#1f2937" strokeWidth="2" />
          <path d="M75 166H48V202H75" fill="#edf2f7" stroke="#1f2937" strokeWidth="2" />
          <text x="146" y="185" textAnchor="middle" fontSize="14" fontWeight="800">CAB</text>
          <rect x="217" y="119" width={planVehicleEnd - 217} height="124" rx="3" fill="#f8fafc" stroke="#1f2937" strokeWidth="2" />
          {isArtic ? (
            <>
              <line x1="305" y1="119" x2="305" y2="243" stroke="#64748b" strokeWidth="1.5" strokeDasharray="6 4" />
              <text x="455" y="185" textAnchor="middle" fontSize="13" fontWeight="700">TRAILER / LOAD BED</text>
            </>
          ) : (
            <text x="385" y="185" textAnchor="middle" fontSize="13" fontWeight="700">RIGID LOAD BED</text>
          )}

          <circle cx={planCraneX} cy="181" r="19" fill="#b91c1c" stroke="#111827" strokeWidth="2" />
          <text x={planCraneX} y="185" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="900">CRANE</text>

          <g aria-label="stabilisers">
            <line x1={planCraneX - 2} y1="84" x2={planCraneX - 2} y2="278" stroke="#111827" strokeWidth="4" />
            <line x1={planCraneX + 112} y1="84" x2={planCraneX + 112} y2="278" stroke="#111827" strokeWidth="4" />
            {[planCraneX - 2, planCraneX + 112].map((x) => (
              <g key={x}>
                <rect x={x - 30} y="70" width="60" height="14" fill="#cbd5e1" stroke="#111827" strokeWidth="1.5" />
                <rect x={x - 30} y="278" width="60" height="14" fill="#cbd5e1" stroke="#111827" strokeWidth="1.5" />
              </g>
            ))}
          </g>

          <path
            d={`M ${planCraneX} 181 A 255 255 0 0 1 ${planCraneX + 214} 22`}
            fill="none"
            stroke="#9f1239"
            strokeWidth="1.8"
            strokeDasharray="8 6"
          />
          <path
            d={`M ${planCraneX} 181 A 255 255 0 0 0 ${planCraneX + 214} 340`}
            fill="none"
            stroke="#9f1239"
            strokeWidth="1.8"
            strokeDasharray="8 6"
          />
          <text x={planCraneX + 172} y="48" fontSize="11" fontWeight="700" fill="#9f1239">PERMITTED WORKING SECTOR</text>

          <line x1={planCraneX} y1="181" x2="690" y2="181" stroke="#2563eb" strokeWidth="3.5" />
          <circle cx="690" cy="181" r="5" fill="#2563eb" />
          <rect x="654" y="143" width="72" height="76" fill="#f8d36d" stroke="#111827" strokeWidth="2" />
          <text x="690" y="171" textAnchor="middle" fontSize="11" fontWeight="900">LOAD</text>
          <text x="690" y="190" textAnchor="middle" fontSize="8.5">{load.slice(0, 16)}</text>

          <line x1={planCraneX} y1="321" x2="690" y2="321" stroke="#111827" strokeWidth="1.6" markerEnd="url(#hiab-plan-arrow)" />
          <line x1="690" y1="321" x2={planCraneX} y2="321" stroke="#111827" strokeWidth="1.6" markerEnd="url(#hiab-plan-arrow)" />
          <line x1={planCraneX} y1="300" x2={planCraneX} y2="331" stroke="#111827" />
          <line x1="690" y1="225" x2="690" y2="331" stroke="#111827" strokeDasharray="4 3" />
          <rect x="394" y="305" width="128" height="25" fill="#fff" />
          <text x="458" y="322" textAnchor="middle" fontSize="13" fontWeight="900">
            RADIUS: {metres(radius)}
          </text>
        </svg>
      </div>

      <div style={drawingPanel}>
        <div style={panelHeader}>
          <strong>SIDE ELEVATION</strong>
          <span>Boom geometry, working radius, hook height and landing point</span>
        </div>
        <svg viewBox="0 0 820 365" role="img" aria-label="HIAB lift arrangement side elevation" style={svg}>
          <defs>
            <marker id="hiab-side-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 z" fill="#111827" />
            </marker>
            <pattern id="hiab-side-grid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M25 0H0V25" fill="none" stroke="#d9e0e7" strokeWidth="0.7" />
            </pattern>
          </defs>
          <rect x="1" y="1" width="818" height="363" fill="url(#hiab-side-grid)" />
          <line x1="42" y1="288" x2="782" y2="288" stroke="#111827" strokeWidth="2.5" />

          <rect x="72" y="222" width="142" height="60" rx="7" fill="#edf2f7" stroke="#1f2937" strokeWidth="2" />
          <path d="M72 244H50V276H72" fill="#edf2f7" stroke="#1f2937" strokeWidth="2" />
          <rect x="214" y="235" width={isArtic ? 338 : 275} height="43" fill="#f8fafc" stroke="#1f2937" strokeWidth="2" />
          <circle cx="104" cy="288" r="16" fill="#334155" />
          <circle cx="180" cy="288" r="16" fill="#334155" />
          <circle cx={isArtic ? 495 : 445} cy="288" r="16" fill="#334155" />

          <circle cx={boomStartX} cy={boomStartY} r="18" fill="#b91c1c" stroke="#111827" strokeWidth="2" />
          <polyline
            points={`${boomStartX},${boomStartY} ${elbowX},${elbowY} ${loadX},${boomTipY}`}
            fill="none"
            stroke="#2563eb"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1={loadX} y1={boomTipY} x2={loadX} y2={loadTopY} stroke="#111827" strokeWidth="2" />
          <rect x={loadX - 48} y={loadTopY} width="96" height="72" fill="#f8d36d" stroke="#111827" strokeWidth="2" />
          <text x={loadX} y={loadTopY + 31} textAnchor="middle" fontSize="11" fontWeight="900">LOAD</text>
          <text x={loadX} y={loadTopY + 49} textAnchor="middle" fontSize="8.5">{load.slice(0, 19)}</text>

          <line x1={boomStartX} y1="326" x2={loadX} y2="326" stroke="#111827" strokeWidth="1.6" markerEnd="url(#hiab-side-arrow)" />
          <line x1={loadX} y1="326" x2={boomStartX} y2="326" stroke="#111827" strokeWidth="1.6" markerEnd="url(#hiab-side-arrow)" />
          <line x1={boomStartX} y1={boomStartY + 21} x2={boomStartX} y2="337" stroke="#111827" strokeDasharray="4 3" />
          <line x1={loadX} y1={loadTopY + 76} x2={loadX} y2="337" stroke="#111827" strokeDasharray="4 3" />
          <rect x="382" y="313" width="130" height="25" fill="#fff" />
          <text x="447" y="330" textAnchor="middle" fontSize="13" fontWeight="900">
            RADIUS: {metres(radius)}
          </text>

          <line x1="748" y1="288" x2="748" y2={boomTipY} stroke="#111827" strokeWidth="1.6" markerEnd="url(#hiab-side-arrow)" />
          <line x1="748" y1={boomTipY} x2="748" y2="288" stroke="#111827" strokeWidth="1.6" markerEnd="url(#hiab-side-arrow)" />
          <line x1={loadX + 8} y1={boomTipY} x2="758" y2={boomTipY} stroke="#111827" strokeDasharray="4 3" />
          <rect x="706" y="173" width="83" height="25" fill="#fff" />
          <text x="747" y="190" textAnchor="middle" fontSize="11" fontWeight="900">
            HEIGHT
          </text>
          <text x="747" y="207" textAnchor="middle" fontSize="10" fontWeight="800">
            {metres(height)}
          </text>

          <g aria-label="stabilisers">
            <line x1={boomStartX - 18} y1="274" x2={boomStartX - 18} y2="302" stroke="#111827" strokeWidth="4" />
            <rect x={boomStartX - 46} y="302" width="56" height="11" fill="#cbd5e1" stroke="#111827" />
            <line x1={boomStartX + 92} y1="274" x2={boomStartX + 92} y2="302" stroke="#111827" strokeWidth="4" />
            <rect x={boomStartX + 64} y="302" width="56" height="11" fill="#cbd5e1" stroke="#111827" />
          </g>
        </svg>
      </div>

      <div style={technicalStrip}>
        <TechnicalCell label="LOAD" value={load} />
        <TechnicalCell label="SUPPORT POSITION" value={support} />
        <TechnicalCell label="WORKING SECTOR" value={sector} />
        <TechnicalCell label="DRAWING BASIS" value="SCHEMATIC - NOT FOR CONSTRUCTION" />
      </div>
    </div>
  );
}

const sheet: CSSProperties = {
  border: "1.5px solid #111827",
  background: "#fff",
  display: "grid",
  gap: 9,
  padding: 10,
};

const sheetHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  borderBottom: "2px solid #111827",
  paddingBottom: 8,
};

const eyebrow: CSSProperties = {
  color: "#2563eb",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: "0.12em",
};

const sheetTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  marginTop: 2,
};

const statusBox: CSSProperties = {
  border: "1px solid #64748b",
  color: "#334155",
  padding: "5px 8px",
  fontSize: 9,
  fontWeight: 900,
  textAlign: "center",
};

const drawingPanel: CSSProperties = {
  border: "1px solid #64748b",
  overflow: "hidden",
};

const panelHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "6px 8px",
  background: "#e8eef5",
  borderBottom: "1px solid #64748b",
  fontSize: 10,
};

const svg: CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
  background: "#fff",
};

const technicalStrip: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1.25fr 1.25fr 1.25fr",
  border: "1px solid #64748b",
};

const technicalCell: CSSProperties = {
  minHeight: 43,
  padding: "6px 7px",
  borderRight: "1px solid #64748b",
  display: "grid",
  alignContent: "start",
  gap: 3,
};

const technicalCellLabel: CSSProperties = {
  color: "#64748b",
  fontSize: 7.5,
  fontWeight: 900,
  letterSpacing: "0.08em",
};

const technicalCellValue: CSSProperties = {
  color: "#111827",
  fontSize: 8.5,
  lineHeight: 1.25,
};
