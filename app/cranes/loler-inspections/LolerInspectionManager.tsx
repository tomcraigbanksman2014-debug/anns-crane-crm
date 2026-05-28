"use client";

import { useMemo, useState } from "react";

type Crane = {
  id: string;
  name?: string | null;
  reg_number?: string | null;
  fleet_number?: string | null;
  loler_due_on?: string | null;
  last_loler_completed_on?: string | null;
  loler_notes?: string | null;
};

type LolerRun = {
  id: string;
  title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  inspector_company?: string | null;
  inspector_name?: string | null;
  notes?: string | null;
  archived?: boolean | null;
};

type LolerItem = {
  id: string;
  run_id: string;
  crane_id: string;
  planned_date?: string | null;
  status?: string | null;
  blocks_assignment?: boolean | null;
  notes?: string | null;
  certificate_reference?: string | null;
  next_loler_due_on?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "passed", label: "Passed / done" },
  { value: "failed", label: "Failed / action required" },
  { value: "deferred", label: "Deferred" },
];

function todayIso() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysIso(startIso: string, days: number) {
  const d = new Date(`${startIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB");
}

function statusLabel(value: string | null | undefined) {
  return STATUS_OPTIONS.find((item) => item.value === value)?.label ?? "Pending";
}

function craneLabel(crane: Crane | null | undefined) {
  if (!crane) return "Unknown crane";
  return [crane.name, crane.reg_number || crane.fleet_number].filter(Boolean).join(" • ") || "Unnamed crane";
}

function dueStyle(value: string | null | undefined): React.CSSProperties {
  if (!value) return neutralPill;
  const due = new Date(`${value}T00:00:00`);
  if (Number.isNaN(due.getTime())) return neutralPill;
  const diffDays = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return dangerPill;
  if (diffDays <= 30) return warnPill;
  return goodPill;
}

export default function LolerInspectionManager({
  cranes,
  initialRuns,
  initialItems,
  loadError,
  setupRequired,
}: {
  cranes: Crane[];
  initialRuns: LolerRun[];
  initialItems: LolerItem[];
  loadError?: string | null;
  setupRequired?: boolean;
}) {
  const defaultStart = todayIso();
  const [runs, setRuns] = useState<LolerRun[]>(initialRuns ?? []);
  const [items, setItems] = useState<LolerItem[]>(initialItems ?? []);
  const [selectedRunId, setSelectedRunId] = useState<string>(initialRuns?.[0]?.id ?? "");
  const [selectedCraneIds, setSelectedCraneIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [form, setForm] = useState({
    title: "LOLER inspection run",
    start_date: defaultStart,
    end_date: addDaysIso(defaultStart, 2),
    inspector_company: "",
    inspector_name: "",
    notes: "",
  });

  const craneById = useMemo(() => new Map((cranes ?? []).map((crane) => [String(crane.id), crane])), [cranes]);
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null;
  const selectedRunItems = items.filter((item) => String(item.run_id) === String(selectedRun?.id ?? ""));

  const runStats = useMemo(() => {
    const total = selectedRunItems.length;
    const done = selectedRunItems.filter((item) => item.status === "passed").length;
    const failed = selectedRunItems.filter((item) => item.status === "failed").length;
    const inProgress = selectedRunItems.filter((item) => item.status === "in_progress").length;
    return { total, done, failed, inProgress };
  }, [selectedRunItems]);

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleCrane(craneId: string) {
    setSelectedCraneIds((current) =>
      current.includes(craneId) ? current.filter((id) => id !== craneId) : [...current, craneId]
    );
  }

  async function createRun() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/crane-loler-inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, crane_ids: selectedCraneIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not create LOLER inspection run.");

      setRuns((current) => [data.run, ...current]);
      setItems((current) => [...(data.items ?? []), ...current]);
      setSelectedRunId(data.run.id);
      setSelectedCraneIds([]);
      setMessage("LOLER inspection run created.");
    } catch (err: any) {
      setError(err?.message || "Could not create LOLER inspection run.");
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(itemId: string, patch: Partial<LolerItem>) {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/crane-loler-inspections/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not update LOLER item.");

      setItems((current) => current.map((item) => (item.id === itemId ? data.item : item)));
      setMessage("LOLER item updated.");
    } catch (err: any) {
      setError(err?.message || "Could not update LOLER item.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveRun(runId: string) {
    if (!window.confirm("Archive this LOLER inspection run?")) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/crane-loler-inspections/${runId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not archive LOLER run.");

      const nextRuns = runs.filter((run) => run.id !== runId);
      setRuns(nextRuns);
      setItems((current) => current.filter((item) => item.run_id !== runId));
      setSelectedRunId(nextRuns[0]?.id ?? "");
      setMessage("LOLER inspection run archived.");
    } catch (err: any) {
      setError(err?.message || "Could not archive LOLER run.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={pageCard}>
      <div style={headerRow}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32 }}>LOLER inspections</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Plan multi-day crane LOLER inspections, work around booked jobs and mark each crane off separately.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="/planner" style={secondaryBtn}>Crane planner</a>
          <a href="/cranes" style={secondaryBtn}>Cranes</a>
        </div>
      </div>

      <div style={noticeBox}>
        Planner behaviour: LOLER entries show as planner badges. They do <strong>not</strong> block crane assignment unless <strong>Block assignment while inspected</strong> is ticked for that crane.
      </div>

      {setupRequired ? <div style={warnBox}>Run the LOLER SQL first, then refresh this page.</div> : null}
      {error ? <div style={errorBox}>{error}</div> : null}
      {message ? <div style={successBox}>{message}</div> : null}

      <div style={twoCol}>
        <section style={panelStyle}>
          <h2 style={sectionTitle}>Create inspection run</h2>
          <div style={formGrid}>
            <label style={fieldLabel}>
              Title
              <input value={form.title} onChange={(e) => updateForm("title", e.target.value)} style={inputStyle} />
            </label>
            <label style={fieldLabel}>
              Start date
              <input type="date" value={form.start_date} onChange={(e) => updateForm("start_date", e.target.value)} style={inputStyle} />
            </label>
            <label style={fieldLabel}>
              End date
              <input type="date" value={form.end_date} onChange={(e) => updateForm("end_date", e.target.value)} style={inputStyle} />
            </label>
            <label style={fieldLabel}>
              Inspector company
              <input value={form.inspector_company} onChange={(e) => updateForm("inspector_company", e.target.value)} style={inputStyle} />
            </label>
            <label style={fieldLabel}>
              Inspector name
              <input value={form.inspector_name} onChange={(e) => updateForm("inspector_name", e.target.value)} style={inputStyle} />
            </label>
            <label style={{ ...fieldLabel, gridColumn: "1 / -1" }}>
              Notes
              <textarea value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} style={textareaStyle} />
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>Cranes in this inspection</div>
            <div style={craneSelectGrid}>
              {cranes.map((crane) => (
                <label key={crane.id} style={craneCheckCard}>
                  <input
                    type="checkbox"
                    checked={selectedCraneIds.includes(String(crane.id))}
                    onChange={() => toggleCrane(String(crane.id))}
                  />
                  <span>
                    <strong>{craneLabel(crane)}</strong>
                    <span style={{ display: "block", marginTop: 2, fontSize: 12, opacity: 0.72 }}>
                      LOLER due: {fmtDate(crane.loler_due_on)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button type="button" onClick={createRun} disabled={saving || setupRequired} style={primaryBtn}>
            {saving ? "Saving…" : "Create LOLER run"}
          </button>
        </section>

        <section style={panelStyle}>
          <h2 style={sectionTitle}>Fleet LOLER dates</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {cranes.map((crane) => (
              <div key={crane.id} style={fleetRow}>
                <div>
                  <div style={{ fontWeight: 1000 }}>{craneLabel(crane)}</div>
                  <div style={{ marginTop: 2, fontSize: 12, opacity: 0.72 }}>
                    Last completed: {fmtDate(crane.last_loler_completed_on)}
                  </div>
                </div>
                <span style={{ ...dueStyle(crane.loler_due_on), display: "inline-block" }}>
                  Due {fmtDate(crane.loler_due_on)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section style={{ ...panelStyle, marginTop: 16 }}>
        <div style={headerRow}>
          <h2 style={sectionTitle}>Inspection runs</h2>
          {runs.length > 0 ? (
            <select value={selectedRun?.id ?? ""} onChange={(e) => setSelectedRunId(e.target.value)} style={selectStyle}>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.title || "LOLER inspection"} — {fmtDate(run.start_date)} to {fmtDate(run.end_date)}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {!selectedRun ? (
          <div style={emptyBox}>No LOLER inspection runs created yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={runSummary}>
              <div>
                <div style={{ fontWeight: 1000, fontSize: 18 }}>{selectedRun.title || "LOLER inspection"}</div>
                <div style={{ marginTop: 4, opacity: 0.75 }}>
                  {fmtDate(selectedRun.start_date)} to {fmtDate(selectedRun.end_date)}
                  {selectedRun.inspector_company ? ` • ${selectedRun.inspector_company}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={neutralPill}>{runStats.done}/{runStats.total} done</span>
                {runStats.inProgress > 0 ? <span style={warnPill}>{runStats.inProgress} in progress</span> : null}
                {runStats.failed > 0 ? <span style={dangerPill}>{runStats.failed} failed</span> : null}
                <button type="button" onClick={() => archiveRun(selectedRun.id)} style={dangerBtn} disabled={saving}>Archive run</button>
              </div>
            </div>

            <div style={itemGrid}>
              {selectedRunItems.map((item) => {
                const crane = craneById.get(String(item.crane_id));
                const status = item.status || "pending";
                return (
                  <div key={item.id} style={itemCard}>
                    <div style={itemCardHeader}>
                      <div>
                        <div style={{ fontWeight: 1000 }}>{craneLabel(crane)}</div>
                        <div style={{ marginTop: 2, fontSize: 12, opacity: 0.72 }}>
                          Planned: {fmtDate(item.planned_date)}
                        </div>
                      </div>
                      <span style={status === "passed" ? goodPill : status === "failed" ? dangerPill : status === "in_progress" ? warnPill : neutralPill}>
                        {statusLabel(status)}
                      </span>
                    </div>

                    <div style={itemFormGrid}>
                      <label style={fieldLabel}>
                        Planned date
                        <input
                          type="date"
                          value={item.planned_date ?? ""}
                          onChange={(e) => updateItem(item.id, { planned_date: e.target.value })}
                          style={inputStyle}
                          disabled={saving}
                        />
                      </label>
                      <label style={fieldLabel}>
                        Status
                        <select
                          value={status}
                          onChange={(e) => updateItem(item.id, { status: e.target.value })}
                          style={inputStyle}
                          disabled={saving}
                        >
                          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label style={fieldLabel}>
                        Certificate / report ref
                        <input
                          value={item.certificate_reference ?? ""}
                          onBlur={(e) => updateItem(item.id, { certificate_reference: e.target.value })}
                          onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, certificate_reference: e.target.value } : row))}
                          style={inputStyle}
                        />
                      </label>
                      <label style={fieldLabel}>
                        Next LOLER due
                        <input
                          type="date"
                          value={item.next_loler_due_on ?? ""}
                          onChange={(e) => updateItem(item.id, { next_loler_due_on: e.target.value })}
                          style={inputStyle}
                          disabled={saving}
                        />
                      </label>
                    </div>

                    <label style={checkRow}>
                      <input
                        type="checkbox"
                        checked={item.blocks_assignment === true}
                        onChange={(e) => updateItem(item.id, { blocks_assignment: e.target.checked })}
                        disabled={saving}
                      />
                      Block assignment while this crane is being inspected
                    </label>

                    <label style={fieldLabel}>
                      Notes
                      <textarea
                        value={item.notes ?? ""}
                        onBlur={(e) => updateItem(item.id, { notes: e.target.value })}
                        onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, notes: e.target.value } : row))}
                        style={textareaStyle}
                      />
                    </label>

                    {status !== "passed" ? (
                      <button type="button" onClick={() => updateItem(item.id, { status: "passed" })} style={primaryBtn} disabled={saving}>
                        Mark passed / done
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 1.2fr) minmax(280px, 0.8fr)",
  gap: 16,
  marginTop: 16,
};

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 14,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 10,
  marginTop: 12,
};

const itemFormGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const fieldLabel: React.CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 13,
  fontWeight: 900,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 11px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.16)",
  boxSizing: "border-box",
  background: "rgba(255,255,255,0.92)",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  maxWidth: 460,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 74,
  resize: "vertical",
  fontFamily: "inherit",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  marginTop: 14,
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #111",
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.72)",
  color: "#111",
  border: "1px solid rgba(0,0,0,0.10)",
  fontWeight: 900,
};

const dangerBtn: React.CSSProperties = {
  ...secondaryBtn,
  color: "#8b0000",
  border: "1px solid rgba(220,38,38,0.28)",
};

const craneSelectGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 8,
  maxHeight: 360,
  overflow: "auto",
  paddingRight: 4,
};

const craneCheckCard: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  padding: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  cursor: "pointer",
};

const fleetRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  padding: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const runSummary: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  padding: 12,
  borderRadius: 12,
  background: "rgba(240,249,255,0.75)",
  border: "1px solid rgba(14,165,233,0.20)",
};

const itemGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
};

const itemCard: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const itemCardHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
};

const checkRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontWeight: 900,
  fontSize: 13,
};

const neutralPill: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  color: "#111",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 12,
  fontWeight: 1000,
};

const goodPill: React.CSSProperties = {
  ...neutralPill,
  background: "rgba(22,163,74,0.12)",
  color: "#166534",
  border: "1px solid rgba(22,163,74,0.24)",
};

const warnPill: React.CSSProperties = {
  ...neutralPill,
  background: "rgba(255,170,0,0.14)",
  color: "#8a5609",
  border: "1px solid rgba(255,170,0,0.24)",
};

const dangerPill: React.CSSProperties = {
  ...neutralPill,
  background: "rgba(220,38,38,0.12)",
  color: "#7f1d1d",
  border: "1px solid rgba(220,38,38,0.26)",
};

const noticeBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 12,
  background: "rgba(14,165,233,0.10)",
  border: "1px solid rgba(14,165,233,0.22)",
  color: "#075985",
  fontWeight: 700,
};

const warnBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,170,0,0.14)",
  border: "1px solid rgba(255,170,0,0.24)",
  color: "#8a5609",
  fontWeight: 900,
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,0,0,0.08)",
  border: "1px solid rgba(255,0,0,0.20)",
  color: "#8b0000",
  fontWeight: 900,
};

const successBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "rgba(0,180,120,0.10)",
  border: "1px solid rgba(0,180,120,0.22)",
  color: "#0b7a4b",
  fontWeight: 900,
};

const emptyBox: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.78,
};
