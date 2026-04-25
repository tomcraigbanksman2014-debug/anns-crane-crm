"use client";

import { useEffect, useMemo, useState } from "react";

type LookupOption = {
  id: string;
  label: string;
  sublabel?: string | null;
};

type DailyLogEntry = {
  id: string;
  log_date: string;
  log_time?: string | null;
  log_type: string;
  title?: string | null;
  notes: string;
  resolved: boolean;
  resolved_at?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  linked_job_id?: string | null;
  linked_transport_job_id?: string | null;
  linked_operator_id?: string | null;
  linked_vehicle_id?: string | null;
  linked_crane_id?: string | null;
  linked_equipment_id?: string | null;
  linked_job?: { id: string; job_number?: number | string | null; site_name?: string | null } | null;
  linked_transport_job?: {
    id: string;
    transport_number?: string | null;
    collection_address?: string | null;
    delivery_address?: string | null;
  } | null;
  linked_operator?: { id: string; full_name?: string | null; company_name?: string | null; employment_type?: string | null } | null;
  linked_vehicle?: { id: string; name?: string | null; reg_number?: string | null } | null;
  linked_crane?: { id: string; name?: string | null; reg_number?: string | null } | null;
  linked_equipment?: { id: string; name?: string | null; asset_number?: string | null } | null;
};

type DailyLogResponse = {
  entries: DailyLogEntry[];
  lookups: {
    jobs: LookupOption[];
    transport_jobs: LookupOption[];
    operators: LookupOption[];
    vehicles: LookupOption[];
    cranes: LookupOption[];
    equipment: LookupOption[];
  };
};

type FormState = {
  log_date: string;
  log_time: string;
  log_type: string;
  title: string;
  notes: string;
  resolved: boolean;
  linked_job_id: string;
  linked_transport_job_id: string;
  linked_operator_id: string;
  linked_vehicle_id: string;
  linked_crane_id: string;
  linked_equipment_id: string;
};

const LOG_TYPES = [
  "general",
  "issue",
  "maintenance",
  "breakdown",
  "defect",
  "delay",
  "yard",
  "vehicle",
  "crane",
  "transport",
  "job",
  "other",
] as const;

const LOG_TYPE_LABELS: Record<string, string> = {
  general: "General",
  issue: "Issue",
  maintenance: "Maintenance",
  breakdown: "Breakdown",
  defect: "Defect",
  delay: "Delay",
  yard: "Yard",
  vehicle: "Vehicle",
  crane: "Crane",
  transport: "Transport",
  job: "Job",
  other: "Other",
};

