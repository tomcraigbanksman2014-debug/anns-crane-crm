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
  lift_supervisor?: string | null;
  appointed_person?: string | null;
  crane_operator?: string | null;
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
    lift_supervisor: initial?.lift_supervisor ?? "",
    appointed_person: initial?.appointed_person ?? "",
    crane_operator: initial?.crane_operator ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  function update(key: keyof LiftPlanData, value: any) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMsg("");

    try {
      const res = await fetch(`/api/jobs/${jobId}/lift-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Error saving lift plan.");
        return;
      }

      setMsg("Lift plan saved.");
    } catch {
      setMsg("Error saving lift plan.");
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
        <h2 style={{ margin: 0, fontSize: 22 }}>Lift Plan</h2>

        <a href={`/jobs/${jobId}/lift-plan/print`} target="_blank" style={printBtn}>
          Open printable lift plan
        </a>
      </div>

      <div style={gridStyle}>
        <Field
          label="Load description"
          value={form.load_description ?? ""}
          onChange={(v) => update("load_description", v)}
        />
        <Field
          label="Load weight (kg)"
          type="number"
          step="0.01"
          value={form.load_weight ?? ""}
          onChange={(v) => update("load_weight", v)}
        />
        <Field
          label="Lift radius (m)"
          type="number"
          step="0.01"
          value={form.lift_radius ?? ""}
          onChange={(v) => update("lift_radius", v)}
        />
        <Field
          label="Lift height (m)"
          type="number"
          step="0.01"
          value={form.lift_height ?? ""}
          onChange={(v) => update("lift_height", v)}
        />
      </div>

      <div style={gridStyle}>
        <Field
          label="Sling type"
          value={form.sling_type ?? ""}
          onChange={(v) => update("sling_type", v)}
        />
        <Field
          label="Lifting accessories"
          value={form.lifting_accessories ?? ""}
          onChange={(v) => update("lifting_accessories", v)}
        />
        <Field
          label="Lift supervisor"
          value={form.lift_supervisor ?? ""}
          onChange={(v) => update("lift_supervisor", v)}
        />
        <Field
          label="Appointed person"
          value={form.appointed_person ?? ""}
          onChange={(v) => update("appointed_person", v)}
        />
        <Field
          label="Crane operator"
          value={form.crane_operator ?? ""}
          onChange={(v) => update("crane_operator", v)}
        />
      </div>

      <TextAreaField
        label="Crane configuration"
        value={form.crane_configuration ?? ""}
        onChange={(v) => update("crane_configuration", v)}
      />

      <TextAreaField
        label="Outrigger setup"
        value={form.outrigger_setup ?? ""}
        onChange={(v) => update("outrigger_setup", v)}
      />

      <TextAreaField
        label="Ground conditions"
        value={form.ground_conditions ?? ""}
        onChange={(v) => update("ground_conditions", v)}
      />

      <TextAreaField
        label="Method statement"
        value={form.method_statement ?? ""}
        onChange={(v) => update("method_statement", v)}
      />

      <TextAreaField
        label="Risk assessment"
        value={form.risk_assessment ?? ""}
        onChange={(v) => update("risk_assessment", v)}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button onClick={save} disabled={saving} style={saveBtn}>
          {saving ? "Saving..." : "Save Lift Plan"}
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
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
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
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
      <label style={labelStyle}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        style={textAreaStyle}
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

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 12,
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
