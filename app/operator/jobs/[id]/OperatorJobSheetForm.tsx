"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OperatorJobSheetForm({
  jobId,
  initialTravelHours,
  initialBreakHours,
  initialOvertimeHours,
  initialOperatorJobNotes,
  initialCustomerSignoffName,
  initialOperatorSignoffName,
  initialSubmittedToOfficeAt,
}: {
  jobId: string;
  initialTravelHours?: number | null;
  initialBreakHours?: number | null;
  initialOvertimeHours?: number | null;
  initialOperatorJobNotes?: string | null;
  initialCustomerSignoffName?: string | null;
  initialOperatorSignoffName?: string | null;
  initialSubmittedToOfficeAt?: string | null;
}) {
  const router = useRouter();

  const [travelHours, setTravelHours] = useState(String(initialTravelHours ?? 0));
  const [breakHours, setBreakHours] = useState(String(initialBreakHours ?? 0));
  const [overtimeHours, setOvertimeHours] = useState(String(initialOvertimeHours ?? 0));
  const [operatorJobNotes, setOperatorJobNotes] = useState(initialOperatorJobNotes ?? "");
  const [customerSignoffName, setCustomerSignoffName] = useState(initialCustomerSignoffName ?? "");
  const [operatorSignoffName, setOperatorSignoffName] = useState(initialOperatorSignoffName ?? "");
  const [submittedToOfficeAt, setSubmittedToOfficeAt] = useState(initialSubmittedToOfficeAt ?? null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(submit: boolean) {
    setSaving(true);
    setMsg(null);

    try {
      const res = await fetch(`/api/operator/jobs/${jobId}/job-sheet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          travel_hours: travelHours,
          break_hours: breakHours,
          overtime_hours: overtimeHours,
          operator_job_notes: operatorJobNotes,
          customer_signoff_name: customerSignoffName,
          operator_signoff_name: operatorSignoffName,
          submit,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not save job sheet.");
        return;
      }

      if (submit) {
        setSubmittedToOfficeAt(new Date().toISOString());
        setMsg("Job sheet submitted to office.");
      } else {
        setMsg("Job sheet saved.");
      }

      router.refresh();
    } catch {
      setMsg("Could not save job sheet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 22 }}>Job Sheet</h2>

      <div style={gridStyle}>
        <Field
          label="Travel hours"
          value={travelHours}
          onChange={setTravelHours}
          type="number"
          step="0.25"
        />
        <Field
          label="Break hours"
          value={breakHours}
          onChange={setBreakHours}
          type="number"
          step="0.25"
        />
        <Field
          label="Overtime hours"
          value={overtimeHours}
          onChange={setOvertimeHours}
          type="number"
          step="0.25"
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Operator notes</label>
        <textarea
          value={operatorJobNotes}
          onChange={(e) => setOperatorJobNotes(e.target.value)}
          rows={5}
          style={textareaStyle}
        />
      </div>

      <div style={gridStyle}>
        <Field
          label="Customer sign-off name"
          value={customerSignoffName}
          onChange={setCustomerSignoffName}
        />
        <Field
          label="Operator sign-off name"
          value={operatorSignoffName}
          onChange={setOperatorSignoffName}
        />
      </div>

      {submittedToOfficeAt ? (
        <div style={submittedBoxStyle}>
          Submitted to office.
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button
          type="button"
          onClick={() => save(false)}
          disabled={saving}
          style={secondaryBtn}
        >
          {saving ? "Saving..." : "Save job sheet"}
        </button>

        <button
          type="button"
          onClick={() => save(true)}
          disabled={saving}
          style={primaryBtn}
        >
          {saving ? "Submitting..." : "Submit to office"}
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
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <div style={{ marginTop: 12 }}>
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

const wrapStyle: React.CSSProperties = {
  marginTop: 18,
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 800,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  padding: "0 12px",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  padding: "10px 12px",
  boxSizing: "border-box",
  resize: "vertical",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const submittedBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.20)",
  color: "#0b7a4b",
  fontWeight: 800,
};

const msgStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  fontWeight: 700,
};
