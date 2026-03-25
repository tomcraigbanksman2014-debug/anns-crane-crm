"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PlannerDay = {
  date: string;
  label: string;
  is_bank_holiday?: boolean;
  bank_holiday_label?: string | null;
};

type PlannerItem = {
  id: string;
  allocation_id?: string | null;
  job_id: string;
  job_number?: number | string | null;
  job_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  operator_id?: string | null;
  equipment_id?: string | null;
  source_type?: string | null;
  item_name?: string | null;
  clients?: any;
  operators?: any;
  equipment?: any;
  agreed_sell_rate?: number | null;
  supplier_cost?: number | null;
  price_mode?: string | null;
  price_per_day?: number | null;
  job_price?: number | null;
  exclude_weekends?: boolean;
  working_dates?: string[];
  billable_days?: number | null;
  notes?: string | null;
  planner_group?: string | null;
};

type PlannerPerson = {
  id: string;
  full_name?: string | null;
};

type PlannerEquipment = {
  id: string;
  name?: string | null;
  asset_number?: string | null;
};

type PlannerResponse = {
  week_start: string;
  week_end: string;
  days: PlannerDay[];
  bank_holidays?: Array<{ date: string; label: string }>;
  items: PlannerItem[];
  operators: PlannerPerson[];
  equipment: PlannerEquipment[];
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function mondayOf(base: Date) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isoDateLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function itemMatchesDay(item: PlannerItem, dayIso: string) {
  const workingDates = Array.isArray(item.working_dates) ? item.working_dates : [];
  if (workingDates.length > 0) {
    return workingDates.includes(dayIso);
  }

  const start = String(item.start_date ?? item.job_date ?? "").trim();
  const end = String(item.end_date ?? item.start_date ?? item.job_date ?? "").trim();
  if (!start || !end) return false;

  return start <= dayIso && end >= dayIso;
}

function getClientName(item: PlannerItem) {
  const client = first(item.clients);
  return (client as any)?.company_name ?? "No customer";
}

function getOperatorName(item: PlannerItem) {
  const operator = first(item.operators);
  return (operator as any)?.full_name ?? "Unassigned";
}

function getDisplayPrice(item: PlannerItem) {
  const agreed = Number(item.agreed_sell_rate ?? 0);
  if (agreed > 0) return agreed;
  return Number(item.job_price ?? 0);
}

function getStatusTone(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "confirmed") {
    return {
      background: "rgba(255,248,230,0.98)",
      border: "1px solid rgba(255,170,0,0.25)",
    };
  }

  if (s === "in_progress") {
    return {
      background: "rgba(232,242,255,0.98)",
      border: "1px solid rgba(0,120,255,0.25)",
    };
  }

  if (s === "draft") {
    return {
      background: "rgba(245,245,245,0.98)",
      border: "1px solid rgba(0,0,0,0.12)",
    };
  }

  if (s === "provisional") {
    return {
      background: "rgba(241,241,241,0.98)",
      border: "1px solid rgba(120,120,120,0.18)",
    };
  }

  if (s === "completed") {
    return {
      background: "rgba(232,255,244,0.98)",
      border: "1px solid rgba(0,180,120,0.25)",
    };
  }

  if (s === "late_cancelled") {
    return {
      background: "rgba(255,238,238,0.98)",
      border: "1px solid rgba(255,0,0,0.22)",
    };
  }

  return {
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(0,0,0,0.08)",
  };
}

function statusPill(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "draft") {
    return { ...pillBase, background: "rgba(120,120,120,0.14)", border: "1px solid rgba(120,120,120,0.20)" };
  }
  if (s === "provisional") {
    return { ...pillBase, background: "rgba(160,160,160,0.14)", border: "1px solid rgba(160,160,160,0.20)" };
  }
  if (s === "confirmed") {
    return { ...pillBase, background: "rgba(255,170,0,0.14)", border: "1px solid rgba(255,170,0,0.20)" };
  }
  if (s === "in_progress") {
    return { ...pillBase, background: "rgba(0,120,255,0.12)", border: "1px solid rgba(0,120,255,0.18)" };
  }
  if (s === "completed") {
    return { ...pillBase, background: "rgba(0,180,120,0.12)", border: "1px solid rgba(0,180,120,0.18)" };
  }
  if (s === "late_cancelled") {
    return { ...pillBase, background: "rgba(255,0,0,0.10)", border: "1px solid rgba(255,0,0,0.18)" };
  }

  return { ...pillBase, background: "rgba(255,255,255,0.80)", border: "1px solid rgba(0,0,0,0.10)" };
}

