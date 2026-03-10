"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type OptionItem = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  status: string | null;
};

export default function PlannerAssignSelect({
  jobId,
  currentValue,
  options,
  label,
  field,
  placeholder,
}: {
  jobId: string;
  currentValue?: string | null;
  options: OptionItem[];
  label: string;
  field: "equipment_id" | "operator_id";
  placeholder: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentValue ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onChange(nextValue: string) {
    setValue(nextValue);
    setMsg(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/planner/dispatch/${jobId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          [field]: nextValue || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || `Could not assign ${label.toLowerCase()}.`);
        return;
      }

      router.refresh();
    } catch {
      setMsg(`Could not assign ${label.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <label style={labelStyle}>{label}</label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
        style={selectStyle}
      >
        <option value="">{placeholder}</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name ?? item.full_name ?? "Unnamed"}
            {item.status ? ` (${item.status})` : ""}
          </option>
        ))}
      </select>

      {saving ? (
        <div style={helperStyle}>Saving…</div>
      ) : msg ? (
        <div style={errorStyle}>{msg}</div>
      ) : null}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.78,
  marginBottom: 6,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.88)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const helperStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  opacity: 0.7,
};

const errorStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: "#b00020",
};
