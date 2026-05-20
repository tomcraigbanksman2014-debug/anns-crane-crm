"use client";

import type { CSSProperties, MutableRefObject, PointerEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import type { CraneSetupOption } from "../../../lib/ai/equipmentProfiles";

type StringMap = Record<string, string | null | undefined>;

type ExternalSpecOption = {
  id: string;
  title: string;
  document_type?: string | null;
};

type RangeChartState = {
  enabled: boolean;
  clientName: string;
  craneName: string;
  notes: string;
  craneSourceMode: string;
  externalSpecDocumentId: string;
  externalSpecDocumentTitle: string;
  selectedSetupKey: string;
  selectedSetupLabel: string;
  boomLengthM: string;
  boomAngleDeg: string;
  radiusM: string;
  tipHeightM: string;
  jibLengthM: string;
  jibAngleDeg: string;
  objectDistanceM: string;
  objectHeightM: string;
  objectWidthM: string;
  loadWeightKg: string;
  accessoryWeightKg: string;
  chartCapacityKg: string;
  matLengthM: string;
  matWidthM: string;
  bearingLoadKg: string;
  verificationNote: string;
};

type ChartNumbers = {
  radiusM: number;
  tipHeightM: number;
  objectDistanceM: number;
  objectHeightM: number;
  objectWidthM: number;
  jibLengthM: number;
  jibAngleDeg: number;
  loadWeightKg: number | null;
  accessoryWeightKg: number | null;
  chartCapacityKg: number | null;
  matLengthM: number | null;
  matWidthM: number | null;
  bearingLoadKg: number | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function numberForInput(value: unknown, fallback = "") {
  const n = numberOrNull(value);
  return n === null ? fallback : String(n);
}

function round(value: number, dp = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, dp);
  return Math.round(value * factor) / factor;
}

function fmt(value: number | null | undefined, suffix = "m") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${round(value, 2).toLocaleString("en-GB", { maximumFractionDigits: 2 })}${suffix ? ` ${suffix}` : ""}`;
}

function fmtKg(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("en-GB")} kg`;
}

function parseBool(value: unknown) {
  const text = clean(value).toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(text);
}

function defaultRangeState({
  sections,
  defaultClientName,
  defaultCraneName,
  defaultNotes,
  liftRadiusM,
  liftHeightM,
  loadWeightKg,
  setupOptions,
}: {
  sections: StringMap;
  defaultClientName: string;
  defaultCraneName: string;
  defaultNotes: string;
  liftRadiusM?: number | null;
  liftHeightM?: number | null;
  loadWeightKg?: number | null;
  setupOptions: CraneSetupOption[];
}): RangeChartState {
  const selectedSetupFromPack = clean(sections.selected_crane_setup_key);
  const firstSetup = setupOptions.find((setup) => setup.key === selectedSetupFromPack) ?? setupOptions[0] ?? null;
  const setupRadius = numberOrNull(firstSetup?.maxRadiusM ?? firstSetup?.hydraulicOutreachM ?? firstSetup?.boomLengthM);
  const setupTipHeight = numberOrNull(firstSetup?.maxTipHeightM);
  const setupBoomLength = numberOrNull(firstSetup?.boomLengthM);
  const setupJibOutreach = numberOrNull(firstSetup?.jibOutreachM);

  const radius = numberOrNull(sections.range_chart_radius_m) ?? liftRadiusM ?? setupRadius ?? 12;
  const tipHeight = numberOrNull(sections.range_chart_tip_height_m) ?? liftHeightM ?? setupTipHeight ?? Math.max(6, radius * 0.75);
  const objectHeight = numberOrNull(sections.range_chart_object_height_m) ?? Math.max(1, Math.min(tipHeight - 1, liftHeightM ?? tipHeight * 0.6));
  const objectDistance = numberOrNull(sections.range_chart_object_distance_m) ?? Math.max(1, radius - 4);

  return {
    enabled: parseBool(sections.range_chart_enabled) || Boolean(sections.range_chart_radius_m || sections.range_chart_tip_height_m),
    clientName: firstText(sections.range_chart_client, defaultClientName),
    craneName: firstText(sections.range_chart_crane_name, sections.custom_crane_name, defaultCraneName),
    notes: firstText(sections.range_chart_notes, defaultNotes),
    craneSourceMode: firstText(sections.range_chart_crane_source_mode, "selected_crm_crane"),
    externalSpecDocumentId: firstText(sections.range_chart_external_spec_document_id),
    externalSpecDocumentTitle: firstText(sections.range_chart_external_spec_document_title),
    selectedSetupKey: firstText(sections.range_chart_selected_setup_key, sections.selected_crane_setup_key, firstSetup?.key),
    selectedSetupLabel: firstText(sections.range_chart_selected_setup_label, sections.selected_crane_setup_label, firstSetup?.label),
    boomLengthM: numberForInput(sections.range_chart_boom_length_m, setupBoomLength ? String(setupBoomLength) : ""),
    boomAngleDeg: numberForInput(sections.range_chart_boom_angle_deg, ""),
    radiusM: numberForInput(radius, "12"),
    tipHeightM: numberForInput(tipHeight, "10"),
    jibLengthM: numberForInput(sections.range_chart_jib_length_m, setupJibOutreach ? String(setupJibOutreach) : "0"),
    jibAngleDeg: numberForInput(sections.range_chart_jib_angle_deg, "20"),
    objectDistanceM: numberForInput(objectDistance, "8"),
    objectHeightM: numberForInput(objectHeight, "4"),
    objectWidthM: numberForInput(sections.range_chart_object_width_m, "8"),
    loadWeightKg: numberForInput(sections.range_chart_load_weight_kg, loadWeightKg ? String(loadWeightKg) : ""),
    accessoryWeightKg: numberForInput(sections.range_chart_accessory_weight_kg, ""),
    chartCapacityKg: numberForInput(sections.range_chart_chart_capacity_kg, ""),
    matLengthM: numberForInput(sections.range_chart_mat_length_m, numberForInput(sections.ground_bearing_mat_length_m, "")),
    matWidthM: numberForInput(sections.range_chart_mat_width_m, numberForInput(sections.ground_bearing_mat_width_m, "")),
    bearingLoadKg: numberForInput(sections.range_chart_bearing_load_kg, numberForInput(sections.ground_bearing_bearing_load, "")),
    verificationNote: firstText(
      sections.range_chart_verification_note,
      "Planning sketch only. Appointed person must verify the manufacturer/supplier load chart, exact radius, boom/jib configuration, counterweight/ballast, outrigger setup, accessories and ground bearing before approval."
    ),
  };
}