function formatDateRange(item: PlannerItem) {
  const start = String(item.start_date ?? item.job_date ?? "").trim();
  const end = String(item.end_date ?? item.start_date ?? item.job_date ?? "").trim();
  if (!start && !end) return "No dates";
  if (start && end && start === end) return start;
  return `${start || "—"} → ${end || "—"}`;
}

function formatWorkingDays(item: PlannerItem) {
  const dates = Array.isArray(item.working_dates) ? item.working_dates : [];
  if (dates.length === 0) return "No working days";
  if (dates.length === 1) return dates[0];
  return `${dates[0]} → ${dates[dates.length - 1]} • ${dates.length} days`;
}

function ActionMenu({ jobId, onRemoved }: { jobId: string; onRemoved: () => void }) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function removeJob() {
    const ok = window.confirm("Remove this job from the planner by marking it cancelled?");
    if (!ok) return;

    setBusy(true);
    try {
      const formData = new FormData();
      const res = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Could not remove job.");
      }

      if (detailsRef.current) detailsRef.current.open = false;
      onRemoved();
    } catch (e: any) {
      window.alert(e?.message ?? "Could not remove job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details ref={detailsRef} style={{ position: "relative" }}>
      <summary style={menuSummaryBtn}>⋯</summary>
      <div style={menuPopup}>
        <a href={`/jobs/${jobId}`} style={menuLink}>Open job</a>
        <a href={`/jobs/${jobId}/edit`} style={menuLink}>Edit job</a>
        <button type="button" onClick={removeJob} disabled={busy} style={menuDangerBtn}>
          {busy ? "Removing…" : "Remove job"}
        </button>
      </div>
    </details>
  );
}

