"use client";

import { useMemo, useState } from "react";
import {
  ASSET_AVAILABILITY_STATUS_OPTIONS,
  assetAvailabilityStatusLabel,
  formatAssetAvailabilityDate,
  type AssetAvailabilityRow,
  type AssetType,
} from "../lib/assetAvailability";

type Props = {
  assetType: AssetType;
  assetId: string;
  assetName?: string | null;
  initialEntries?: AssetAvailabilityRow[];
};

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export default function AssetAvailabilityManager({
  assetType,
  assetId,
  assetName,
  initialEntries = [],
}: Props) {
  const [entries, setEntries] = useState<AssetAvailabilityRow[]>(initialEntries);
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState("maintenance");
  const [notes, setNotes] = useState("");
  const [blocksAssignment, setBlocksAssignment] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const aDate = clean(a.start_date);
      const bDate = clean(b.start_date);
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return clean(b.created_at).localeCompare(clean(a.created_at));
    });
  }, [entries]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const payload = {
        asset_type: assetType,
        asset_id: assetId,
        start_date: startDate,
        end_date: endDate || startDate,
        start_time: startTime || null,
        end_time: endTime || null,
        status,
        notes,
        blocks_assignment: blocksAssignment,
      };

      const res = await fetch("/api/asset-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not add downtime.");

      if (json?.entry) {
        setEntries((current) => [json.entry as AssetAvailabilityRow, ...current]);
      }

      setMessage("Downtime added.");
      setNotes("");
      setStartTime("");
      setEndTime("");
      setBlocksAssignment(true);
    } catch (err: any) {
      setError(err?.message || "Could not add downtime.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!id || deletingId) return;
    if (!window.confirm("Remove this downtime entry?")) return;

    setDeletingId(id);
    setMessage("");
    setError("");

    try {
      const res = await fetch(`/api/asset-availability/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not remove downtime.");

      setEntries((current) => current.filter((entry) => entry.id !== id));
      setMessage("Downtime removed.");
    } catch (err: any) {
      setError(err?.message || "Could not remove downtime.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <section style={cardStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>Availability / downtime</h2>
          <p style={subTextStyle}>
            Book maintenance, MOT, service, inspection, repairs or breakdowns so planners can see when {assetName || `this ${assetType}`} is not free.
          </p>
        </div>
      </div>

      {message ? <div style={successBox}>{message}</div> : null}
      {error ? <div style={errorBox}>{error}</div> : null}

      <form onSubmit={addEntry} style={formGrid}>
        <Field label="From" value={startDate} onChange={setStartDate} type="date" required />
        <Field label="To" value={endDate} onChange={setEndDate} type="date" />
        <Field label="Start time" value={startTime} onChange={setStartTime} type="time" />
        <Field label="End time" value={endTime} onChange={setEndTime} type="time" />

        <label style={fieldWrap}>
          <span style={labelStyle}>Reason</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            {ASSET_AVAILABILITY_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label style={checkWrap}>
          <input
            type="checkbox"
            checked={blocksAssignment}
            onChange={(e) => setBlocksAssignment(e.target.checked)}
          />
          <span>
            Blocks assignment on planner
          </span>
        </label>

        <label style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
          <span style={labelStyle}>Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Example: MOT booked at 08:00, workshop all day."
            style={textareaStyle}
          />
        </label>

        <div style={{ gridColumn: "1 / -1" }}>
          <button type="submit" disabled={saving || !startDate} style={primaryBtn}>
            {saving ? "Adding…" : "Add downtime"}
          </button>
        </div>
      </form>

      <div style={listWrap}>
        {activeEntries.length ? (
          activeEntries.map((entry) => (
            <div key={entry.id} style={entryRow}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={entryStatusPill}>{assetAvailabilityStatusLabel(entry.status)}</span>
                  {entry.blocks_assignment === false ? (
                    <span style={entrySoftPill}>Does not block assignment</span>
                  ) : (
                    <span style={entryBlockPill}>Blocks assignment</span>
                  )}
                </div>
                <div style={{ marginTop: 6, fontWeight: 900 }}>{formatAssetAvailabilityDate(entry)}</div>
                {entry.notes ? <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>{entry.notes}</div> : null}
              </div>

              <button
                type="button"
                disabled={deletingId === entry.id}
                onClick={() => deleteEntry(entry.id)}
                style={deleteBtn}
              >
                {deletingId === entry.id ? "Removing…" : "Remove"}
              </button>
            </div>
          ))
        ) : (
          <div style={emptyBox}>No downtime booked for this {assetType}.</div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label style={fieldWrap}>
      <span style={labelStyle}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        required={required}
        style={inputStyle}
      />
    </label>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.28)",
  border: "1px solid rgba(255,255,255,0.44)",
  borderRadius: 14,
  padding: 18,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 14,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
};

const subTextStyle: React.CSSProperties = {
  margin: "6px 0 0",
  opacity: 0.78,
  lineHeight: 1.45,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.78,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  resize: "vertical",
  boxSizing: "border-box",
};

const checkWrap: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  border: "none",
  fontWeight: 900,
  cursor: "pointer",
};

const deleteBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#8b0000",
  border: "1px solid rgba(139,0,0,0.18)",
  fontWeight: 900,
  cursor: "pointer",
};

const listWrap: React.CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 16,
};

const entryRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.56)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const entryStatusPill: React.CSSProperties = {
  padding: "5px 9px",
  borderRadius: 999,
  background: "rgba(255,170,0,0.16)",
  border: "1px solid rgba(255,170,0,0.24)",
  fontSize: 12,
  fontWeight: 900,
};

const entryBlockPill: React.CSSProperties = {
  ...entryStatusPill,
  background: "rgba(190,0,0,0.11)",
  border: "1px solid rgba(190,0,0,0.18)",
  color: "#8b0000",
};

const entrySoftPill: React.CSSProperties = {
  ...entryStatusPill,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.16)",
  color: "#0b57d0",
};

const emptyBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.48)",
  border: "1px dashed rgba(0,0,0,0.12)",
  opacity: 0.78,
};

const successBox: React.CSSProperties = {
  marginBottom: 10,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,128,0,0.10)",
  border: "1px solid rgba(0,128,0,0.18)",
};

const errorBox: React.CSSProperties = {
  marginBottom: 10,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