function chartNumbers(chart: RangeChartState): ChartNumbers {
  return {
    radiusM: Math.max(0.5, numberOrNull(chart.radiusM) ?? 12),
    tipHeightM: Math.max(0.5, numberOrNull(chart.tipHeightM) ?? 10),
    objectDistanceM: Math.max(0, numberOrNull(chart.objectDistanceM) ?? 8),
    objectHeightM: Math.max(0.1, numberOrNull(chart.objectHeightM) ?? 4),
    objectWidthM: Math.max(0.5, numberOrNull(chart.objectWidthM) ?? 8),
    jibLengthM: Math.max(0, numberOrNull(chart.jibLengthM) ?? 0),
    jibAngleDeg: numberOrNull(chart.jibAngleDeg) ?? 20,
    loadWeightKg: numberOrNull(chart.loadWeightKg),
    accessoryWeightKg: numberOrNull(chart.accessoryWeightKg),
    chartCapacityKg: numberOrNull(chart.chartCapacityKg),
    matLengthM: numberOrNull(chart.matLengthM),
    matWidthM: numberOrNull(chart.matWidthM),
    bearingLoadKg: numberOrNull(chart.bearingLoadKg),
  };
}

function calculatedFrom(numbers: ChartNumbers) {
  const pivotHeight = 1.1;
  const jibAngleRad = (numbers.jibAngleDeg * Math.PI) / 180;
  const hookX = numbers.radiusM;
  const hookY = numbers.tipHeightM;
  const jibBackX = numbers.jibLengthM > 0 ? numbers.jibLengthM * Math.cos(jibAngleRad) : 0;
  const jibBackY = numbers.jibLengthM > 0 ? numbers.jibLengthM * Math.sin(jibAngleRad) : 0;
  const boomEndX = Math.max(0.1, hookX - jibBackX);
  const boomEndY = Math.max(pivotHeight, hookY - jibBackY);
  const boomLength = Math.sqrt(Math.pow(boomEndX, 2) + Math.pow(boomEndY - pivotHeight, 2));
  const boomAngle = (Math.atan2(boomEndY - pivotHeight, boomEndX) * 180) / Math.PI;
  const clearance = hookY - numbers.objectHeightM;
  const totalLiftedWeight = (numbers.loadWeightKg ?? 0) + (numbers.accessoryWeightKg ?? 0);
  const utilisation = totalLiftedWeight && numbers.chartCapacityKg ? (totalLiftedWeight / numbers.chartCapacityKg) * 100 : null;
  const matArea = numbers.matLengthM && numbers.matWidthM ? numbers.matLengthM * numbers.matWidthM : null;
  const pressureKgM2 = numbers.bearingLoadKg && matArea ? numbers.bearingLoadKg / matArea : null;

  return {
    pivotHeight,
    hookX,
    hookY,
    boomEndX,
    boomEndY,
    boomLength,
    boomAngle,
    clearance,
    totalLiftedWeight: totalLiftedWeight || null,
    utilisation,
    matArea,
    pressureKgM2,
  };
}

