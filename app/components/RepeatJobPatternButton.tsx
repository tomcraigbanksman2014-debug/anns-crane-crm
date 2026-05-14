"use client";

import { useMemo, useState } from "react";

type JobType = "crane" | "transport";

type WeekdayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

type WeekdayRow = {
  key: WeekdayKey;
  label: string;
  shortLabel: string;
  enabled: boolean;
  rate: string;
};

const WEEKDAYS: Array<{ key: WeekdayKey; label: string; shortLabel: string; index: number }> = [
  { key: "monday", label: "Monday", shortLabel: "Mon", index: 0 },
  { key: "tuesday", label: "Tuesday", shortLabel: "Tue", index: 1 },
  { key: "wednesday", label: "Wednesday", shortLabel: "Wed", index: 2 },
  { key: "thursday", label: "Thursday", shortLabel: "Thu", index: 3 },
  { key: "friday", label: "Friday", shortLabel: "Fri", index: 4 },
  { key: "saturday", label: "Saturday", shortLabel: "Sat", index: 5 },
  { key: "sunday", label: "Sunday", shortLabel: "Sun", index: 6 },
];

function parseDateOnly(value: string | null | undefined) {
  const raw = String(value ?? "").slice(0, 10);
  const parts = raw.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function formatDateOnly(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function weekdayIndex(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function moneyText(value: number | string | null | undefined) {
  return `£${money(value).toFixed(2)}`;
}

function displayDate(value: string) {
  const date = parseDateOnly(value);
  if (!date) return value;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function defaultRows(defaultStartDate?: string | null, defaultEndDate?: string | null, defaultRate?: number | null): WeekdayRow[] {
  const start = parseDateOnly(defaultStartDate);
  const end = parseDateOnly(defaultEndDate ?? defaultStartDate);
  const startIndex = start ? weekdayIndex(start) : 0;
  const endIndex = end ? weekdayIndex(end) : 4;
  const baseRate = money(defaultRate);

  return WEEKDAYS.map((day) => {
    let enabled = day.index >= 0 && day.index <= 4;

    if (start && end) {
      if (start.getTime() <= end.getTime()) {
        const activeDates = new Set<string>();
        let cursor = new Date(start.getTime());
        while (cursor.getTime() <= end.getTime()) {
          activeDates.add(String(weekdayIndex(cursor)));
          cursor = addDays(cursor, 1);
        }
        enabled = activeDates.has(String(day.index));
      } else {
        enabled = day.index >= startIndex && day.index <= endIndex;
      }
    }

    return {
      key: day.key,
      label: day.label,
      shortLabel: day.shortLabel,
      enabled,
      rate: baseRate > 0 ? baseRate.toFixed(2) : "",
    };
  });
}

export default function RepeatJobPatternButton({
  jobId,
  jobType,
  defaultStartDate,
  defaultEndDate,
  defaultRate,
}: {
  jobId: string;
  jobType: JobType;
  defaultStartDate?: string | null;
  defaultEndDate?: string | null;
  defaultRate?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState("6");
  const [repeatEveryWeeks, setRepeatEveryWeeks] = useState("1");
  const [mode, setMode] = useState<"keep_source_as_week_1" | "create_all_from_source_date">("keep_source_as_week_1");
  const [rows, setRows] = useState<WeekdayRow[]>(() => defaultRows(defaultStartDate, defaultEndDate, defaultRate));

  const activeRows = rows.filter((row) => row.enabled);
  const weeklyTotal = activeRows.reduce((sum, row) => sum + money(row.rate), 0);

  const preview = useMemo(() => {
    const sourceStart = parseDateOnly(defaultStartDate) ?? new Date();
    const active = rows
      .map((row) => ({ ...row, index: WEEKDAYS.find((day) => day.key === row.key)?.index ?? 0 }))
      .filter((row) => row.enabled)
      .sort((a, b) => a.index - b.index);

    if (active.length === 0) return [];

    const firstIndex = active[0].index;
    const anchor = addDays(sourceStart, firstIndex - weekdayIndex(sourceStart));
    const count = Math.max(1, Math.min(52, Math.floor(Number(repeatWeeks) || 1)));
    const every = Math.max(1, Math.min(12, Math.floor(Number(repeatEveryWeeks) || 1)));

    return Array.from({ length: count }).map((_, weekIndex) => {
      const weekOffset = weekIndex * every * 7;
      const days = active.map((row) => ({
        key: row.key,
        label: row.shortLabel,
        date: formatDateOnly(addDays(anchor, row.index - firstIndex + weekOffset)),
        rate: money(row.rate),
      }));
      return {
        weekNumber: weekIndex + 1,
        start: days[0]?.date ?? "",
        end: days[days.length - 1]?.date ?? "",
        days,
        total: days.reduce((sum, day) => sum + day.rate, 0),
      };
    });
  }, [defaultStartDate, repeatEveryWeeks, repeatWeeks, rows]);

  function updateRow(key: WeekdayKey, patch: Partial<WeekdayRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function copyRateToSelected(sourceKey: WeekdayKey) {
    const source = rows.find((row) => row.key === sourceKey);
    if (!source) return;
    setRows((current) => current.map((row) => (row.enabled ? { ...row, rate: source.rate } : row)));
  }

  async function createPattern() {
    if (activeRows.length === 0) {
      alert("Choose at least one day for the weekly pattern.");
      return;
    }

    if (weeklyTotal <= 0) {
      alert("Add at least one daily rate before creating the repeat pattern.");
      return;
    }

    setSaving(true);

    try {
      const endpoint = jobType === "transport" ? "/api/transport-jobs/repeat-pattern" : "/api/jobs/repeat-pattern";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          repeat_weeks: Number(repeatWeeks),
          repeat_every_weeks: Number(repeatEveryWeeks),
          mode,
          weekdays: rows.map((row) => ({
            key: row.key,
            enabled: row.enabled,
            rate: money(row.rate),
          })),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || "Could not create repeat pattern.");
        return;
      }

      const label = data?.created_count === 1 ? "1 repeated job created" : `${data?.created_count ?? 0} repeated jobs created`;
      const basePath = jobType === "transport" ? "/transport-jobs" : "/jobs";
      window.location.href = `${basePath}/${jobId}?success=${encodeURIComponent(`${label}. Daily rates saved for invoicing by visit/week.`)}`;
    } catch {
      alert("Could not create repeat pattern.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={buttonStyle}>
        Repeat pattern
      </button>

      {open ? (
        <div style={overlayStyle} role="dialog" aria-modal="true">
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22 }}>Create weekly repeat pattern</h2>
                <p style={{ margin: "6px 0 0", color: "#5f6b7a", lineHeight: 1.45 }}>
                  Use this for jobs like Monday–Friday every week for 6 weeks with different daily rates.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={closeButtonStyle} aria-label="Close repeat pattern">
                ×
              </button>
            </div>

            <div style={panelStyle}>
              <div style={fieldGridStyle}>
                <label style={labelStyle}>
                  Repeat every
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={repeatEveryWeeks}
                      onChange={(event) => setRepeatEveryWeeks(event.target.value)}
                      style={{ ...inputStyle, maxWidth: 90 }}
                    />
                    <span style={{ fontWeight: 800 }}>week(s)</span>
                  </div>
                </label>

                <label style={labelStyle}>
                  Pattern duration
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="number"
                      min="1"
                      max="52"
                      value={repeatWeeks}
                      onChange={(event) => setRepeatWeeks(event.target.value)}
                      style={{ ...inputStyle, maxWidth: 90 }}
                    />
                    <span style={{ fontWeight: 800 }}>week(s)</span>
                  </div>
                </label>
              </div>

              <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                <label style={radioRowStyle}>
                  <input
                    type="radio"
                    checked={mode === "keep_source_as_week_1"}
                    onChange={() => setMode("keep_source_as_week_1")}
                  />
                  <span>
                    Keep this job as week 1 and create the remaining weeks. This avoids duplicating the week already loaded.
                  </span>
                </label>
                <label style={radioRowStyle}>
                  <input
                    type="radio"
                    checked={mode === "create_all_from_source_date"}
                    onChange={() => setMode("create_all_from_source_date")}
                  />
                  <span>Create all weeks as new jobs starting from this job’s start date.</span>
                </label>
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Working days and rates</div>
              <div style={daysGridStyle}>
                {rows.map((row) => (
                  <div key={row.key} style={dayCardStyle}>
                    <label style={{ ...checkboxRowStyle, fontWeight: 900 }}>
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(event) => updateRow(row.key, { enabled: event.target.checked })}
                      />
                      {row.label}
                    </label>
                    <label style={labelStyle}>
                      Daily rate
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.rate}
                        onChange={(event) => updateRow(row.key, { rate: event.target.value })}
                        disabled={!row.enabled}
                        style={inputStyle}
                      />
                    </label>
                    <button type="button" onClick={() => copyRateToSelected(row.key)} style={smallButtonStyle} disabled={!row.enabled}>
                      Copy to selected days
                    </button>
                  </div>
                ))}
              </div>
              <div style={totalStyle}>Weekly total: {moneyText(weeklyTotal)}</div>
            </div>

            <div style={panelStyle}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Preview</div>
              <div style={previewWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Week</th>
                      <th style={thStyle}>Date range</th>
                      <th style={thStyle}>Daily rates</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((week) => (
                      <tr key={week.weekNumber}>
                        <td style={tdStyle}>Week {week.weekNumber}</td>
                        <td style={tdStyle}>{displayDate(week.start)} → {displayDate(week.end)}</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {week.days.map((day) => (
                              <span key={`${week.weekNumber}-${day.key}`} style={pillStyle}>
                                {day.label} {moneyText(day.rate)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{moneyText(week.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setOpen(false)} style={secondaryButtonStyle} disabled={saving}>
                Cancel
              </button>
              <button type="button" onClick={createPattern} style={primaryButtonStyle} disabled={saving}>
                {saving ? "Creating…" : "Create repeated jobs"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#0f766e",
  color: "#fff",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(15,23,42,0.55)",
  padding: 16,
  overflow: "auto",
};

const modalStyle: React.CSSProperties = {
  width: "min(1120px, 100%)",
  margin: "24px auto",
  background: "#fff",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 24px 70px rgba(15,23,42,0.28)",
  display: "grid",
  gap: 14,
};

const closeButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#f1f5f9",
  width: 36,
  height: 36,
  borderRadius: 999,
  fontSize: 24,
  lineHeight: "30px",
  cursor: "pointer",
  fontWeight: 900,
};

const panelStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  background: "#f8fafc",
};

const fieldGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const daysGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const dayCardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 800,
  color: "#334155",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "9px 10px",
  fontSize: 14,
  background: "#fff",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const radioRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  fontWeight: 750,
  lineHeight: 1.4,
};

const smallButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 10,
  padding: "8px 9px",
  fontWeight: 850,
  cursor: "pointer",
};

const totalStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  background: "#ecfeff",
  border: "1px solid #99f6e4",
  borderRadius: 12,
  fontWeight: 950,
};

const previewWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 720,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #e2e8f0",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#64748b",
};

const tdStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  border: "1px solid #c7d2fe",
  fontWeight: 850,
  fontSize: 12,
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#0f766e",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 950,
  cursor: "pointer",
};
