"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

type PackSections = {
  cover_project?: string | null;
  lift_classification?: string | null;
  boom_configuration?: string | null;
  boom_length?: string | null;
  introduction?: string | null;
  client_responsibilities?: string | null;
  contract_lift_arrival?: string | null;
  scope_of_works?: string | null;
  communication?: string | null;
  weather_conditions?: string | null;
  site_access_egress?: string | null;
  ground_conditions?: string | null;
  overhead_obstructions?: string | null;
  traffic_pedestrian_management?: string | null;
  lifting_equipment_certification?: string | null;
  crane_details?: string | null;
  crane_setup_procedure?: string | null;
  lifting_procedure?: string | null;
  de_rig_procedure?: string | null;
  emergency_procedure?: string | null;
  risk_assessment_summary?: string | null;
  emergency_contacts?: string | null;
  equipment_list?: string | null;
  toolbox_notes?: string | null;
};

const fields: Array<{ key: keyof PackSections; label: string; rows?: number; hint?: string }> = [
  { key: "cover_project", label: "Cover sheet project title", rows: 2 },
  { key: "lift_classification", label: "Lift classification", rows: 2 },
  { key: "boom_configuration", label: "Boom configuration override", rows: 2 },
  { key: "boom_length", label: "Boom length override", rows: 2 },
  { key: "introduction", label: "Introduction", rows: 5 },
  { key: "client_responsibilities", label: "Client responsibilities", rows: 6 },
  { key: "contract_lift_arrival", label: "Contract lift / arrival on site", rows: 5 },
  { key: "scope_of_works", label: "Scope of works", rows: 6 },
  { key: "communication", label: "Communication section", rows: 4 },
  { key: "weather_conditions", label: "Weather conditions", rows: 5 },
  { key: "site_access_egress", label: "Site access and egress", rows: 4 },
  { key: "ground_conditions", label: "Ground conditions", rows: 4 },
  { key: "overhead_obstructions", label: "Overhead obstructions / slewing restrictions", rows: 4 },
  { key: "traffic_pedestrian_management", label: "Traffic and pedestrian management", rows: 4 },
  { key: "lifting_equipment_certification", label: "Lifting equipment & certification", rows: 4 },
  { key: "crane_details", label: "Crane details notes", rows: 5, hint: "Use this for ground loading notes, mat notes, utilisation comments and chart notes." },
  { key: "crane_setup_procedure", label: "Crane set-up procedure", rows: 6 },
  { key: "lifting_procedure", label: "Lifting procedure", rows: 8 },
  { key: "de_rig_procedure", label: "De-rig procedure", rows: 5 },
  { key: "emergency_procedure", label: "Emergency procedure", rows: 5 },
  { key: "risk_assessment_summary", label: "Risk assessment summary", rows: 6 },
  { key: "emergency_contacts", label: "Emergency contacts", rows: 4, hint: "Put one contact per line." },
  { key: "equipment_list", label: "Equipment list", rows: 5, hint: "Put one item per line." },
  { key: "toolbox_notes", label: "Toolbox / sign-off notes", rows: 4 },
];

export default function PackSectionsForm({
  jobId,
  initialSections,
}: {
  jobId: string;
  initialSections: PackSections | null;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const field of fields) next[field.key] = String(initialSections?.[field.key] ?? "");
    return next;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const dirtyCount = useMemo(
    () => fields.filter((field) => String(initialSections?.[field.key] ?? "") !== String(values[field.key] ?? "")).length,
    [initialSections, values]
  );

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const payload: Record<string, string> = {};
      for (const field of fields) payload[field.key] = values[field.key] ?? "";

      const response = await fetch(`/api/jobs/${jobId}/lift-plan/pack-sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Failed to save pack sections");
      setMessage("Pack section content saved.");
    } catch (err: any) {
      setError(err?.message || "Failed to save pack sections");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      <div style={topRow}>
        <div>
          <h2 style={{ margin: 0, fontSize: 28 }}>Section-specific editable fields</h2>
          <div style={{ marginTop: 6, opacity: 0.78 }}>
            Control the long-form lift plan pack sections per job instead of relying only on drafted text.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, opacity: 0.75 }}>
            {dirtyCount} changed field{dirtyCount === 1 ? "" : "s"}
          </div>
          <button type="button" onClick={handleSave} disabled={saving} style={primaryBtn}>
            {saving ? "Saving..." : "Save section content"}
          </button>
        </div>
      </div>

      {message ? <div style={okBox}>{message}</div> : null}
      {error ? <div style={errorBox}>{error}</div> : null}

      <div style={grid}>
        {fields.map((field) => (
          <div key={field.key} style={fieldCard}>
            <label style={label}>{field.label}</label>
            {field.hint ? <div style={hint}>{field.hint}</div> : null}
            <textarea
              value={values[field.key] ?? ""}
              onChange={(event) => setField(field.key, event.target.value)}
              rows={field.rows ?? 4}
              style={textarea}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const card: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const topRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 14,
};

const fieldCard: CSSProperties = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 12,
};

const label: CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 900,
  marginBottom: 6,
};

const hint: CSSProperties = {
  fontSize: 12,
  opacity: 0.72,
  marginBottom: 8,
};

const textarea: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  padding: 10,
  font: "inherit",
  resize: "vertical",
  background: "#fff",
};

const primaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
};

const okBox: CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,128,0,0.10)",
  border: "1px solid rgba(0,128,0,0.18)",
};

const errorBox: CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};
