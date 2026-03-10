"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type EquipmentItem = {
  id: string;
  name: string | null;
  status: string | null;
};

export default function PlannerAssignSelect({
  jobId,
  currentEquipmentId,
  equipment,
}: {
  jobId: string;
  currentEquipmentId?: string | null;
  equipment: EquipmentItem[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentEquipmentId ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onChange(nextValue: string) {
    setValue(nextValue);
    setMsg(null);
    setSaving(true);

    try {
      const res = await fetch("/api/planner/dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
          equipment_id: nextValue || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not assign crane.");
        return;
      }

      router.refresh();
    } catch {
      setMsg("Could not assign crane.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <label style={labelStyle}>Assign crane</label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
        style={selectStyle}
      >
        <option value="">Not assigned</option>
        {equipment.map((eq) => (
          <option key={eq.id} value={eq.id}>
            {eq.name ?? "Unnamed crane"}{eq.status ? ` (${eq.status})` : ""}
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