function todayIso() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysIso(baseIso: string, days: number) {
  const base = new Date(`${baseIso}T00:00:00`);
  base.setDate(base.getDate() + days);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultFormState(): FormState {
  return {
    log_date: todayIso(),
    log_time: "",
    log_type: "general",
    title: "",
    notes: "",
    resolved: false,
    linked_job_id: "",
    linked_transport_job_id: "",
    linked_operator_id: "",
    linked_vehicle_id: "",
    linked_crane_id: "",
    linked_equipment_id: "",
  };
}

function logTypeLabel(value: string | null | undefined) {
  return LOG_TYPE_LABELS[String(value ?? "").trim().toLowerCase()] ?? "General";
}

function compactDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function compactTime(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.slice(0, 5);
}

function formatDateTime(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relatedSummary(entry: DailyLogEntry) {
  const parts: string[] = [];

  if (entry.linked_job?.id) {
    parts.push(`Job #${entry.linked_job.job_number ?? "—"}${entry.linked_job.site_name ? ` • ${entry.linked_job.site_name}` : ""}`);
  }
  if (entry.linked_transport_job?.id) {
    parts.push(`Transport ${entry.linked_transport_job.transport_number ?? "—"}`);
  }
  if (entry.linked_operator?.id) {
    parts.push(`Operator ${entry.linked_operator.full_name ?? "—"}`);
  }
  if (entry.linked_vehicle?.id) {
    parts.push(`Vehicle ${entry.linked_vehicle.name ?? entry.linked_vehicle.reg_number ?? "—"}`);
  }
  if (entry.linked_crane?.id) {
    parts.push(`Crane ${entry.linked_crane.name ?? entry.linked_crane.reg_number ?? "—"}`);
  }
  if (entry.linked_equipment?.id) {
    parts.push(`Equipment ${entry.linked_equipment.name ?? entry.linked_equipment.asset_number ?? "—"}`);
  }

  return parts;
}

export default function DailyLogClient() {
  const [data, setData] = useState<DailyLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    from: addDaysIso(todayIso(), -7),
    to: todayIso(),
    log_type: "all",
    resolved: "open",
  });
  const [form, setForm] = useState<FormState>(defaultFormState());

  async function loadEntries() {
    setLoading(true);
    setError("");

    try {
      const query = new URLSearchParams();
      if (filters.from) query.set("from", filters.from);
      if (filters.to) query.set("to", filters.to);
      if (filters.log_type && filters.log_type !== "all") query.set("log_type", filters.log_type);
      if (filters.resolved && filters.resolved !== "all") query.set("resolved", filters.resolved);

      const res = await fetch(`/api/daily-log?${query.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not load daily log.");
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Could not load daily log.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.log_type, filters.resolved]);

  const entries = data?.entries ?? [];
  const lookups = data?.lookups ?? {
    jobs: [],
    transport_jobs: [],
    operators: [],
    vehicles: [],
    cranes: [],
    equipment: [],
  };

  const formHeading = editingId ? "Edit daily log entry" : "Add daily log entry";
  const unresolvedCount = useMemo(() => entries.filter((entry) => !entry.resolved).length, [entries]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(defaultFormState());
  }

  function populateFromEntry(entry: DailyLogEntry) {
    setEditingId(entry.id);
    setForm({
      log_date: entry.log_date ?? todayIso(),
      log_time: compactTime(entry.log_time),
      log_type: entry.log_type ?? "general",
      title: entry.title ?? "",
      notes: entry.notes ?? "",
      resolved: Boolean(entry.resolved),
      linked_job_id: entry.linked_job_id ?? "",
      linked_transport_job_id: entry.linked_transport_job_id ?? "",
      linked_operator_id: entry.linked_operator_id ?? "",
      linked_vehicle_id: entry.linked_vehicle_id ?? "",
      linked_crane_id: entry.linked_crane_id ?? "",
      linked_equipment_id: entry.linked_equipment_id ?? "",
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    if (!form.notes.trim()) {
      setSaving(false);
      setError("Notes are required.");
      return;
    }

    const payload = {
      log_date: form.log_date,
      log_time: form.log_time || null,
      log_type: form.log_type,
      title: form.title || null,
      notes: form.notes,
      resolved: form.resolved,
      linked_job_id: form.linked_job_id || null,
      linked_transport_job_id: form.linked_transport_job_id || null,
      linked_operator_id: form.linked_operator_id || null,
      linked_vehicle_id: form.linked_vehicle_id || null,
      linked_crane_id: form.linked_crane_id || null,
      linked_equipment_id: form.linked_equipment_id || null,
    };

    try {
      const res = await fetch(editingId ? `/api/daily-log/${editingId}` : "/api/daily-log", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not save entry.");
      setMessage(editingId ? "Daily log entry updated." : "Daily log entry added.");
      resetForm();
      await loadEntries();
    } catch (e: any) {
      setError(e?.message || "Could not save entry.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this daily log entry?")) return;
    setError("");
    setMessage("");

    try {
      const res = await fetch(`/api/daily-log/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not delete entry.");
      if (editingId === id) resetForm();
      setMessage("Daily log entry deleted.");
      await loadEntries();
    } catch (e: any) {
      setError(e?.message || "Could not delete entry.");
    }
  }

  async function onToggleResolved(entry: DailyLogEntry) {
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/daily-log/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !entry.resolved }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not update entry.");
      setMessage(!entry.resolved ? "Entry marked resolved." : "Entry reopened.");
      await loadEntries();
    } catch (e: any) {
      setError(e?.message || "Could not update entry.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={heroWrap}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30 }}>Daily Log</h1>
          <div style={{ marginTop: 6, opacity: 0.78 }}>
            Record issues, maintenance, delays, defects and day-to-day ops notes in one place.
          </div>
        </div>

        <div style={statsWrap}>
          <div style={statCard}>
            <div style={statLabel}>Entries shown</div>
            <div style={statValue}>{entries.length}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Open items</div>
            <div style={statValue}>{unresolvedCount}</div>
          </div>
        </div>
      </div>

      {message ? <div style={successStyle}>{message}</div> : null}
      {error ? <div style={errorStyle}>{error}</div> : null}

      <div style={pageGrid}>
        <form onSubmit={onSubmit} style={panelStyle}>
          <div style={panelTitleRow}>
            <div style={panelTitle}>{formHeading}</div>
            {editingId ? (
              <button type="button" onClick={resetForm} style={secondaryButton}>
                Cancel edit
              </button>
            ) : null}
          </div>

          <div style={gridStyle}>
            <Field label="Date">
              <input type="date" value={form.log_date} onChange={(e) => updateForm("log_date", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Time">
              <input type="time" value={form.log_time} onChange={(e) => updateForm("log_time", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Type">
              <select value={form.log_type} onChange={(e) => updateForm("log_type", e.target.value)} style={inputStyle}>
                {LOG_TYPES.map((type) => (
                  <option key={type} value={type}>{logTypeLabel(type)}</option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input type="text" value={form.title} onChange={(e) => updateForm("title", e.target.value)} placeholder="Short title" style={inputStyle} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} rows={6} style={textareaStyle} placeholder="What happened, what was fixed, what still needs doing..." />
          </Field>

          <div style={panelSubtitle}>Link this entry</div>
          <div style={gridStyle}>
            <Field label="Job">
              <select value={form.linked_job_id} onChange={(e) => updateForm("linked_job_id", e.target.value)} style={inputStyle}>
                <option value="">Not linked</option>
                {lookups.jobs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Transport job">
              <select value={form.linked_transport_job_id} onChange={(e) => updateForm("linked_transport_job_id", e.target.value)} style={inputStyle}>
                <option value="">Not linked</option>
                {lookups.transport_jobs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Operator / staff">
              <select value={form.linked_operator_id} onChange={(e) => updateForm("linked_operator_id", e.target.value)} style={inputStyle}>
                <option value="">Not linked</option>
                {lookups.operators.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Vehicle">
              <select value={form.linked_vehicle_id} onChange={(e) => updateForm("linked_vehicle_id", e.target.value)} style={inputStyle}>
                <option value="">Not linked</option>
                {lookups.vehicles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Crane">
              <select value={form.linked_crane_id} onChange={(e) => updateForm("linked_crane_id", e.target.value)} style={inputStyle}>
                <option value="">Not linked</option>
                {lookups.cranes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Equipment">
              <select value={form.linked_equipment_id} onChange={(e) => updateForm("linked_equipment_id", e.target.value)} style={inputStyle}>
                <option value="">Not linked</option>
                {lookups.equipment.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </Field>
          </div>

          <label style={checkboxRow}>
            <input type="checkbox" checked={form.resolved} onChange={(e) => updateForm("resolved", e.target.checked)} />
            <span>Mark resolved</span>
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={saving} style={primaryButton}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Add log entry"}
            </button>
            {!editingId ? (
              <button type="button" onClick={resetForm} style={secondaryButton}>
                Reset
              </button>
            ) : null}
          </div>
        </form>

        <div style={panelStyle}>
          <div style={panelTitle}>Filter entries</div>
          <div style={gridStyle}>
            <Field label="From">
              <input type="date" value={filters.from} onChange={(e) => setFilters((current) => ({ ...current, from: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="To">
              <input type="date" value={filters.to} onChange={(e) => setFilters((current) => ({ ...current, to: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Type">
              <select value={filters.log_type} onChange={(e) => setFilters((current) => ({ ...current, log_type: e.target.value }))} style={inputStyle}>
                <option value="all">All types</option>
                {LOG_TYPES.map((type) => <option key={type} value={type}>{logTypeLabel(type)}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={filters.resolved} onChange={(e) => setFilters((current) => ({ ...current, resolved: e.target.value }))} style={inputStyle}>
                <option value="open">Open only</option>
                <option value="resolved">Resolved only</option>
                <option value="all">All entries</option>
              </select>
            </Field>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={secondaryButton} onClick={() => setFilters({ from: addDaysIso(todayIso(), -7), to: todayIso(), log_type: "all", resolved: "open" })}>
              Last 7 days
            </button>
            <button type="button" style={secondaryButton} onClick={() => setFilters({ from: addDaysIso(todayIso(), -30), to: todayIso(), log_type: "all", resolved: "all" })}>
              Last 30 days
            </button>
          </div>

          <div style={panelTitle}>Entries</div>
          {loading ? <div style={helperText}>Loading daily log…</div> : null}
          {!loading && entries.length === 0 ? <div style={helperText}>No entries found for the current filter.</div> : null}

          <div style={{ display: "grid", gap: 12 }}>
            {entries.map((entry) => {
              const related = relatedSummary(entry);
              const statusPill = entry.resolved ? pillResolved : pillOpen;

              return (
                <div key={entry.id} style={entryCard}>
                  <div style={entryHeader}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <div style={pillType}>{logTypeLabel(entry.log_type)}</div>
                        <div style={statusPill}>{entry.resolved ? "Resolved" : "Open"}</div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>
                        {entry.title?.trim() || "Untitled entry"}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, opacity: 0.78 }}>
                        {compactDate(entry.log_date)}{entry.log_time ? ` • ${compactTime(entry.log_time)}` : ""}
                        {entry.created_by_name ? ` • ${entry.created_by_name}` : ""}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button type="button" onClick={() => onToggleResolved(entry)} style={secondaryButton}>
                        {entry.resolved ? "Reopen" : "Resolve"}
                      </button>
                      <button type="button" onClick={() => populateFromEntry(entry)} style={secondaryButton}>
                        Edit
                      </button>
                      <button type="button" onClick={() => onDelete(entry.id)} style={dangerButton}>
                        Delete
                      </button>
                    </div>
                  </div>

                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{entry.notes}</div>

                  {related.length > 0 ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {related.map((line, index) => (
                        <div key={`${entry.id}-rel-${index}`} style={relatedPill}>{line}</div>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Updated {formatDateTime(entry.updated_at ?? entry.created_at)}
                    {entry.resolved_at ? ` • Resolved ${formatDateTime(entry.resolved_at)}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800 }}>{label}</span>
      {children}
    </label>
  );
}

const heroWrap: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const statsWrap: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const statCard: React.CSSProperties = {
  minWidth: 150,
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.18)",
  border: "1px solid rgba(255,255,255,0.40)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const statLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const statValue: React.CSSProperties = {
  marginTop: 8,
  fontSize: 28,
  fontWeight: 1000,
};

const pageGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
  gap: 18,
};

const panelStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.18)",
  border: "1px solid rgba(255,255,255,0.40)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const panelTitleRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const panelTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 1000,
};

const panelSubtitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  marginTop: 2,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  color: "#111",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 140,
  resize: "vertical",
};

const primaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const dangerButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(180,0,0,0.18)",
  background: "rgba(180,0,0,0.10)",
  color: "#8b0000",
  fontWeight: 800,
  cursor: "pointer",
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  fontWeight: 700,
};

const helperText: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.78,
};

const successStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,160,80,0.14)",
  border: "1px solid rgba(0,160,80,0.18)",
  color: "#0b6b34",
  fontWeight: 700,
};

const errorStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.18)",
  color: "#8b0000",
  fontWeight: 700,
};

const entryCard: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.65)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const entryHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const pillType: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  color: "#111",
  fontSize: 11,
  fontWeight: 800,
};

const pillOpen: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(255,140,0,0.14)",
  color: "#8a5609",
  fontSize: 11,
  fontWeight: 900,
};

const pillResolved: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(0,160,80,0.14)",
  color: "#0b6b34",
  fontSize: 11,
  fontWeight: 900,
};

const relatedPill: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 12,
  fontWeight: 700,
};