function calcScale(numbers: ChartNumbers) {
  const maxX = Math.max(numbers.radiusM + 4, numbers.objectDistanceM + numbers.objectWidthM + 4, 12);
  const maxY = Math.max(numbers.tipHeightM + 4, numbers.objectHeightM + 4, 8);
  return { maxX, maxY };
}

export default function RangeChartBuilder({
  jobId,
  initialSections,
  defaultClientName,
  defaultCraneName,
  defaultNotes,
  liftRadiusM,
  liftHeightM,
  loadWeightKg,
  setupOptions,
  externalSpecOptions,
}: {
  jobId: string;
  initialSections: StringMap;
  defaultClientName: string;
  defaultCraneName: string;
  defaultNotes?: string | null;
  liftRadiusM?: number | null;
  liftHeightM?: number | null;
  loadWeightKg?: number | null;
  setupOptions?: CraneSetupOption[];
  externalSpecOptions?: ExternalSpecOption[];
}) {
  const normalisedSetups = useMemo(() => {
    const seen = new Set<string>();
    return (setupOptions ?? []).filter((setup) => {
      const key = clean(setup.key || setup.label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [setupOptions]);

  const [chart, setChart] = useState<RangeChartState>(() =>
    defaultRangeState({
      sections: initialSections,
      defaultClientName,
      defaultCraneName,
      defaultNotes: defaultNotes ?? "",
      liftRadiusM,
      liftHeightM,
      loadWeightKg,
      setupOptions: normalisedSetups,
    })
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState<"hook" | "object" | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const numbers = chartNumbers(chart);
  const calc = calculatedFrom(numbers);
  const enteredBoomLength = numberOrNull(chart.boomLengthM);
  const enteredBoomAngle = numberOrNull(chart.boomAngleDeg);
  const displayedBoomLength = enteredBoomLength ?? calc.boomLength;
  const displayedBoomAngle = enteredBoomAngle ?? calc.boomAngle;
  const scale = calcScale(numbers);
  const totalWeightText = calc.totalLiftedWeight ? fmtKg(calc.totalLiftedWeight) : "—";
  const matPressureText = calc.pressureKgM2 ? `${Math.round(calc.pressureKgM2).toLocaleString("en-GB")} kg/m² / ${round(calc.pressureKgM2 / 1000, 2)} t/m²` : "—";
  const horizontalGapM = numbers.radiusM - numbers.objectDistanceM;
  const chartWarnings = [
    calc.clearance < 0 ? `Hook/tip point is ${fmt(Math.abs(calc.clearance))} below the top of the object. Raise the hook point, lower the object height, or choose another crane/setup.` : "",
    horizontalGapM < 0 ? `Hook/radius is ${fmt(Math.abs(horizontalGapM))} short of the object face. Increase radius/reposition the crane, or reduce the object distance.` : "",
    calc.utilisation && calc.utilisation > 100 ? `Entered load is over the entered chart capacity by ${round(calc.utilisation - 100, 1)}%. Do not approve without selecting a valid setup/chart.` : "",
  ].filter(Boolean);

  function update(key: keyof RangeChartState, value: string | boolean) {
    setChart((prev) => ({ ...prev, [key]: value }));
  }

  function applySetup(setupKey: string) {
    const setup = normalisedSetups.find((item) => item.key === setupKey) ?? null;
    setChart((prev) => {
      if (!setup) {
        return { ...prev, selectedSetupKey: "", selectedSetupLabel: "" };
      }
      return {
        ...prev,
        selectedSetupKey: setup.key,
        selectedSetupLabel: setup.label,
        craneSourceMode: prev.craneSourceMode || "selected_crm_crane",
        boomLengthM: setup.boomLengthM ? String(setup.boomLengthM) : prev.boomLengthM,
        radiusM: setup.maxRadiusM ? String(setup.maxRadiusM) : setup.hydraulicOutreachM ? String(setup.hydraulicOutreachM) : prev.radiusM,
        tipHeightM: setup.maxTipHeightM ? String(setup.maxTipHeightM) : prev.tipHeightM,
        jibLengthM: setup.jibOutreachM ? String(setup.jibOutreachM) : prev.jibLengthM,
        verificationNote:
          setup.chartNote ||
          prev.verificationNote ||
          "Planning sketch only. Appointed person must verify the exact manufacturer/supplier chart before approval.",
      };
    });
  }

  function applyExternalSpec(documentId: string) {
    const selected = externalSpecOptions?.find((item) => item.id === documentId) ?? null;
    setChart((prev) => ({
      ...prev,
      craneSourceMode: "external_spec_sheet",
      externalSpecDocumentId: selected?.id ?? "",
      externalSpecDocumentTitle: selected?.title ?? "",
    }));
  }

  function svgToMetres(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const viewWidth = 900;
    const viewHeight = 620;
    const left = 74;
    const right = 32;
    const top = 132;
    const bottom = 72;
    const plotW = viewWidth - left - right;
    const plotH = viewHeight - top - bottom;
    const xPx = ((event.clientX - rect.left) / rect.width) * viewWidth;
    const yPx = ((event.clientY - rect.top) / rect.height) * viewHeight;
    const xM = ((xPx - left) / plotW) * scale.maxX;
    const yM = ((viewHeight - bottom - yPx) / plotH) * scale.maxY;
    return { xM: Math.max(0, round(xM, 2)), yM: Math.max(0, round(yM, 2)) };
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!dragging) return;
    const point = svgToMetres(event);
    if (!point) return;
    event.preventDefault();
    if (dragging === "hook") {
      setChart((prev) => ({ ...prev, radiusM: String(point.xM), tipHeightM: String(point.yM) }));
    } else {
      setChart((prev) => ({ ...prev, objectDistanceM: String(point.xM), objectHeightM: String(point.yM) }));
    }
  }

  async function saveRangeChart() {
    setSaving(true);
    setMessage("");
    try {
      const payload: Record<string, string> = {
        range_chart_enabled: chart.enabled ? "true" : "false",
        range_chart_client: chart.clientName,
        range_chart_crane_name: chart.craneName,
        range_chart_notes: chart.notes,
        range_chart_crane_source_mode: chart.craneSourceMode,
        range_chart_external_spec_document_id: chart.externalSpecDocumentId,
        range_chart_external_spec_document_title: chart.externalSpecDocumentTitle,
        range_chart_selected_setup_key: chart.selectedSetupKey,
        range_chart_selected_setup_label: chart.selectedSetupLabel,
        range_chart_boom_length_m: String(round(displayedBoomLength, 2)),
        range_chart_boom_angle_deg: String(round(displayedBoomAngle, 2)),
        range_chart_radius_m: chart.radiusM,
        range_chart_tip_height_m: chart.tipHeightM,
        range_chart_jib_length_m: chart.jibLengthM,
        range_chart_jib_angle_deg: chart.jibAngleDeg,
        range_chart_object_distance_m: chart.objectDistanceM,
        range_chart_object_height_m: chart.objectHeightM,
        range_chart_object_width_m: chart.objectWidthM,
        range_chart_clearance_m: String(round(calc.clearance, 2)),
        range_chart_load_weight_kg: chart.loadWeightKg,
        range_chart_accessory_weight_kg: chart.accessoryWeightKg,
        range_chart_total_lifted_weight_kg: calc.totalLiftedWeight ? String(round(calc.totalLiftedWeight, 2)) : "",
        range_chart_chart_capacity_kg: chart.chartCapacityKg,
        range_chart_utilisation_percent: calc.utilisation ? String(round(calc.utilisation, 1)) : "",
        range_chart_mat_length_m: chart.matLengthM,
        range_chart_mat_width_m: chart.matWidthM,
        range_chart_mat_area_m2: calc.matArea ? String(round(calc.matArea, 3)) : "",
        range_chart_bearing_load_kg: chart.bearingLoadKg,
        range_chart_bearing_pressure: matPressureText === "—" ? "" : matPressureText,
        range_chart_verification_note: chart.verificationNote,
        range_chart_saved_at: new Date().toISOString(),
      };

      const res = await fetch(`/api/jobs/${jobId}/lift-plan/pack-selections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save range chart.");
      setMessage("Range chart saved. It will appear as a page in the full lift plan pack.");
    } catch (e: any) {
      setMessage(e?.message || "Could not save range chart.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={cardStyle} id="range-chart-builder">
      <div style={topRowStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24 }}>Range chart / lift sketch builder</h2>
          <div style={helperText}>
            Build an AnnS side-on planning sketch for the lift plan pack. Drag the red hook point or blue object on the chart, then save.
          </div>
        </div>
        <div style={buttonRowStyle}>
          <label style={togglePillStyle}>
            <input type="checkbox" checked={chart.enabled} onChange={(event) => update("enabled", event.target.checked)} /> Include in pack
          </label>
          <button type="button" onClick={saveRangeChart} disabled={saving} style={primaryBtnStyle}>{saving ? "Saving…" : "Save range chart"}</button>
        </div>
      </div>

      {message ? <div style={messageBoxStyle}>{message}</div> : null}

      <div style={builderGridStyle}>
        <div style={controlsStyle}>
          <Section title="Job and crane source">
            <Field label="Client" value={chart.clientName} onChange={(value) => update("clientName", value)} />
            <Field label="Crane" value={chart.craneName} onChange={(value) => update("craneName", value)} />
            <TextArea label="Notes" value={chart.notes} onChange={(value) => update("notes", value)} rows={2} />
            <SelectField
              label="Crane/spec source"
              value={chart.craneSourceMode}
              onChange={(value) => update("craneSourceMode", value)}
              options={[
                { value: "selected_crm_crane", label: "Selected CRM crane spec sheets" },
                { value: "external_spec_sheet", label: "Another / external crane spec sheet" },
                { value: "manual", label: "Manual entry / not linked to spec" },
              ]}
            />
            {chart.craneSourceMode === "external_spec_sheet" ? (
              <SelectField
                label="External/job spec sheet"
                value={chart.externalSpecDocumentId}
                onChange={applyExternalSpec}
                options={[
                  { value: "", label: externalSpecOptions?.length ? "Select uploaded job spec sheet…" : "No job spec sheets uploaded yet" },
                  ...(externalSpecOptions ?? []).map((item) => ({ value: item.id, label: item.title })),
                ]}
              />
            ) : null}
            <SelectField
              label="Setup/profile"
              value={chart.selectedSetupKey}
              onChange={applySetup}
              options={[
                { value: "", label: normalisedSetups.length ? "Select setup from specs…" : "No setup options found yet" },
                ...normalisedSetups.map((setup) => ({ value: setup.key, label: setup.label })),
              ]}
            />
          </Section>

          <Section title="Chart dimensions">
            <div style={smallGridStyle}>
              <Field label="Radius (m)" type="number" value={chart.radiusM} onChange={(value) => update("radiusM", value)} />
              <Field label="Tip / hook height (m)" type="number" value={chart.tipHeightM} onChange={(value) => update("tipHeightM", value)} />
              <Field label="Boom length (m)" type="number" value={chart.boomLengthM} onChange={(value) => update("boomLengthM", value)} />
              <Field label="Boom angle (deg)" type="number" value={chart.boomAngleDeg} onChange={(value) => update("boomAngleDeg", value)} />
              <Field label="Jib length (m)" type="number" value={chart.jibLengthM} onChange={(value) => update("jibLengthM", value)} />
              <Field label="Jib angle (deg)" type="number" value={chart.jibAngleDeg} onChange={(value) => update("jibAngleDeg", value)} />
              <Field label="Object distance (m)" type="number" value={chart.objectDistanceM} onChange={(value) => update("objectDistanceM", value)} />
              <Field label="Object height (m)" type="number" value={chart.objectHeightM} onChange={(value) => update("objectHeightM", value)} />
              <Field label="Object width (m)" type="number" value={chart.objectWidthM} onChange={(value) => update("objectWidthM", value)} />
            </div>
          </Section>

          <Section title="Load, chart and mats">
            <div style={smallGridStyle}>
              <Field label="Load weight (kg)" type="number" value={chart.loadWeightKg} onChange={(value) => update("loadWeightKg", value)} />
              <Field label="Accessory weight (kg)" type="number" value={chart.accessoryWeightKg} onChange={(value) => update("accessoryWeightKg", value)} />
              <Field label="Chart capacity at radius (kg)" type="number" value={chart.chartCapacityKg} onChange={(value) => update("chartCapacityKg", value)} />
              <Field label="Mat length (m)" type="number" value={chart.matLengthM} onChange={(value) => update("matLengthM", value)} />
              <Field label="Mat width (m)" type="number" value={chart.matWidthM} onChange={(value) => update("matWidthM", value)} />
              <Field label="Bearing load / reaction (kg)" type="number" value={chart.bearingLoadKg} onChange={(value) => update("bearingLoadKg", value)} />
            </div>
            <TextArea label="Verification note" value={chart.verificationNote} onChange={(value) => update("verificationNote", value)} rows={3} />
          </Section>
        </div>

        <div style={previewWrapStyle}>
          <RangeChartSvg
            refEl={svgRef}
            chart={chart}
            numbers={numbers}
            calc={calc}
            displayedBoomLength={displayedBoomLength}
            displayedBoomAngle={displayedBoomAngle}
            scale={scale}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDragging(null)}
            onStartDrag={(mode) => setDragging(mode)}
          />
          {chartWarnings.length ? (
            <div style={dangerBoxStyle}>
              <strong>Chart warning:</strong> {chartWarnings.join(" ")}
            </div>
          ) : null}
          <div style={metricGridStyle}>
            <Metric label="Boom length" value={fmt(displayedBoomLength)} />
            <Metric label="Boom angle" value={fmt(displayedBoomAngle, "°")} />
            <Metric label="Radius" value={fmt(numbers.radiusM)} />
            <Metric label="Tip height" value={fmt(numbers.tipHeightM)} />
            <Metric label="Jib length" value={fmt(numbers.jibLengthM)} />
            <Metric label="Jib angle" value={fmt(numbers.jibAngleDeg, "°")} />
            <Metric label="Object distance" value={fmt(numbers.objectDistanceM)} />
            <Metric label="Object height" value={fmt(numbers.objectHeightM)} />
            <Metric label="Clearance" value={fmt(calc.clearance)} tone={calc.clearance < 0 ? "danger" : "normal"} />
            <Metric label="Total lifted weight" value={totalWeightText} />
            <Metric label="Chart utilisation" value={calc.utilisation ? `${round(calc.utilisation, 1)}%` : "Manual check"} tone={calc.utilisation && calc.utilisation > 100 ? "danger" : "normal"} />
            <Metric label="Bearing pressure" value={matPressureText} />
          </div>
          <div style={warningBoxStyle}>
            Planning sketch only. The final lift must be checked against the correct manufacturer/supplier load chart, counterweight/ballast, outrigger setup, accessories, ground conditions and appointed-person approval before lifting.
          </div>
        </div>
      </div>
    </div>
  );
}

function RangeChartSvg({
  refEl,
  chart,
  numbers,
  calc,
  displayedBoomLength,
  displayedBoomAngle,
  scale,
  onPointerMove,
  onPointerUp,
  onStartDrag,
}: {
  refEl: MutableRefObject<SVGSVGElement | null>;
  chart: RangeChartState;
  numbers: ChartNumbers;
  calc: ReturnType<typeof calculatedFrom>;
  displayedBoomLength: number;
  displayedBoomAngle: number;
  scale: { maxX: number; maxY: number };
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp: () => void;
  onStartDrag: (mode: "hook" | "object") => void;
}) {
  const viewWidth = 900;
  const viewHeight = 620;
  const left = 74;
  const right = 32;
  const top = 132;
  const bottom = 72;
  const plotW = viewWidth - left - right;
  const plotH = viewHeight - top - bottom;
  const x = (metres: number) => left + (metres / scale.maxX) * plotW;
  const y = (metres: number) => viewHeight - bottom - (metres / scale.maxY) * plotH;
  const pivotX = x(0);
  const pivotY = y(calc.pivotHeight);
  const hookX = x(calc.hookX);
  const hookY = y(calc.hookY);
  const boomEndX = x(calc.boomEndX);
  const boomEndY = y(calc.boomEndY);
  const objectX = x(numbers.objectDistanceM);
  const objectY = y(numbers.objectHeightM);
  const objectW = Math.max(12, x(numbers.objectDistanceM + numbers.objectWidthM) - objectX);
  const objectH = y(0) - objectY;
  const groundY = y(0);
  const majorStep = scale.maxX > 60 ? 10 : scale.maxX > 30 ? 5 : 1;
  const minorStep = majorStep === 1 ? 0.5 : majorStep / 5;
  const verticalLines: number[] = [];
  const horizontalLines: number[] = [];
  const horizontalGapM = numbers.radiusM - numbers.objectDistanceM;
  const clearanceM = calc.clearance;
  for (let value = 0; value <= scale.maxX + 0.001; value += minorStep) verticalLines.push(round(value, 2));
  for (let value = 0; value <= scale.maxY + 0.001; value += minorStep) horizontalLines.push(round(value, 2));

  const clientLines = splitSvgText(chart.clientName || "—", 42, 1);
  const craneLines = splitSvgText(chart.craneName || "—", 42, 2);
  const noteLines = splitSvgText(chart.notes || chart.selectedSetupLabel || "Lift sketch", 58, 1);
  const setupLines = splitSvgText(chart.selectedSetupLabel || "Manual check", 34, 2);
  const gapLabel = horizontalGapM >= 0 ? fmt(horizontalGapM) : `${fmt(Math.abs(horizontalGapM))} short`;
  const clearanceLabel = clearanceM >= 0 ? fmt(clearanceM) : `${fmt(Math.abs(clearanceM))} low`;
  const dangerStroke = clearanceM < 0 || horizontalGapM < 0 ? "#d12c2c" : "#ea5151";

  return (
    <div style={svgFrameStyle}>
      <svg
        ref={refEl}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        width="100%"
        role="img"
        aria-label="Range chart lift sketch"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ touchAction: "none", display: "block" }}
      >
        <rect x="0" y="0" width={viewWidth} height={viewHeight} fill="#ffffff" />
        <rect x="16" y="16" width={viewWidth - 32} height={viewHeight - 32} fill="#f6fbff" stroke="#3aa6c8" strokeWidth="2" />

        <text x="34" y="44" fontSize="18" fontWeight="800" fill="#3aa6c8">Client:</text>
        {clientLines.map((line, index) => <text key={`client-${index}`} x="116" y={44 + index * 18} fontSize="18" fontWeight="800" fill="#237fa0">{line}</text>)}
        <text x="34" y="70" fontSize="18" fontWeight="800" fill="#3aa6c8">Crane:</text>
        {craneLines.map((line, index) => <text key={`crane-${index}`} x="116" y={70 + index * 18} fontSize="17" fontWeight="800" fill="#237fa0">{line}</text>)}
        <text x="34" y="106" fontSize="18" fontWeight="800" fill="#3aa6c8">Notes:</text>
        {noteLines.map((line, index) => <text key={`notes-${index}`} x="116" y={106 + index * 18} fontSize="17" fontWeight="800" fill="#237fa0">{line}</text>)}
        <text x={viewWidth - 34} y="44" fontSize="14" fontWeight="800" fill="#3aa6c8" textAnchor="end">Setup / profile</text>
        {setupLines.map((line, index) => <text key={`setup-${index}`} x={viewWidth - 34} y={66 + index * 17} fontSize="15" fontWeight="800" fill="#237fa0" textAnchor="end">{line}</text>)}
        <line x1="16" y1="120" x2={viewWidth - 16} y2="120" stroke="#3aa6c8" strokeWidth="2" />

        <rect x={left} y={top} width={plotW} height={plotH} fill="#eef7fb" stroke="#d7e7ee" />
        {verticalLines.map((value) => {
          const isMajor = Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001;
          return <line key={`x-${value}`} x1={x(value)} y1={top} x2={x(value)} y2={viewHeight - bottom} stroke={isMajor ? "#c3d3db" : "#e1edf2"} strokeWidth={isMajor ? 1.4 : 0.7} />;
        })}
        {horizontalLines.map((value) => {
          const isMajor = Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001;
          return <line key={`y-${value}`} x1={left} y1={y(value)} x2={viewWidth - right} y2={y(value)} stroke={isMajor ? "#c3d3db" : "#e1edf2"} strokeWidth={isMajor ? 1.4 : 0.7} />;
        })}
        {verticalLines.filter((value) => Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001).map((value) => (
          <text key={`xl-${value}`} x={x(value)} y={viewHeight - bottom + 20} fontSize="12" fill="#4f5d64" textAnchor="middle">{value}</text>
        ))}
        {horizontalLines.filter((value) => Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001).map((value) => (
          <text key={`yl-${value}`} x={left - 10} y={y(value) + 4} fontSize="12" fill="#4f5d64" textAnchor="end">{value}</text>
        ))}

        <rect
          x={objectX}
          y={objectY}
          width={objectW}
          height={objectH}
          fill="#36a6c9"
          opacity="0.95"
          onPointerDown={(event) => { event.preventDefault(); onStartDrag("object"); }}
          style={{ cursor: "grab" }}
        />
        <line x1={Math.min(objectX, hookX)} y1={objectY} x2={Math.max(objectX, hookX)} y2={objectY} stroke={dangerStroke} strokeWidth="2" />
        <line x1={hookX} y1={Math.min(objectY, hookY)} x2={hookX} y2={Math.max(objectY, hookY)} stroke={dangerStroke} strokeWidth="2" />
        <line x1={pivotX} y1={groundY} x2={hookX} y2={groundY} stroke="#ea5151" strokeWidth="2" />
        <text x={(objectX + hookX) / 2} y={Math.min(objectY, hookY) - 8} fontSize="12" fontWeight="800" fill={dangerStroke} textAnchor="middle">{gapLabel}</text>
        <text x={hookX + 10} y={(objectY + hookY) / 2} fontSize="12" fontWeight="800" fill={dangerStroke}>{clearanceLabel}</text>
        <text x={(pivotX + hookX) / 2} y={groundY - 8} fontSize="12" fontWeight="800" fill="#ea5151" textAnchor="middle">{fmt(numbers.radiusM)}</text>

        <g transform={`translate(${pivotX - 60} ${groundY - 28})`}>
          <rect x="0" y="16" width="88" height="20" rx="4" fill="#f6a31a" stroke="#8d6500" strokeWidth="1.5" />
          <rect x="20" y="0" width="30" height="19" rx="3" fill="#f6a31a" stroke="#8d6500" strokeWidth="1.5" />
          <rect x="51" y="12" width="36" height="10" rx="2" fill="#f6a31a" stroke="#8d6500" strokeWidth="1.5" />
          <line x1="-10" y1="38" x2="102" y2="38" stroke="#6f6f6f" strokeWidth="7" strokeLinecap="round" />
          <circle cx="18" cy="42" r="9" fill="#858585" stroke="#4f4f4f" />
          <circle cx="56" cy="42" r="9" fill="#858585" stroke="#4f4f4f" />
          <circle cx="84" cy="42" r="9" fill="#858585" stroke="#4f4f4f" />
          <line x1="58" y1="15" x2="72" y2="-10" stroke="#f6a31a" strokeWidth="8" strokeLinecap="round" />
          <line x1="58" y1="15" x2="72" y2="-10" stroke="#8d6500" strokeWidth="2" strokeLinecap="round" />
        </g>

        <line x1={pivotX} y1={pivotY} x2={boomEndX} y2={boomEndY} stroke="#777" strokeWidth="9" strokeLinecap="round" />
        <line x1={pivotX} y1={pivotY} x2={boomEndX} y2={boomEndY} stroke="#4a4a4a" strokeWidth="2" strokeLinecap="round" />
        {numbers.jibLengthM > 0 ? (
          <>
            <line x1={boomEndX} y1={boomEndY} x2={hookX} y2={hookY} stroke="#777" strokeWidth="5" strokeLinecap="round" />
            <circle cx={boomEndX} cy={boomEndY} r="6" fill="#e11d1d" />
          </>
        ) : null}
        <circle cx={hookX} cy={hookY} r="9" fill="#e11d1d" stroke="#940c0c" strokeWidth="2" onPointerDown={(event) => { event.preventDefault(); onStartDrag("hook"); }} style={{ cursor: "grab" }} />
        <line x1={hookX} y1={hookY} x2={hookX} y2={hookY + 26} stroke="#333" strokeWidth="2" />
        <path d={`M ${hookX - 7} ${hookY + 26} Q ${hookX} ${hookY + 38} ${hookX + 7} ${hookY + 26}`} stroke="#333" strokeWidth="2" fill="none" />

        <rect x={left} y={viewHeight - bottom} width={plotW} height="2" fill="#4f5d64" />
        <rect x={left} y={top} width="2" height={plotH} fill="#4f5d64" />
        <text x={viewWidth - 36} y={viewHeight - 20} fontSize="11" fill="#888" textAnchor="end">AnnS CRM range chart • planning aid only</text>
      </svg>
    </div>
  );
}

function splitSvgText(value: string, maxChars: number, maxLines: number) {
  const text = clean(value) || "—";
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  const originalLineCount = words.join(" ").length;
  const joined = lines.join(" ");
  if (joined.length < originalLineCount && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(0, maxChars - 1)).trim()}…`;
  }
  return lines.length ? lines : ["—"];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div style={sectionStyle}><div style={sectionTitleStyle}>{title}</div><div style={{ display: "grid", gap: 10 }}>{children}</div></div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label style={fieldWrapStyle}><span style={fieldLabelStyle}>{label}</span><input type={type} step="0.01" value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label style={fieldWrapStyle}><span style={fieldLabelStyle}>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function TextArea({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return <label style={fieldWrapStyle}><span style={fieldLabelStyle}>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} style={textAreaStyle} /></label>;
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "danger" }) {
  const style = tone === "danger" ? dangerMetricStyle : metricStyle;
  return <div style={style}><div style={metricLabelStyle}>{label}</div><div style={metricValueStyle}>{value}</div></div>;
}

const cardStyle: CSSProperties = { background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16, display: "grid", gap: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.08)" };
const topRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" };
const buttonRowStyle: CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
const helperText: CSSProperties = { marginTop: 6, opacity: 0.74, fontSize: 13, lineHeight: 1.4 };
const builderGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)", gap: 16, alignItems: "start" };
const controlsStyle: CSSProperties = { display: "grid", gap: 12, maxHeight: "calc(100vh - 190px)", overflowY: "auto", paddingRight: 4 };
const sectionStyle: CSSProperties = { border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.75)" };
const sectionTitleStyle: CSSProperties = { fontWeight: 900, marginBottom: 10 };
const smallGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };
const previewWrapStyle: CSSProperties = { display: "grid", gap: 12, minWidth: 0 };
const svgFrameStyle: CSSProperties = { border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, overflow: "hidden", background: "#fff" };
const metricGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 };
const metricStyle: CSSProperties = { border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.8)" };
const dangerMetricStyle: CSSProperties = { border: "1px solid rgba(209,44,44,0.28)", borderRadius: 10, padding: 10, background: "rgba(209,44,44,0.08)" };
const metricLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 800, opacity: 0.72 };
const metricValueStyle: CSSProperties = { marginTop: 4, fontWeight: 900 };
const fieldWrapStyle: CSSProperties = { display: "grid", gap: 5 };
const fieldLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 900, opacity: 0.78 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 38, border: "1px solid rgba(0,0,0,0.14)", borderRadius: 9, padding: "0 10px", fontSize: 14, boxSizing: "border-box", background: "#fff" };
const textAreaStyle: CSSProperties = { width: "100%", border: "1px solid rgba(0,0,0,0.14)", borderRadius: 9, padding: 10, fontSize: 14, boxSizing: "border-box", background: "#fff", resize: "vertical" };
const primaryBtnStyle: CSSProperties = { padding: "10px 14px", borderRadius: 10, border: 0, background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer" };
const togglePillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 999, padding: "8px 12px", background: "#fff", fontWeight: 900 };
const messageBoxStyle: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(0,120,255,0.08)", border: "1px solid rgba(0,120,255,0.18)", fontWeight: 700 };
const warningBoxStyle: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(255,168,0,0.14)", border: "1px solid rgba(255,168,0,0.22)", fontSize: 13, lineHeight: 1.45, fontWeight: 700 };
const dangerBoxStyle: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(209,44,44,0.09)", border: "1px solid rgba(209,44,44,0.24)", color: "#7a1515", fontSize: 13, lineHeight: 1.45, fontWeight: 800 };
