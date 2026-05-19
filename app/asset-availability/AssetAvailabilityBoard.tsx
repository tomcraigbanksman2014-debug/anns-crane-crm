"use client";

import { useMemo, useState } from "react";
import {
  ASSET_AVAILABILITY_STATUS_OPTIONS,
  assetAvailabilityStatusLabel,
  formatAssetAvailabilityDate,
  type AssetAvailabilityRow,
  type AssetType,
} from "../lib/assetAvailability";

type AssetOption = {
  id: string;
  type: AssetType;
  name: string;
  subtitle?: string | null;
  status?: string | null;
};

type AvailabilityEntry = AssetAvailabilityRow & {
  asset_name?: string | null;
  asset_subtitle?: string | null;
};

type Props = {
  cranes: AssetOption[];
  vehicles: AssetOption[];
  initialEntries: AvailabilityEntry[];
  loadError?: string | null;
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

function formatDate(value: string | null | undefined) {
  const raw = clean(value);
  if (!raw) return "—";
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function entrySort(a: AvailabilityEntry, b: AvailabilityEntry) {
  const aDate = clean(a.start_date);
  const bDate = clean(b.start_date);
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  return clean(a.asset_name).localeCompare(clean(b.asset_name));
}

function makeAssetSubtitle(asset: any) {
  const parts = [asset.reg_number, asset.fleet_number, asset.vehicle_type, asset.make, asset.model]
    .map((item) => clean(item))
    .filter(Boolean);
  return parts.join(" • ") || null;
}

export default function AssetAvailabilityBoard({
  cranes,
  vehicles,
  initialEntries,
  loadError,
}: Props) {
  const initialAssetType: AssetType = cranes.length ? "crane" : "vehicle";
  const [entries, setEntries] = useState<AvailabilityEntry[]>(initialEntries);
  const [assetType, setAssetType] = useState<AssetType>(initialAssetType);
  const [assetId, setAssetId] = useState(initialAssetType === "crane" ? cranes[0]?.id ?? "" : vehicles[0]?.id ?? "");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState("maintenance");
  const [notes, setNotes] = useState("");
  const [blocksAssignment, setBlocksAssignment] = useState(true);
  const [view, setView] = useState<"upcoming" | "all" | "blocking" | "crane" | "vehicle">("upcoming");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(loadError ?? "");

  const assets = assetType === "crane" ? cranes : vehicles;

  const assetLookup = useMemo(() => {
    const map = new Map<string, AssetOption>();
    [...cranes, ...vehicles].forEach((asset) => map.set(`${asset.type}:${asset.id}`, asset));
    return map;
  }, [cranes, vehicles]);

  const today = todayIso();

  const sortedEntries = useMemo(() => {
    const rows = [...entries].sort(entrySort);
    return rows.filter((entry) => {
      const end = clean(entry.end_date) || clean(entry.start_date);
      if (view === "upcoming") return !end || end >= today;
      if (view === "blocking") return entry.blocks_assignment !== false && (!end || end >= today);
      if (view === "crane") return entry.asset_type === "crane" && (!end || end >= today);
      if (view === "vehicle") return entry.asset_type === "vehicle" && (!end || end >= today);
      return true;
    });
  }, [entries, today, view]);

  const counts = useMemo(() => {
    const upcoming = entries.filter((entry) => (clean(entry.end_date) || clean(entry.start_date)) >= today).length;
    const blocking = entries.filter((entry) => entry.blocks_assignment !== false && (clean(entry.end_date) || clean(entry.start_date)) >= today).length;
    const craneCount = entries.filter((entry) => entry.asset_type === "crane" && (clean(entry.end_date) || clean(entry.start_date)) >= today).length;
    const vehicleCount = entries.filter((entry) => entry.asset_type === "vehicle" && (clean(entry.end_date) || clean(entry.start_date)) >= today).length;
    return { upcoming, blocking, craneCount, vehicleCount };
  }, [entries, today]);

  function setType(nextType: AssetType) {
    setAssetType(nextType);
    const nextAssets = nextType === "crane" ? cranes : vehicles;
    setAssetId(nextAssets[0]?.id ?? "");
  }

  function selectedAsset() {
    return assets.find((asset) => asset.id === assetId) ?? null;
  }

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      if (!assetId) throw new Error(`Choose a ${assetType}.`);
      if (!startDate) throw new Error("Choose a start date.");

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
      if (!res.ok) throw new Error(json?.error || "Could not add asset downtime.");

      const asset = selectedAsset();
      const row = json?.entry as AssetAvailabilityRow | undefined;
      if (row) {
        setEntries((current) => [
          {
            ...row,
            asset_name: asset?.name ?? null,
            asset_subtitle: asset?.subtitle ?? null,
          },
          ...current,
        ]);
      }

      setMessage("Downtime added. It will show on the relevant planner date range.");
      setNotes("");
      setStartTime("");
      setEndTime("");
      setBlocksAssignment(true);
    } catch (err: any) {
      setError(err?.message || "Could not add asset downtime.");
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
    <div style={{ display: "grid", gap: 16 }}>
      <div style={summaryGrid}>
        <SummaryCard label="Upcoming downtime" value={counts.upcoming} />
        <SummaryCard label="Blocking assignment" value={counts.blocking} tone="danger" />
        <SummaryCard label="Crane entries" value={counts.craneCount} />
        <SummaryCard label="Vehicle entries" value={counts.vehicleCount} />
      </div>

      {message ? <div style={successBox}>{message}</div> : null}
      {error ? <div style={errorBox}>{error}</div> : null}

      <section style={cardStyle}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>Add crane / vehicle downtime</h2>
            <p style={subTextStyle}>
              Book MOT, service, inspection, maintenance, repair or breakdown time. Blocking entries show on the planner and stop assignment onto that asset.
            </p>
          </div>
        </div>

        <form onSubmit={addEntry} style={formGrid}>
          <label style={fieldWrap}>
            <span style={labelStyle}>Asset type</span>
            <select value={assetType} onChange={(e) => setType(e.target.value as AssetType)} style={inputStyle}>
              <option value="crane">Crane</option>
              <option value="vehicle">Vehicle</option>
            </select>
          </label>

          <label style={{ ...fieldWrap, gridColumn: "span 2" }}>
            <span style={labelStyle}>Asset</span>
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)} style={inputStyle}>
              {assets.length ? null : <option value="">No {assetType}s found</option>}
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}{asset.subtitle ? ` — ${asset.subtitle}` : ""}
                </option>
              ))}
            </select>
          </label>

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

          <Field label="From" value={startDate} onChange={setStartDate} type="date" required />
          <Field label="To" value={endDate} onChange={setEndDate} type="date" />
          <Field label="Start time" value={startTime} onChange={setStartTime} type="time" />
          <Field label="End time" value={endTime} onChange={setEndTime} type="time" />

          <label style={checkWrap}>
            <input
              type="checkbox"
              checked={blocksAssignment}
              onChange={(e) => setBlocksAssignment(e.target.checked)}
            />
            <span>Blocks assignment on planner</span>
          </label>

          <label style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
            <span style={labelStyle}>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Example: MOT booked all day at workshop, do not assign work."
              style={textareaStyle}
            />
          </label>

          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" disabled={saving || !assetId || !startDate} style={primaryBtn}>
              {saving ? "Adding…" : "Add downtime"}
            </button>
          </div>
        </form>
      </section>

      <section style={cardStyle}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>Downtime calendar</h2>
            <p style={subTextStyle}>Current and upcoming crane/vehicle unavailability in one place.</p>
          </div>
          <div style={tabsRow}>
            <FilterButton active={view === "upcoming"} onClick={() => setView("upcoming")}>Upcoming</FilterButton>
            <FilterButton active={view === "blocking"} onClick={() => setView("blocking")}>Blocking</FilterButton>
            <FilterButton active={view === "crane"} onClick={() => setView("crane")}>Cranes</FilterButton>
            <FilterButton active={view === "vehicle"} onClick={() => setView("vehicle")}>Vehicles</FilterButton>
            <FilterButton active={view === "all"} onClick={() => setView("all")}>All</FilterButton>
          </div>
        </div>

        {sortedEntries.length ? (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left" style={thStyle}>Date</th>
                  <th align="left" style={thStyle}>Asset</th>
                  <th align="left" style={thStyle}>Reason</th>
                  <th align="left" style={thStyle}>Planner</th>
                  <th align="left" style={thStyle}>Notes</th>
                  <th align="left" style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry) => {
                  const asset = assetLookup.get(`${entry.asset_type}:${entry.asset_id}`);
                  const assetName = clean(entry.asset_name) || asset?.name || "Unknown asset";
                  const assetSubtitle = clean(entry.asset_subtitle) || asset?.subtitle || "";
                  const plannerHref = entry.asset_type === "vehicle" ? "/transport-planner" : "/planner";

                  return (
                    <tr key={entry.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 900 }}>{formatAssetAvailabilityDate(entry)}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{formatDate(entry.start_date)}</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 900 }}>{assetName}</div>
                        <div style={{ fontSize: 12, opacity: 0.72 }}>
                          {entry.asset_type === "vehicle" ? "Vehicle" : "Crane"}{assetSubtitle ? ` • ${assetSubtitle}` : ""}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={statusPill}>{assetAvailabilityStatusLabel(entry.status)}</span>
                      </td>
                      <td style={tdStyle}>
                        {entry.blocks_assignment === false ? (
                          <span style={softPill}>Shows only</span>
                        ) : (
                          <span style={blockPill}>Blocks assignment</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, minWidth: 220 }}>{entry.notes || "—"}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <a href={plannerHref} style={secondaryBtn}>Open planner</a>
                          <button
                            type="button"
                            disabled={deletingId === entry.id}
                            onClick={() => deleteEntry(entry.id)}
                            style={deleteBtn}
                          >
                            {deletingId === entry.id ? "Removing…" : "Remove"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={emptyBox}>No downtime entries found for this view.</div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div style={summaryCard}>
      <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 30, fontWeight: 1000, color: tone === "danger" ? "#8b0000" : "#111" }}>{value}</div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={active ? activeTabBtn : tabBtn}>
      {children}
    </button>
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
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type} required={required} style={inputStyle} />
    </label>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.20)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.42)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const summaryCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.34)",
  border: "1px solid rgba(255,255,255,0.46)",
  borderRadius: 14,
  padding: 16,
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const sectionTitle: React.CSSProperties = {
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

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  border: "1px solid rgba(0,0,0,0.10)",
  fontWeight: 900,
  textDecoration: "none",
  fontSize: 13,
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

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const tabBtn: React.CSSProperties = {
  padding: "8px 11px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.62)",
  color: "#111",
  fontWeight: 900,
  cursor: "pointer",
};

const activeTabBtn: React.CSSProperties = {
  ...tabBtn,
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
};

const thStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.78,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  verticalAlign: "top",
};

const statusPill: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,170,0,0.16)",
  border: "1px solid rgba(255,170,0,0.24)",
  fontSize: 12,
  fontWeight: 900,
};

const blockPill: React.CSSProperties = {
  ...statusPill,
  background: "rgba(190,0,0,0.11)",
  border: "1px solid rgba(190,0,0,0.18)",
  color: "#8b0000",
};

const softPill: React.CSSProperties = {
  ...statusPill,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.16)",
  color: "#0b57d0",
};

const emptyBox: React.CSSProperties = {
  marginTop: 12,
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.48)",
  border: "1px dashed rgba(0,0,0,0.12)",
  opacity: 0.78,
};

const successBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,128,0,0.10)",
  border: "1px solid rgba(0,128,0,0.18)",
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
