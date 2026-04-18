"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import type { EquipmentProfile } from "../../lib/ai/equipmentProfiles";

type TransportLiftPlanData = {
  job_summary?: string | null;
  load_description?: string | null;
  load_weight?: number | null;
  lift_radius?: number | null;
  lift_height?: number | null;
  vehicle_configuration?: string | null;
  hiab_configuration?: string | null;
  outrigger_setup?: string | null;
  ground_conditions?: string | null;
  pickup_method?: string | null;
  delivery_method?: string | null;
  route_notes?: string | null;
  access_notes?: string | null;
  exclusion_zone_details?: string | null;
  traffic_management?: string | null;
  load_securing_method?: string | null;
  lifting_accessories?: string | null;
  site_hazards?: string | null;
  control_measures?: string | null;
  ppe_required?: string | null;
  weather_limitations?: string | null;
  emergency_procedures?: string | null;
  method_statement?: string | null;
  risk_assessment?: string | null;
  appointed_person?: string | null;
  lift_supervisor?: string | null;
  operator_name?: string | null;
  rams_complete?: boolean;
  lift_plan_complete?: boolean;
  approved_by?: string | null;
  approved_at?: string | null;
  approval_notes?: string | null;
  customer_signed_by?: string | null;
  operator_signed_by?: string | null;
  office_signed_by?: string | null;
  finalised_at?: string | null;
  paperwork_locked?: boolean;
};


function hasDraftValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  return true;
}

function mergeGeneratedDraft<T extends Record<string, any>>(prev: T, draft: Partial<T> | null | undefined, preserveKeys: string[]) {
  const next: Record<string, any> = { ...prev };
  const preserve = new Set(preserveKeys);

  for (const [key, value] of Object.entries(draft ?? {})) {
    if (preserve.has(key) && hasDraftValue(prev[key])) {
      continue;
    }
    if (hasDraftValue(value)) {
      next[key] = value;
    }
  }

  return next as T;
}

function toInputDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function TransportLiftPlanForm({
  transportJobId,
  initial,
  equipmentProfile,
}: {
  transportJobId: string;
  initial: TransportLiftPlanData | null;
  equipmentProfile?: EquipmentProfile | null;
}) {
  const [form, setForm] = useState<TransportLiftPlanData>({
    job_summary: initial?.job_summary ?? "",
    load_description: initial?.load_description ?? "",
    load_weight: initial?.load_weight ?? null,
    lift_radius: initial?.lift_radius ?? null,
    lift_height: initial?.lift_height ?? null,
    vehicle_configuration: initial?.vehicle_configuration ?? "",
    hiab_configuration: initial?.hiab_configuration ?? "",
    outrigger_setup: initial?.outrigger_setup ?? "",
    ground_conditions: initial?.ground_conditions ?? "",
    pickup_method: initial?.pickup_method ?? "",
    delivery_method: initial?.delivery_method ?? "",
    route_notes: initial?.route_notes ?? "",
    access_notes: initial?.access_notes ?? "",
    exclusion_zone_details: initial?.exclusion_zone_details ?? "",
    traffic_management: initial?.traffic_management ?? "",
    load_securing_method: initial?.load_securing_method ?? "",
    lifting_accessories: initial?.lifting_accessories ?? "",
    site_hazards: initial?.site_hazards ?? "",
    control_measures: initial?.control_measures ?? "",
    ppe_required: initial?.ppe_required ?? "",
    weather_limitations: initial?.weather_limitations ?? "",
    emergency_procedures: initial?.emergency_procedures ?? "",
    method_statement: initial?.method_statement ?? "",
    risk_assessment: initial?.risk_assessment ?? "",
    appointed_person: initial?.appointed_person ?? "",
    lift_supervisor: initial?.lift_supervisor ?? "",
    operator_name: initial?.operator_name ?? "",
    rams_complete: initial?.rams_complete ?? false,
    lift_plan_complete: initial?.lift_plan_complete ?? false,
    approved_by: initial?.approved_by ?? "",
    approved_at: initial?.approved_at ?? "",
    approval_notes: initial?.approval_notes ?? "",
    customer_signed_by: initial?.customer_signed_by ?? "",
    operator_signed_by: initial?.operator_signed_by ?? "",
    office_signed_by: initial?.office_signed_by ?? "",
    finalised_at: initial?.finalised_at ?? "",
    paperwork_locked: initial?.paperwork_locked ?? false,
  });

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [msg, setMsg] = useState("");
  const locked = !!form.paperwork_locked;

  function update(key: keyof TransportLiftPlanData, value: any) {
    if (locked) return;
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function postForm(payload: TransportLiftPlanData) {
    const res = await fetch(`/api/transport-jobs/${transportJobId}/lift-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Error saving transport lift plan.");
    return data;
  }

  async function generateDraft() {
    if (locked) return;
    setGenerating(true);
    setMsg("");
    try {
      const res = await fetch(`/api/transport-jobs/${transportJobId}/lift-plan/generate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not generate draft.");
      setForm((prev) => {
        const merged = mergeGeneratedDraft(prev, data?.draft, ['job_summary', 'load_description', 'load_weight', 'lift_radius', 'lift_height', 'lifting_accessories', 'route_notes', 'access_notes']);
        return {
          ...merged,
          paperwork_locked: prev.paperwork_locked,
          approved_by: prev.approved_by,
          approved_at: prev.approved_at,
          approval_notes: prev.approval_notes,
          customer_signed_by: prev.customer_signed_by,
          operator_signed_by: prev.operator_signed_by,
          office_signed_by: prev.office_signed_by,
          finalised_at: prev.finalised_at,
        };
      });
      setMsg(`AI draft generated (${data?.provider === "openai" ? "AI" : "fallback"}). Review and edit before saving.`);
    } catch (e: any) {
      setMsg(e?.message || "Could not generate draft.");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (locked) return;
    setSaving(true);
    setMsg("");
    try {
      await postForm(form);
      setMsg("Transport lift plan / RAMS saved.");
    } catch (e: any) {
      setMsg(e?.message || "Error saving transport lift plan.");
    } finally {
      setSaving(false);
    }
  }

  function approveNow() {
    if (locked) return;
    const now = new Date().toISOString();
    setForm((prev) => ({ ...prev, approved_at: now, rams_complete: true, lift_plan_complete: true }));
  }

  async function finaliseNow() {
    if (locked) return;
    setSaving(true);
    setMsg("");
    try {
      const finalPayload: TransportLiftPlanData = { ...form, finalised_at: new Date().toISOString(), paperwork_locked: true };
      await postForm(finalPayload);
      setForm(finalPayload);
      setMsg("Paperwork finalised and locked.");
    } catch (e: any) {
      setMsg(e?.message || "Could not finalise paperwork.");
    } finally {
      setSaving(false);
    }
  }

  async function unlockNow() {
    setUnlocking(true);
    setMsg("");
    try {
      const res = await fetch(`/api/transport-jobs/${transportJobId}/lift-plan/unlock`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not unlock paperwork.");

      setForm((prev) => ({
        ...prev,
        paperwork_locked: false,
        finalised_at: "",
      }));

      setMsg("Paperwork unlocked. Make your changes and finalise it again when ready.");
    } catch (e: any) {
      setMsg(e?.message || "Could not unlock paperwork.");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <div style={topRow}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24 }}>HIAB Lift Plan & RAMS</h2>
          <div style={helperText}>Generate a draft for HIAB transport work, then review and finalise manually.</div>
        </div>
        <div style={buttonRow}>
          {locked ? (
            <button type="button" onClick={unlockNow} disabled={unlocking || generating || saving} style={warningBtn}>
              {unlocking ? "Unlocking…" : "Unlock for edits"}
            </button>
          ) : null}
          <button type="button" onClick={generateDraft} disabled={locked || generating || saving || unlocking} style={secondaryBtn}>{generating ? "Generating…" : "Generate AI draft"}</button>
          <button type="button" onClick={save} disabled={locked || generating || saving || unlocking} style={primaryBtn}>{saving ? "Saving…" : "Save draft"}</button>
          <button type="button" onClick={finaliseNow} disabled={locked || generating || saving || unlocking} style={dangerBtn}>Finalise & lock</button>
        </div>
      </div>

      {equipmentProfile ? <EquipmentProfileCard profile={equipmentProfile} /> : null}
      {locked ? <div style={lockedBox}>Paperwork is locked. Use <strong>Unlock for edits</strong> to reopen it, then finalise it again when you are done.</div> : null}
      {msg ? <div style={msgBox}>{msg}</div> : null}

      <Section title="Transport & load details">
        <div style={grid2}>
          <Field label="Job summary" value={form.job_summary ?? ""} onChange={(v) => update("job_summary", v)} disabled={locked} />
          <Field label="Load description" value={form.load_description ?? ""} onChange={(v) => update("load_description", v)} disabled={locked} />
          <Field label="Load weight (kg)" type="number" step="0.01" value={form.load_weight ?? ""} onChange={(v) => update("load_weight", v)} disabled={locked} />
          <Field label="Lift radius (m)" type="number" step="0.01" value={form.lift_radius ?? ""} onChange={(v) => update("lift_radius", v)} disabled={locked} />
          <Field label="Lift height (m)" type="number" step="0.01" value={form.lift_height ?? ""} onChange={(v) => update("lift_height", v)} disabled={locked} />
          <Field label="Operator name" value={form.operator_name ?? ""} onChange={(v) => update("operator_name", v)} disabled={locked} />
        </div>
      </Section>

      <Section title="Vehicle setup & movement plan">
        <TextAreaField label="Vehicle configuration" value={form.vehicle_configuration ?? ""} onChange={(v) => update("vehicle_configuration", v)} disabled={locked} />
        <TextAreaField label="HIAB configuration" value={form.hiab_configuration ?? ""} onChange={(v) => update("hiab_configuration", v)} disabled={locked} />
        <TextAreaField label="Outrigger setup" value={form.outrigger_setup ?? ""} onChange={(v) => update("outrigger_setup", v)} disabled={locked} />
        <TextAreaField label="Ground conditions" value={form.ground_conditions ?? ""} onChange={(v) => update("ground_conditions", v)} disabled={locked} />
        <TextAreaField label="Pickup method" value={form.pickup_method ?? ""} onChange={(v) => update("pickup_method", v)} disabled={locked} rows={4} />
        <TextAreaField label="Delivery method" value={form.delivery_method ?? ""} onChange={(v) => update("delivery_method", v)} disabled={locked} rows={4} />
        <TextAreaField label="Route notes" value={form.route_notes ?? ""} onChange={(v) => update("route_notes", v)} disabled={locked} rows={3} />
        <TextAreaField label="Access notes" value={form.access_notes ?? ""} onChange={(v) => update("access_notes", v)} disabled={locked} rows={3} />
        <TextAreaField label="Traffic management" value={form.traffic_management ?? ""} onChange={(v) => update("traffic_management", v)} disabled={locked} rows={3} />
        <TextAreaField label="Load securing method" value={form.load_securing_method ?? ""} onChange={(v) => update("load_securing_method", v)} disabled={locked} rows={3} />
      </Section>

      <Section title="RAMS wording">
        <TextAreaField label="Lifting accessories" value={form.lifting_accessories ?? ""} onChange={(v) => update("lifting_accessories", v)} disabled={locked} rows={3} />
        <TextAreaField label="Exclusion zone details" value={form.exclusion_zone_details ?? ""} onChange={(v) => update("exclusion_zone_details", v)} disabled={locked} rows={3} />
        <TextAreaField label="Method statement" value={form.method_statement ?? ""} onChange={(v) => update("method_statement", v)} disabled={locked} rows={6} />
        <TextAreaField label="Risk assessment" value={form.risk_assessment ?? ""} onChange={(v) => update("risk_assessment", v)} disabled={locked} rows={6} />
        <TextAreaField label="Site hazards" value={form.site_hazards ?? ""} onChange={(v) => update("site_hazards", v)} disabled={locked} rows={4} />
        <TextAreaField label="Control measures" value={form.control_measures ?? ""} onChange={(v) => update("control_measures", v)} disabled={locked} rows={4} />
        <TextAreaField label="PPE required" value={form.ppe_required ?? ""} onChange={(v) => update("ppe_required", v)} disabled={locked} rows={3} />
        <TextAreaField label="Weather limitations" value={form.weather_limitations ?? ""} onChange={(v) => update("weather_limitations", v)} disabled={locked} rows={3} />
        <TextAreaField label="Emergency procedures" value={form.emergency_procedures ?? ""} onChange={(v) => update("emergency_procedures", v)} disabled={locked} rows={4} />
      </Section>

      <Section title="Personnel & approval">
        <div style={grid2}>
          <Field label="Lift supervisor" value={form.lift_supervisor ?? ""} onChange={(v) => update("lift_supervisor", v)} disabled={locked} />
          <Field label="Appointed person" value={form.appointed_person ?? ""} onChange={(v) => update("appointed_person", v)} disabled={locked} />
          <Field label="Approved by" value={form.approved_by ?? ""} onChange={(v) => update("approved_by", v)} disabled={locked} />
          <Field label="Approved at" type="datetime-local" value={toInputDateTime(form.approved_at)} onChange={(v) => update("approved_at", v ? new Date(v).toISOString() : "")} disabled={locked} />
          <Field label="Finalised at" type="datetime-local" value={toInputDateTime(form.finalised_at)} onChange={(v) => update("finalised_at", v ? new Date(v).toISOString() : "")} disabled={locked} />
        </div>
        <TextAreaField label="Approval notes" value={form.approval_notes ?? ""} onChange={(v) => update("approval_notes", v)} disabled={locked} rows={3} />
        <div style={grid2}>
          <Field label="Customer signed by" value={form.customer_signed_by ?? ""} onChange={(v) => update("customer_signed_by", v)} disabled={locked} />
          <Field label="Operator signed by" value={form.operator_signed_by ?? ""} onChange={(v) => update("operator_signed_by", v)} disabled={locked} />
          <Field label="Office signed by" value={form.office_signed_by ?? ""} onChange={(v) => update("office_signed_by", v)} disabled={locked} />
        </div>
        <div style={tickRow}>
          <label style={tickLabel}><input type="checkbox" checked={!!form.rams_complete} onChange={(e) => update("rams_complete", e.target.checked)} disabled={locked} /> RAMS complete</label>
          <label style={tickLabel}><input type="checkbox" checked={!!form.lift_plan_complete} onChange={(e) => update("lift_plan_complete", e.target.checked)} disabled={locked} /> Lift plan complete</label>
          <button type="button" onClick={approveNow} disabled={locked || saving || generating} style={secondaryBtn}>Mark approved now</button>
        </div>
      </Section>
    </div>
  );
}

function EquipmentProfileCard({ profile }: { profile: EquipmentProfile }) { return <div style={profileCard}><div style={sectionTitle}>Selected equipment profile</div><div style={profileTitle}>{profile.title}</div><div style={profileSummary}>{profile.summary}</div><div style={grid2}><ReadOnlyFact label="Machine type" value={profile.machineType} /><ReadOnlyFact label="Max capacity" value={profile.maxCapacityKg ? `${profile.maxCapacityKg.toLocaleString()} kg` : profile.maxCapacityTonnes ? `${profile.maxCapacityTonnes} t` : "—"} /><ReadOnlyFact label="Hydraulic outreach" value={profile.maxHydraulicOutreachM ? `${profile.maxHydraulicOutreachM} m` : profile.maxBoomLengthM ? `${profile.maxBoomLengthM} m` : "—"} /><ReadOnlyFact label="Jib / max outreach" value={profile.maxJibOutreachM ? `${profile.maxJibOutreachM} m` : profile.maxRadiusM ? `${profile.maxRadiusM} m radius` : "—"} /></div><div style={{ marginTop: 12 }}><div style={fieldLabel}>Key warnings</div><ul style={warningList}>{profile.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div></div>; }
function ReadOnlyFact({ label, value }: { label: string; value: string }) { return <div style={summaryItem}><div style={fieldLabel}>{label}</div><div style={{ marginTop: 6, fontWeight: 800 }}>{value}</div></div>; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <div style={sectionStyle}><div style={sectionTitle}>{title}</div><div style={{ display: "grid", gap: 12 }}>{children}</div></div>; }
function Field({ label, value, onChange, type = "text", step, disabled }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; step?: string; disabled?: boolean; }) { return <label style={fieldWrap}><span style={fieldLabel}>{label}</span><input type={type} step={step} value={value as any} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={inputStyle} /></label>; }
function TextAreaField({ label, value, onChange, disabled, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; rows?: number; }) { return <label style={fieldWrap}><span style={fieldLabel}>{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={rows} style={textAreaStyle} /></label>; }

const wrapStyle: CSSProperties = { display: "grid", gap: 16 };
const topRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" };
const buttonRow: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const helperText: CSSProperties = { marginTop: 6, fontSize: 13, opacity: 0.75 };
const sectionStyle: CSSProperties = { background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16 };
const profileCard: CSSProperties = { ...sectionStyle, background: "rgba(255,248,225,0.8)" };
const profileTitle: CSSProperties = { fontSize: 18, fontWeight: 900 };
const profileSummary: CSSProperties = { marginTop: 6, opacity: 0.82 };
const sectionTitle: CSSProperties = { fontWeight: 900, marginBottom: 12 };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 };
const fieldWrap: CSSProperties = { display: "grid", gap: 6 };
const fieldLabel: CSSProperties = { fontSize: 13, fontWeight: 800, opacity: 0.82 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 42, borderRadius: 10, border: "1px solid rgba(0,0,0,0.14)", padding: "0 12px", fontSize: 14, boxSizing: "border-box", background: "#fff" };
const textAreaStyle: CSSProperties = { width: "100%", borderRadius: 10, border: "1px solid rgba(0,0,0,0.14)", padding: 12, fontSize: 14, boxSizing: "border-box", background: "#fff", resize: "vertical" };
const msgBox: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(0,120,255,0.08)", border: "1px solid rgba(0,120,255,0.18)" };
const lockedBox: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(180,0,0,0.10)", border: "1px solid rgba(180,0,0,0.18)", fontWeight: 800 };
const tickRow: CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" };
const tickLabel: CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontWeight: 700 };
const warningList: CSSProperties = { margin: "8px 0 0 18px", padding: 0, display: "grid", gap: 6 };
const summaryItem: CSSProperties = { background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 12 };
const primaryBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "none", textDecoration: "none", background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer" };
const secondaryBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.10)", textDecoration: "none", background: "rgba(255,255,255,0.86)", color: "#111", fontWeight: 900, cursor: "pointer" };
const dangerBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "none", textDecoration: "none", background: "#8a1f1f", color: "#fff", fontWeight: 900, cursor: "pointer" };
const warningBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, border: "none", textDecoration: "none", background: "#c77d00", color: "#fff", fontWeight: 900, cursor: "pointer" };