export default function PlannerBoard() {
  const [weekStart, setWeekStart] = useState<string>(() => isoDateLocal(mondayOf(new Date())));
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PlannerResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/planner/board?date=${encodeURIComponent(weekStart)}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.error || "Could not load planner.");
        }

        if (!active) return;
        setData(json);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || "Could not load planner.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [weekStart, reloadKey]);

  const visibleDays = useMemo(() => {
    if (data?.days?.length) return data.days;

    const base = new Date(`${weekStart}T00:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      return {
        date: isoDateLocal(d),
        label: d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        }),
        is_bank_holiday: false,
        bank_holiday_label: null,
      };
    });
  }, [data, weekStart]);

  const groupedByEquipment = useMemo(() => {
    const equipmentList = data?.equipment ?? [];
    const items = data?.items ?? [];

    return equipmentList.map((equipment) => ({
      equipment,
      items: items.filter((item) => String(item.equipment_id ?? "") === equipment.id),
    }));
  }, [data]);

  const unassignedCraneItems = useMemo(() => {
    return (data?.items ?? []).filter(
      (item) => !item.equipment_id && String(item.planner_group ?? "") !== "labour_only"
    );
  }, [data]);

  const labourOnlyItems = useMemo(() => {
    return (data?.items ?? []).filter(
      (item) => !item.equipment_id && String(item.planner_group ?? "") === "labour_only"
    );
  }, [data]);

  function moveWeek(delta: number) {
    const base = new Date(`${weekStart}T00:00:00`);
    setWeekStart(isoDateLocal(addDays(base, delta * 7)));
  }

  function refreshPlanner() {
    setReloadKey((value) => value + 1);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={toolbarStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: 28 }}>Crane Planner</h2>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Week commencing {data?.week_start ?? weekStart}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="/jobs/new" style={primaryBtn}>+ Add Job</a>
          <button type="button" onClick={() => moveWeek(-1)} style={secondaryBtn}>← Previous week</button>
          <button type="button" onClick={() => setWeekStart(isoDateLocal(mondayOf(new Date())))} style={secondaryBtn}>This week</button>
          <button type="button" onClick={() => moveWeek(1)} style={secondaryBtn}>Next week →</button>
        </div>
      </div>

      {loading ? <div style={infoBox}>Loading planner…</div> : null}
      {error ? <div style={errorBox}>{error}</div> : null}

      {!loading && !error ? (
        <>
          {unassignedCraneItems.length > 0 ? (
            <section style={sectionCard}>
              <div style={sectionTitle}>Unassigned crane jobs</div>
              <div style={{ display: "grid", gap: 10 }}>
                {unassignedCraneItems.map((item) => (
                  <div key={item.id} style={{ ...jobCardStyle, ...getStatusTone(item.status) }}>
                    <div style={cardTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 1000 }}>
                          Job {item.job_number ? `#${item.job_number}` : ""}
                          {getClientName(item) ? ` • ${getClientName(item)}` : ""}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.82 }}>
                          {item.site_name ?? item.site_address ?? "No site"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontWeight: 1000 }}>{fmtMoney(getDisplayPrice(item))}</div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            {String(item.price_mode ?? "full_job") === "per_day"
                              ? `Per day ${fmtMoney(item.price_per_day ?? 0)}`
                              : "Full job"}
                          </div>
                        </div>
                        <ActionMenu jobId={item.job_id} onRemoved={refreshPlanner} />
                      </div>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.78 }}>
                      <div><strong>Date span:</strong> {formatDateRange(item)}</div>
                      <div style={{ marginTop: 4 }}><strong>Working days:</strong> {formatWorkingDays(item)}</div>
                    </div>

                    <div style={tagWrap}>
                      <div style={pillWarn}>No crane assigned</div>
                      <div style={statusPill(item.status)}>{String(item.status ?? "draft")}</div>
                      {item.exclude_weekends ? <div style={pillNeutral}>Exclude weekends</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {labourOnlyItems.length > 0 ? (
            <section style={sectionCard}>
              <div style={sectionTitle}>Labour only / no lifting asset</div>
              <div style={{ display: "grid", gap: 10 }}>
                {labourOnlyItems.map((item) => (
                  <div key={item.id} style={{ ...jobCardStyle, ...getStatusTone(item.status) }}>
                    <div style={cardTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 1000 }}>
                          Job {item.job_number ? `#${item.job_number}` : ""}
                          {getClientName(item) ? ` • ${getClientName(item)}` : ""}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.82 }}>
                          {item.site_name ?? item.site_address ?? "No site"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontWeight: 1000 }}>{fmtMoney(getDisplayPrice(item))}</div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            {String(item.price_mode ?? "full_job") === "per_day"
                              ? `Per day ${fmtMoney(item.price_per_day ?? 0)}`
                              : "Full job"}
                          </div>
                        </div>
                        <ActionMenu jobId={item.job_id} onRemoved={refreshPlanner} />
                      </div>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.78 }}>
                      <div><strong>Date span:</strong> {formatDateRange(item)}</div>
                      <div style={{ marginTop: 4 }}><strong>Working days:</strong> {formatWorkingDays(item)}</div>
                    </div>

                    <div style={tagWrap}>
                      <div style={pillLabour}>Labour only</div>
                      <div style={statusPill(item.status)}>{String(item.status ?? "draft")}</div>
                      {item.exclude_weekends ? <div style={pillNeutral}>Exclude weekends</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div style={{ display: "grid", gap: 16 }}>
            {groupedByEquipment.map(({ equipment, items }) => (
              <section key={equipment.id} style={sectionCard}>
                <div style={sectionTitleRow}>
                  <div>
                    <div style={sectionTitle}>{equipment.name ?? "Crane"}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                      {equipment.asset_number ? equipment.asset_number : "No reg"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: `240px repeat(${visibleDays.length}, minmax(180px, 1fr))`, gap: 10, alignItems: "stretch" }}>
                  <div style={headCell}>Crane / Week</div>

                  {visibleDays.map((day) => (
                    <div
                      key={day.date}
                      style={{
                        ...headCell,
                        ...(day.is_bank_holiday
                          ? {
                              background: "rgba(255,170,0,0.16)",
                              border: "1px solid rgba(255,170,0,0.24)",
                            }
                          : {}),
                      }}
                    >
                      <div>{day.label}</div>
                      <div style={{ marginTop: 4, fontSize: 11, opacity: 0.72 }}>
                        {day.is_bank_holiday ? day.bank_holiday_label ?? "Bank holiday" : "Working day"}
                      </div>
                    </div>
                  ))}

                  <div style={sideCell}>
                    <div style={{ fontWeight: 1000 }}>{equipment.name ?? "Crane"}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>{equipment.asset_number ?? ""}</div>
                  </div>

                  {visibleDays.map((day) => {
                    const dayItems = items.filter((item) => itemMatchesDay(item, day.date));

                    return (
                      <div
                        key={`${equipment.id}-${day.date}`}
                        style={{
                          ...dayCell,
                          ...(day.is_bank_holiday
                            ? {
                                background: "rgba(255,170,0,0.08)",
                                border: "1px solid rgba(255,170,0,0.18)",
                              }
                            : {}),
                        }}
                      >
                        {dayItems.length === 0 ? (
                          <div style={emptyState}>Free</div>
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {dayItems.map((item) => (
                              <div key={`${item.id}-${day.date}`} style={{ ...miniJobCard, ...getStatusTone(item.status) }}>
                                <div style={miniCardTopRow}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 1000 }}>Job {item.job_number ? `#${item.job_number}` : ""}</div>
                                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>{getClientName(item)}</div>
                                  </div>
                                  <ActionMenu jobId={item.job_id} onRemoved={refreshPlanner} />
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>{item.site_name ?? item.site_address ?? "No site"}</div>
                                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900 }}>{fmtMoney(getDisplayPrice(item))}</div>
                                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.72 }}>
                                  {String(item.price_mode ?? "full_job") === "per_day"
                                    ? `Per day ${fmtMoney(item.price_per_day ?? 0)}`
                                    : "Full job"}
                                </div>
                                <div style={{ marginTop: 6, fontSize: 11, opacity: 0.72 }}>{item.start_time ?? "—"} → {item.end_time ?? "—"}</div>
                                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.72 }}>{getOperatorName(item)}</div>
                                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  <span style={statusPill(item.status)}>{String(item.status ?? "draft")}</span>
                                  {item.exclude_weekends ? <span style={pillNeutral}>Exclude weekends</span> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
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

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.22)",
  border: "1px solid rgba(255,255,255,0.38)",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitleRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 1000,
};

const headCell: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
};

const sideCell: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const dayCell: React.CSSProperties = {
  minHeight: 120,
  padding: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.28)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const jobCardStyle: React.CSSProperties = {
  color: "#111",
  padding: 14,
  borderRadius: 14,
};

const miniJobCard: React.CSSProperties = {
  color: "#111",
  padding: 10,
  borderRadius: 10,
};

const pillBase: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  textTransform: "capitalize",
};

const pillWarn: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(255,170,0,0.16)",
  border: "1px solid rgba(255,170,0,0.22)",
};

