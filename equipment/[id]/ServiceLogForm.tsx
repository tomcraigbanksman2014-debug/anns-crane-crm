"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  equipmentId: string;
};

export default function ServiceLogForm({ equipmentId }: Props) {
  const router = useRouter();

  const [entryType, setEntryType] = useState<
    "service" | "repair" | "inspection" | "loler" | "breakdown" | "note"
  >("service");
  const [serviceDate, setServiceDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [engineer, setEngineer] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!notes.trim()) {
      setError("Notes are required");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch(`/api/equipment/${equipmentId}/service-log/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entry_type: entryType,
          service_date: serviceDate,
          engineer,
          notes,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error ?? "Failed to save service log");
        return;
      }

      setEntryType("service");
      setServiceDate(new Date().toISOString().slice(0, 10));
      setEngineer("");
      setNotes("");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save service log");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={cardStyle}>
      <h2 style={{ marginTop: 0, marginBottom: 14, fontSize: 22 }}>
        Add service record
      </h2>

      {error && <div style={errorBox}>{error}</div>}

      <div style={gridStyle}>
        <div style={fieldWrap}>
          <label style={labelStyle}>Type</label>
          <select
            value={entryType}
            onChange={(e) =>
              setEntryType(
                e.target.value as
                  | "service"
                  | "repair"
                  | "inspection"
                  | "loler"
                  | "breakdown"
                  | "note"
              )
            }
            style={inputStyle}
          >
            <option value="service">Service</option>
            <option value="repair">Repair</option>
            <option value="inspection">Inspection</option>
            <option value="loler">LOLER</option>
            <option value="breakdown">Breakdown</option>
            <option value="note">Note</option>
          </select>
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>Service date</label>
          <input
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Engineer / provider</label>
          <input
            value={engineer}
            onChange={(e) => setEngineer(e.target.value)}
            style={inputStyle}
            placeholder="Engineer name or workshop"
          />
        </div>

        <div style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            style={{ ...inputStyle, resize: "vertical", minHeight: 140 }}
            placeholder="What work was carried out?"
          />
        </div>
      </div>

      <button type="submit" disabled={saving} style={buttonStyle}>
        {saving ? "Saving..." : "Save service record"}
      </button>
    </form>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  fontSize: 14,
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
