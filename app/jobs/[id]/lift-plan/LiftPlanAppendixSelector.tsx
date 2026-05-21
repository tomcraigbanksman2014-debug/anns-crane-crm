"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

type AppendixItem = {
  key: string;
  title: string;
  description: string | null;
  image_url: string;
  source_type?: string | null;
};

export default function LiftPlanAppendixSelector({
  jobId,
  items,
  initialSelectedKeys,
  hasSavedSelection,
}: {
  jobId: string;
  items: AppendixItem[];
  initialSelectedKeys: string[];
  hasSavedSelection: boolean;
}) {
  const defaultKeys = useMemo(() => items.map((item) => item.key), [items]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(hasSavedSelection ? initialSelectedKeys : defaultKeys)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function toggle(key: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function saveSelection() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/jobs/${jobId}/lift-plan/pack-selections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_appendix_keys: JSON.stringify(Array.from(selected)),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Could not save appendix selection.");
      setMessage("Spec sheet / appendix page selection saved.");
    } catch (error: any) {
      setMessage(error?.message || "Could not save appendix selection.");
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = selected.size;
  const summaryText = items.length
    ? `${selectedCount} of ${items.length} page${items.length === 1 ? "" : "s"} selected`
    : "No preview pages available";

  if (!items.length) {
    return (
      <details style={card}>
        <summary style={summaryStyle}>
          <span>Spec sheet / diagram selection</span>
          <span style={summaryPill}>{summaryText}</span>
        </summary>
        <div style={empty}>No spec sheet preview pages are available yet. For owned cranes, add the spec sheet/load chart to the crane record. For cross-hired cranes, use the job-specific upload section when it is shown.</div>
      </details>
    );
  }

  return (
    <details style={card}>
      <summary style={summaryStyle}>
        <span>Spec sheet / diagram selection</span>
        <span style={summaryPill}>{summaryText}</span>
      </summary>

      <div style={hint}>
        Tick only the specification/load-chart pages that should be pulled into the full lift plan pack. This helps stop the wrong diagrams being included.
      </div>

      {message ? <div style={messageBox}>{message}</div> : null}

      <div style={grid}>
        {items.map((item) => {
          const checked = selected.has(item.key);
          return (
            <label key={item.key} style={{ ...itemCard, borderColor: checked ? "rgba(17,17,17,0.45)" : "rgba(0,0,0,0.10)" }}>
              <div style={checkRow}>
                <input type="checkbox" checked={checked} onChange={(event) => toggle(item.key, event.target.checked)} />
                <span style={{ fontWeight: 900 }}>{checked ? "Included" : "Not included"}</span>
              </div>
              <div style={thumbWrap}>
                <img src={item.image_url} alt={item.title} style={thumb} />
              </div>
              <div style={itemTitle}>{item.title}</div>
              {item.description ? <div style={itemDesc}>{item.description}</div> : null}
              {item.source_type ? <div style={pill}>{item.source_type === "job" ? "Job / cross-hired spec" : "Crane record spec"}</div> : null}
            </label>
          );
        })}
      </div>

      <div style={actionsBottom}>
        <button type="button" onClick={() => setSelected(new Set(defaultKeys))} disabled={saving} style={secondaryBtn}>Select all</button>
        <button type="button" onClick={() => setSelected(new Set())} disabled={saving} style={secondaryBtn}>Clear</button>
        <button type="button" onClick={saveSelection} disabled={saving} style={primaryBtn}>{saving ? "Saving…" : "Save selection"}</button>
      </div>
    </details>
  );
}

const card: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 18,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  listStyle: "none",
};

const summaryPill: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.76,
  padding: "5px 9px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.75)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const hint: CSSProperties = { marginTop: 12, marginBottom: 12, fontSize: 13, opacity: 0.78, maxWidth: 860, lineHeight: 1.45 };
const actionsBottom: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 14 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 };
const itemCard: CSSProperties = { display: "grid", gap: 8, padding: 10, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, background: "rgba(255,255,255,0.75)", cursor: "pointer" };
const checkRow: CSSProperties = { display: "flex", gap: 8, alignItems: "center", fontSize: 13 };
const thumbWrap: CSSProperties = { height: 170, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, background: "#fff", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" };
const thumb: CSSProperties = { width: "100%", height: "100%", objectFit: "contain" };
const itemTitle: CSSProperties = { fontWeight: 900, fontSize: 13, lineHeight: 1.25 };
const itemDesc: CSSProperties = { fontSize: 12, opacity: 0.74 };
const pill: CSSProperties = { justifySelf: "start", fontSize: 11, fontWeight: 900, padding: "4px 7px", borderRadius: 999, background: "rgba(0,0,0,0.08)" };
const empty: CSSProperties = { marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.7)", opacity: 0.82 };
const messageBox: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(0,120,255,0.08)", border: "1px solid rgba(0,120,255,0.18)", marginBottom: 12 };
const primaryBtn: CSSProperties = { padding: "10px 14px", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer" };
const secondaryBtn: CSSProperties = { padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.9)", color: "#111", fontWeight: 900, cursor: "pointer" };
