"use client";

import { useEffect, useMemo, useState } from "react";

type PlannerDay = {
  date: string;
  label: string;
  is_bank_holiday?: boolean;
  bank_holiday_label?: string | null;
};

type AvailabilityEntry = {
  id: string;
  operator_id: string;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  notes?: string | null;
  blocks_assignment?: boolean | null;
  working_day_count?: number | null;
};

type AssignedJob = {
  id: string;
  job_number?: number | string | null;
  site_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  job_date?: string | null;
  status?: string | null;
};

type AssignedTransportJob = {
  id: string;
  transport_number?: string | null;
  collection_address?: string | null;
  delivery_address?: string | null;
  transport_date?: string | null;
  delivery_date?: string | null;
  status?: string | null;
};

type OperatorRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  entries: AvailabilityEntry[];
  assigned_jobs: AssignedJob[];
  assigned_transport_jobs: AssignedTransportJob[];
  holiday_working_days?: number | null;
};

type BoardResponse = {
  week_start: string;
  week_end: string;
  days: PlannerDay[];
  bank_holidays?: Array<{ date: string; label: string }>;
  operators: OperatorRow[];
};

type FormState = {
  id: string | null;
  operator_id: string;
  status: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  notes: string;
  blocks_assignment: boolean;
};

function isoDateLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mondayOf(base: Date) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function clean(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function formatDateRange(startDate: string | null | undefined, endDate: string | null | undefined) {
  const start = clean(startDate);
  const end = clean(endDate) ?? start;
  if (!start && !end) return "No dates";
  if (start && end && start === end) return start;
  return `${start ?? "—"} → ${end ?? "—"}`;
}

function entryMatchesDay(entry: AvailabilityEntry, dayIso: string) {
  const start = clean(entry.start_date);
  const end = clean(entry.end_date) ?? start;
  if (!start || !end) return false;
  return start <= dayIso && end >= dayIso;
}

function countWorkingDaysInclusive(startDate: string | null | undefined, endDate: string | null | undefined) {
  const startText = clean(startDate);
  const endText = clean(endDate) ?? startText;
  if (!startText || !endText) return 0;

  const start = new Date(`${startText}T00:00:00`);
  const end = new Date(`${endText}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let total = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

function holidayWorkingDays(entry: AvailabilityEntry) {
  const saved = Number(entry.working_day_count ?? 0);
  if (saved > 0) return saved;
  return countWorkingDaysInclusive(entry.start_date, entry.end_date);
}

function statusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "Unavailable";
  if (raw === "day_off") return "Day off";
  if (raw === "available") return "Available";
  if (raw === "holiday") return "Holiday";
  if (raw === "training") return "Training";
  if (raw === "sick") return "Sick";
  if (raw === "unavailable") return "Unavailable";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusStyle(status: string | null | undefined): React.CSSProperties {
  const raw = String(status ?? "").trim().toLowerCase();
  if (raw === "holiday") {
    return { background: "rgba(255,0,0,0.10)", color: "#8b0000", border: "1px solid rgba(180,0,0,0.18)" };
  }
  if (raw === "training") {
    return { background: "rgba(0,120,255,0.12)", color: "#0b57d0", border: "1px solid rgba(0,120,255,0.18)" };
  }
  if (raw === "sick") {
    return { background: "rgba(128,0,128,0.12)", color: "#6f2c91", border: "1px solid rgba(128,0,128,0.18)" };
  }
  if (raw === "day_off") {
    return { background: "rgba(90,90,90,0.10)", color: "#333", border: "1px solid rgba(90,90,90,0.18)" };
  }
  if (raw === "available") {
    return { background: "rgba(0,180,120,0.12)", color: "#0b7a4b", border: "1px solid rgba(0,180,120,0.18)" };
  }
  return { background: "rgba(255,170,0,0.14)", color: "#8a5200", border: "1px solid rgba(255,170,0,0.22)" };
}

function emptyForm(operators: OperatorRow[], weekStart: string): FormState {
  return {
    id: null,
    operator_id: operators[0]?.id ?? "",
    status: "holiday",
    start_date: weekStart,
    end_date: weekStart,
    start_time: "",
    end_time: "",
    notes: "",
    blocks_assignment: true,
  };
}

function assignmentSummary(operator: OperatorRow, dayIso: string) {
  const craneJobs = (operator.assigned_jobs ?? []).filter((job) => {
    const start = clean(job.start_date ?? job.job_date);
    const end = clean(job.end_date ?? job.start_date ?? job.job_date) ?? start;
    return !!start && !!end && start <= dayIso && end >= dayIso;
  });
  const transportJobs = (operator.assigned_transport_jobs ?? []).filter((job) => {
    const start = clean(job.transport_date);
    const end = clean(job.delivery_date ?? job.transport_date) ?? start;
    return !!start && !!end && start <= dayIso && end >= dayIso;
  });
  return { craneJobs, transportJobs };
}

export default function StaffPlannerBoard() {
  const [weekStart, setWeekStart] = useState<string>(() => isoDateLocal(mondayOf(new Date())));
  const [data, setData] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<FormState>({
    id: null,
    operator_id: "",
    status: "holiday",
    start_date: weekStart,
    end_date: weekStart,
    start_time: "",
    end_time: "",
    notes: "",
    blocks_assignment: true,
  });

  async function loadBoard(targetWeekStart: string) {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/staff-planner/board?date=${encodeURIComponent(targetWeekStart)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not load staff planner.");
      setData(json);
      setWeekStart(json.week_start ?? targetWeekStart);
      setForm((prev) => {
        if (prev.operator_id) return prev;
        return emptyForm(json.operators ?? [], json.week_start ?? targetWeekStart);
      });
    } catch (e: any) {
      setLoadError(e?.message || "Could not load staff planner.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBoard(weekStart);
  }, [weekStart]);

  const days = data?.days ?? [];
  const operators = data?.operators ?? [];

  const assignmentCounts = useMemo(() => {
    return operators.map((operator) => ({
      operatorId: operator.id,
      crane: operator.assigned_jobs?.length ?? 0,
      transport: operator.assigned_transport_jobs?.length ?? 0,
    }));
  }, [operators]);

  const weeklyHolidayWorkingDays = useMemo(() => {
    return operators.reduce((sum, operator) => {
      const fromApi = Number(operator.holiday_working_days ?? 0);
      if (fromApi > 0) return sum + fromApi;

      return (
        sum +
        (operator.entries ?? [])
          .filter((entry) => String(entry.status ?? "").toLowerCase() === "holiday")
          .reduce((entrySum, entry) => entrySum + holidayWorkingDays(entry), 0)
      );
    }, 0);
  }, [operators]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm(emptyForm(operators, weekStart));
    setFormError("");
  }

  function beginEdit(entry: AvailabilityEntry) {
    setForm({
      id: entry.id,
      operator_id: entry.operator_id,
      status: String(entry.status ?? "holiday"),
      start_date: entry.start_date,
      end_date: entry.end_date,
      start_time: String(entry.start_time ?? ""),
      end_time: String(entry.end_time ?? ""),
      notes: String(entry.notes ?? ""),
      blocks_assignment: Boolean(entry.blocks_assignment),
    });
    setFormError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEntry(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    setMessage("");

    try {
      const payload = {
        operator_id: form.operator_id,
        status: form.status,
        start_date: form.start_date,
        end_date: form.end_date,
        start_time: clean(form.start_time),
        end_time: clean(form.end_time),
        notes: clean(form.notes),
        blocks_assignment: form.blocks_assignment,
      };

      const res = await fetch(
        form.id ? `/api/staff-planner/availability/${form.id}` : "/api/staff-planner/availability",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not save availability entry.");
      setMessage(form.id ? "Availability updated." : "Availability added.");
      await loadBoard(weekStart);
      resetForm();
    } catch (e: any) {
      setFormError(e?.message || "Could not save availability entry.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(entryId: string) {
    if (!window.confirm("Remove this staff availability entry?")) return;
    setFormError("");
    setMessage("");
    try {
      const res = await fetch(`/api/staff-planner/availability/${entryId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not delete availability entry.");
      setMessage("Availability entry removed.");
      await loadBoard(weekStart);
      if (form.id === entryId) resetForm();
    } catch (e: any) {
      setFormError(e?.message || "Could not delete availability entry.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={toolbarStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: 28 }}>Staff Planner</h2>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Weekly staff availability for holiday, training, sickness, days off and other non-working periods.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setWeekStart(isoDateLocal(addDays(new Date(`${weekStart}T00:00:00`), -7)))} style={secondaryBtn}>← Previous 7 days</button>
          <button type="button" onClick={() => setWeekStart(isoDateLocal(mondayOf(new Date())))} style={secondaryBtn}>This week</button>
          <button type="button" onClick={() => setWeekStart(isoDateLocal(addDays(new Date(`${weekStart}T00:00:00`), 7)))} style={secondaryBtn}>Next 7 days →</button>
        </div>
      </div>

      <form onSubmit={saveEntry} style={sectionCard}>
        <div style={sectionTitle}>Add / edit staff availability</div>
        <div style={formGrid}>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Staff member</span>
            <select value={form.operator_id} onChange={(e) => setField("operator_id", e.target.value)} style={inputStyle}>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>{operator.full_name || "Unnamed operator"}</option>
              ))}
            </select>
          </label>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Status</span>
            <select
              value={form.status}
              onChange={(e) => {
                const nextStatus = e.target.value;
                setField("status", nextStatus);
                setField("blocks_assignment", nextStatus === "available" ? false : true);
              }}
              style={inputStyle}
            >
              <option value="available">Available</option>
              <option value="holiday">Holiday</option>
              <option value="training">Training</option>
              <option value="sick">Sick</option>
              <option value="day_off">Day off</option>
              <option value="unavailable">Unavailable</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Start date</span>
            <input type="date" value={form.start_date} onChange={(e) => setField("start_date", e.target.value)} style={inputStyle} />
          </label>
          <label style={fieldWrap}>
            <span style={fieldLabel}>End date</span>
            <input type="date" value={form.end_date} onChange={(e) => setField("end_date", e.target.value)} style={inputStyle} />
          </label>
          <label style={fieldWrap}>
            <span style={fieldLabel}>Start time</span>
            <input type="time" value={form.start_time} onChange={(e) => setField("start_time", e.target.value)} style={inputStyle} />
          </label>
          <label style={fieldWrap}>
            <span style={fieldLabel}>End time</span>
            <input type="time" value={form.end_time} onChange={(e) => setField("end_time", e.target.value)} style={inputStyle} />
          </label>
          <label style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
            <span style={fieldLabel}>Notes</span>
            <textarea rows={3} value={form.notes} onChange={(e) => setField("notes", e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} />
          </label>
          <label style={{ ...fieldWrap, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={form.blocks_assignment} onChange={(e) => setField("blocks_assignment", e.target.checked)} />
            <span style={fieldLabel}>Block assignment while this entry is active</span>
          </label>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button type="submit" style={primaryBtn} disabled={saving}>{saving ? "Saving..." : form.id ? "Update entry" : "Add entry"}</button>
          <button type="button" style={secondaryBtn} onClick={resetForm}>Clear</button>
        </div>
        {message ? <div style={successBox}>{message}</div> : null}
        {formError ? <div style={errorBox}>{formError}</div> : null}
      </form>

      {loading ? <div style={infoBox}>Loading staff planner…</div> : null}
      {loadError ? <div style={errorBox}>{loadError}</div> : null}

      {!loading && !loadError ? (
        <>
          <div style={legendWrap}>
            {["available", "holiday", "training", "sick", "day_off", "unavailable", "other"].map((status) => (
              <div key={status} style={{ ...legendItem, ...statusStyle(status) }}>{statusLabel(status)}</div>
            ))}
          </div>

          <div style={sectionCard}>
            <div style={summaryInline}>
              <strong>Holiday working days this week:</strong> {weeklyHolidayWorkingDays}
              <span style={{ opacity: 0.72 }}>Weekends are excluded from holiday totals.</span>
            </div>
          </div>

          <div style={sectionCard}>
            <div style={sectionTitle}>Weekly board</div>
            <div style={desktopGrid(days.length)}>
              <div style={headCell}>Staff / Week</div>
              {days.map((day) => (
                <div key={day.date} style={{ ...headCell, ...(day.is_bank_holiday ? holidayHeaderCell : null) }}>
                  <div>{day.label}</div>
                  {day.is_bank_holiday ? <div style={{ marginTop: 2, fontSize: 11, opacity: 0.8 }}>{day.bank_holiday_label ?? "Bank holiday"}</div> : null}
                </div>
              ))}

              {operators.map((operator) => {
                const countRow = assignmentCounts.find((row) => row.operatorId === operator.id);
                return [
                  <div key={`${operator.id}-header`} style={rowHeaderCell}>
                    <div style={{ fontWeight: 900 }}>{operator.full_name || "Unnamed operator"}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>{operator.status || "—"}</div>
                    <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 12 }}>
                      <div>Crane jobs: {countRow?.crane ?? 0}</div>
                      <div>Transport jobs: {countRow?.transport ?? 0}</div>
                    </div>
                  </div>,
                  ...days.map((day) => {
                    const entries = operator.entries.filter((entry) => entryMatchesDay(entry, day.date));
                    const assignmentInfo = assignmentSummary(operator, day.date);
                    return (
                      <div key={`${operator.id}-${day.date}`} style={{ ...dayCell, ...(day.is_bank_holiday ? holidayCell : null) }}>
                        {entries.length > 0 ? entries.map((entry) => (
                          <div key={entry.id} style={{ ...entryCard, ...statusStyle(entry.status) }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                              <div>
                                <div style={{ fontWeight: 900 }}>{statusLabel(entry.status)}</div>
                                <div style={{ marginTop: 4, fontSize: 12 }}>{formatDateRange(entry.start_date, entry.end_date)}</div>
                                {String(entry.status ?? "").toLowerCase() === "holiday" ? (
                                  <div style={{ marginTop: 2, fontSize: 12, fontWeight: 800 }}>
                                    {holidayWorkingDays(entry)} working day{holidayWorkingDays(entry) === 1 ? "" : "s"}
                                  </div>
                                ) : null}
                                {clean(entry.start_time) || clean(entry.end_time) ? (
                                  <div style={{ marginTop: 2, fontSize: 12 }}>{clean(entry.start_time) ?? "—"} → {clean(entry.end_time) ?? "—"}</div>
                                ) : null}
                                {clean(entry.notes) ? <div style={{ marginTop: 4, fontSize: 12 }}>{entry.notes}</div> : null}
                                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800 }}>
                                  {entry.blocks_assignment ? "Blocks assignment" : "Does not block assignment"}
                                </div>
                              </div>
                              <div style={{ display: "grid", gap: 6 }}>
                                <button type="button" style={tinyBtn} onClick={() => beginEdit(entry)}>Edit</button>
                                <button type="button" style={tinyBtnDanger} onClick={() => deleteEntry(entry.id)}>Remove</button>
                              </div>
                            </div>
                          </div>
                        )) : (
                          <div style={availableCard}>Available</div>
                        )}

                        {assignmentInfo.craneJobs.length > 0 ? (
                          <div style={assignmentBox}>
                            {assignmentInfo.craneJobs.map((job) => (
                              <div key={job.id}>Crane job #{job.job_number ?? job.id}{clean(job.site_name) ? ` • ${job.site_name}` : ""}</div>
                            ))}
                          </div>
                        ) : null}

                        {assignmentInfo.transportJobs.length > 0 ? (
                          <div style={assignmentBox}>
                            {assignmentInfo.transportJobs.map((job) => (
                              <div key={job.id}>Transport {job.transport_number || job.id}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  }),
                ];
              }).flat()}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const summaryInline: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
  fontSize: 13,
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  border: "1px solid rgba(255,255,255,0.40)",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  fontWeight: 1000,
  fontSize: 20,
  marginBottom: 12,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  font: "inherit",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
};

const infoBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.18)",
  color: "#8b0000",
  fontWeight: 700,
};

const successBox: React.CSSProperties = {
  marginTop: 12,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,160,80,0.14)",
  border: "1px solid rgba(0,160,80,0.18)",
  color: "#0b6b34",
  fontWeight: 700,
};

const legendWrap: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const legendItem: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
};

function desktopGrid(days: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `220px repeat(${days}, minmax(180px, 1fr))`,
    gap: 8,
    alignItems: "stretch",
  };
}

const headCell: React.CSSProperties = {
  padding: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
  textAlign: "center",
};

const holidayHeaderCell: React.CSSProperties = {
  background: "rgba(255,170,0,0.16)",
  border: "1px solid rgba(255,170,0,0.24)",
};

const holidayCell: React.CSSProperties = {
  background: "rgba(255,170,0,0.08)",
  border: "1px solid rgba(255,170,0,0.18)",
};

const rowHeaderCell: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  alignSelf: "stretch",
};

const dayCell: React.CSSProperties = {
  minHeight: 120,
  padding: 8,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "grid",
  gap: 8,
  alignContent: "start",
};

const entryCard: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  display: "grid",
  gap: 4,
};

const availableCard: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(0,180,120,0.08)",
  border: "1px solid rgba(0,180,120,0.18)",
  color: "#0b7a4b",
  fontWeight: 900,
  fontSize: 12,
};

const tinyBtn: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

const tinyBtnDanger: React.CSSProperties = {
  ...tinyBtn,
  border: "1px solid rgba(180,0,0,0.16)",
  background: "rgba(180,0,0,0.06)",
  color: "#8b0000",
};

const assignmentBox: React.CSSProperties = {
  padding: 8,
  borderRadius: 8,
  background: "rgba(0,0,0,0.04)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 11,
  display: "grid",
  gap: 3,
};
