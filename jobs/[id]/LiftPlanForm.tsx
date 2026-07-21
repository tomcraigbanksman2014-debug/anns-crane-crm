"use client";

import { useState } from "react";

type LiftPlanData = {
  load_description?: string | null;
  load_weight?: number | null;
  lift_radius?: number | null;
  lift_height?: number | null;
  crane_configuration?: string | null;
  outrigger_setup?: string | null;
  ground_conditions?: string | null;
  sling_type?: string | null;
  lifting_accessories?: string | null;
  method_statement?: string | null;
  risk_assessment?: string | null;
  site_hazards?: string | null;
  control_measures?: string | null;
  ppe_required?: string | null;
  exclusion_zone_details?: string | null;
  weather_limitations?: string | null;
  emergency_procedures?: string | null;
  lift_supervisor?: string | null;
  appointed_person?: string | null;
  crane_operator?: string | null;
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

export default function LiftPlanForm({
  jobId,
  initial,
}: {
  jobId: string;
  initial: LiftPlanData | null;
}) {
  const [form, setForm] = useState<LiftPlanData>({
    load_description: initial?.load_description ?? "",
    load_weight: initial?.load_weight ?? null,
    lift_radius: initial?.lift_radius ?? null,
    lift_height: initial?.lift_height ?? null,
    crane_configuration: initial?.crane_configuration ?? "",
    outrigger_setup: initial?.outrigger_setup ?? "",
    ground_conditions: initial?.ground_conditions ?? "",
    sling_type: initial?.sling_type ?? "",
    lifting_accessories: initial?.lifting_accessories ?? "",
    method_statement: initial?.method_statement ?? "",
    risk_assessment: initial?.risk_assessment ?? "",
    site_hazards: initial?.site_hazards ?? "",
    control_measures: initial?.control_measures ?? "",
    ppe_required: initial?.ppe_required ?? "",
    exclusion_zone_details: initial?.exclusion_zone_details ?? "",
    weather_limitations: initial?.weather_limitations ?? "",
    emergency_procedures: initial?.emergency_procedures ?? "",
    lift_supervisor: initial?.lift_supervisor ?? "",
    appointed_person: initial?.appointed_person ?? "",
    crane_operator: initial?.crane_operator ?? "",
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
  const [msg, setMsg] = useState("");

  const locked = !!form.paperwork_locked;

  function update(key: keyof LiftPlanData, value: any) {
    if (locked) return;
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function postForm(payload: LiftPlanData) {
    const res = await fetch(`/api/jobs/${jobId}/lift-plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || "Error saving lift plan.");
    }

    return data;
  }

  async function save() {
    if (locked) return;

    setSaving(true);
    setMsg("");

    try {
      await postForm(form);
      setMsg("Lift plan / RAMS saved.");
    } catch (e: any) {
      setMsg(e?.message || "Error saving lift plan.");
    } finally {
      setSaving(false);
    }
  }

  function approveNow() {
    if (locked) return;
    const now = new Date().toISOString();

    setForm((prev) => ({
      ...prev,
      approved_at: now,
      lift_plan_complete: true,
      rams_complete: true,
    }));
  }

  async function finaliseNow() {
    if (locked) return;

    setSaving(true);
    setMsg("");

    try {
      const now = new Date().toISOString();

      const finalPayload: LiftPlanData = {
        ...form,
        finalised_at: now,
        paperwork_locked: true,
      };

      await postForm(finalPayload);

      setForm(finalPayload);
      setMsg("Paperwork finalised and locked.");
    } catch (e: any) {
      setMsg(e?.message || "Could not finalise paperwork.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 22 }}>Lift Plan & RAMS</h2>

        <a href={`/jobs/${jobId}/lift-plan/print`} target="_blank" style={printBtn}>
          Open printable lift plan
        </a>
      </div>

      {locked ? (
        <div style={lockedBoxStyle}>
          Paperwork is locked and cannot be edited.
        </div>
      ) : null}

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Lift Details</div>
        <div style={gridStyle}>
          <Field
            label="Load description"
            value={form.load_description ?? ""}
            onChange={(v) => update("load_description", v)}
            disabled={locked}
          />
          <Field
            label="Load weight (kg)"
            type="number"
            step="0.01"
            value={form.load_weight ?? ""}
            onChange={(v) => update("load_weight", v)}
            disabled={locked}
          />
          <Field
            label="Lift radius (m)"
            type="number"
            step="0.01"
            value={form.lift_radius ?? ""}
            onChange={(v) => update("lift_radius", v)}
            disabled={locked}
          />
          <Field
            label="Lift height (m)"
            type="number"
            step="0.01"
            value={form.lift_height ?? ""}
            onChange={(v) => update("lift_height", v)}
            disabled={locked}
          />
          <Field
            label="Sling type"
            value={form.sling_type ?? ""}
            onChange={(v) => update("sling_type", v)}
            disabled={locked}
          />
          <Field
            label="Lifting accessories"
            value={form.lifting_accessories ?? ""}
            onChange={(v) => update("lifting_accessories", v)}
            disabled={locked}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Setup & Site Conditions</div>
        <TextAreaField
          label="Crane configuration"
          value={form.crane_configuration ?? ""}
          onChange={(v) => update("crane_configuration", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Outrigger setup"
          value={form.outrigger_setup ?? ""}
          onChange={(v) => update("outrigger_setup", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Ground conditions"
          value={form.ground_conditions ?? ""}
          onChange={(v) => update("ground_conditions", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Exclusion zone details"
          value={form.exclusion_zone_details ?? ""}
          onChange={(v) => update("exclusion_zone_details", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Weather limitations"
          value={form.weather_limitations ?? ""}
          onChange={(v) => update("weather_limitations", v)}
          disabled={locked}
        />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>RAMS</div>
        <TextAreaField
          label="Method statement"
          value={form.method_statement ?? ""}
          onChange={(v) => update("method_statement", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Risk assessment"
          value={form.risk_assessment ?? ""}
          onChange={(v) => update("risk_assessment", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Site hazards"
          value={form.site_hazards ?? ""}
          onChange={(v) => update("site_hazards", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Control measures"
          value={form.control_measures ?? ""}
          onChange={(v) => update("control_measures", v)}
          disabled={locked}
        />
        <TextAreaField
          label="PPE required"
          value={form.ppe_required ?? ""}
          onChange={(v) => update("ppe_required", v)}
          disabled={locked}
        />
        <TextAreaField
          label="Emergency procedures"
          value={form.emergency_procedures ?? ""}
          onChange={(v) => update("emergency_procedures", v)}
          disabled={locked}
        />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Personnel & Approval</div>
        <div style={gridStyle}>
          <Field
            label="Lift supervisor"
            value={form.lift_supervisor ?? ""}
            onChange={(v) => update("lift_supervisor", v)}
            disabled={locked}
          />
          <Field
            label="Appointed person"
            value={form.appointed_person ?? ""}
            onChange={(v) => update("appointed_person", v)}
            disabled={locked}
          />
          <Field
            label="Crane operator"
            value={form.crane_operator ?? ""}
            onChange={(v) => update("crane_operator", v)}
            disabled={locked}
          />
          <Field
            label="Approved by"
            value={form.approved_by ?? ""}
            onChange={(v) => update("approved_by", v)}
            disabled={locked}
          />
          <Field
            label="Approved at"
            type="datetime-local"
            value={form.approved_at ? String(form.approved_at).slice(0, 16) : ""}
            onChange={(v) => update("approved_at", v ? new Date(v).toISOString() : "")}
            disabled={locked}
          />
        </div>

        <TextAreaField
          label="Approval notes"
          value={form.approval_notes ?? ""}
          onChange={(v) => update("approval_notes", v)}
          disabled={locked}
        />

        <div style={checkGridStyle}>
          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={!!form.lift_plan_complete}
              onChange={(e) => update("lift_plan_complete", e.target.checked)}
              disabled={locked}
            />
            <span>Lift plan complete</span>
          </label>

          <label style={checkLabelStyle}>
            <input
              type="checkbox"
              checked={!!form.rams_complete}
              onChange={(e) => update("rams_complete", e.target.checked)}
              disabled={locked}
            />
            <span>RAMS complete</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" onClick={approveNow} style={secondaryBtn} disabled={locked || saving}>
            Mark approved now
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Sign-Off & Final Lock</div>

        <div style={gridStyle}>
          <Field
            label="Customer signed by"
            value={form.customer_signed_by ?? ""}
            onChange={(v) => update("customer_signed_by", v)}
            disabled={locked}
          />
          <Field
            label="Operator signed by"
            value={form.operator_signed_by ?? ""}
            onChange={(v) => update("operator_signed_by", v)}
            disabled={locked}
          />
          <Field
            label="Office signed by"
            value={form.office_signed_by ?? ""}
            onChange={(v) => update("office_signed_by", v)}
            disabled={locked}
          />
          <Field
            label="Finalised at"
            type="datetime-local"
            value={form.finalised_at ? String(form.finalised_at).slice(0, 16) : ""}
            onChange={(v) => update("finalised_at", v ? new Date(v).toISOString() : "")}
            disabled={locked}
          />
        </div>

        <label style={{ ...checkLabelStyle, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={!!form.paperwork_locked}
            readOnly
            disabled
          />
          <span>Paperwork locked</span>
        </label>

        {!locked ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button
              type="button"
              onClick={finaliseNow}
              style={finaliseBtn}
              disabled={saving}
            >
              {saving ? "Finalising..." : "Finalise & lock paperwork"}
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button onClick={save} disabled={saving || locked} style={saveBtn}>
          {saving ? "Saving..." : locked ? "Paperwork locked" : "Save Lift Plan & RAMS"}
        </button>
      </div>

      {msg ? <div style={msgStyle}>{msg}</div> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
        disabled={disabled}
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
      <label style={labelStyle}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        style={textAreaStyle}
        disabled={disabled}
      />
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  marginTop: 18,
  padding: 18,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const lockedBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.08)",
  border: "1px solid rgba(255,0,0,0.18)",
  color: "#b00020",
  fontWeight: 800,
};

const sectionStyle: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 12,
  borderTop: "1px solid rgba(0,0,0,0.08)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  marginBottom: 8,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 12,
};

const checkGridStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  marginTop: 14,
};

const checkLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 700,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.78,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
};

const textAreaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
  resize: "vertical",
};

const saveBtn: React.CSSProperties = {
  padding: "10px 16px",
  background: "#111",
  color: "#fff",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.7)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const finaliseBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,180,120,0.20)",
  background: "rgba(0,180,120,0.12)",
  color: "#0b7a4b",
  fontWeight: 900,
  cursor: "pointer",
};

const printBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  textDecoration: "none",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.70)",
  color: "#111",
  fontWeight: 800,
};

const msgStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  fontWeight: 700,
};