const pillLabour: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(155,89,182,0.14)",
  border: "1px solid rgba(155,89,182,0.22)",
};

const pillNeutral: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(255,255,255,0.65)",
  border: "1px solid rgba(0,0,0,0.10)",
};

const tagWrap: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "1px solid #111",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
};

const infoBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.58)",
  border: "1px dashed rgba(0,0,0,0.10)",
  opacity: 0.82,
};

const emptyState: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.6,
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const cardTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const miniCardTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "flex-start",
};

const menuSummaryBtn: React.CSSProperties = {
  listStyle: "none",
  cursor: "pointer",
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.82)",
  display: "grid",
  placeItems: "center",
  fontSize: 18,
  lineHeight: 1,
  userSelect: "none",
};

const menuPopup: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: 36,
  minWidth: 150,
  padding: 6,
  borderRadius: 10,
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.10)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
  display: "grid",
  gap: 4,
  zIndex: 50,
};

const menuLink: React.CSSProperties = {
  display: "block",
  padding: "8px 10px",
  textDecoration: "none",
  color: "#111",
  borderRadius: 8,
  fontWeight: 700,
};

const menuDangerBtn: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  borderRadius: 8,
  border: "1px solid rgba(255,0,0,0.16)",
  background: "rgba(255,0,0,0.08)",
  color: "#b00020",
  fontWeight: 800,
  cursor: "pointer",
};
