"use client";

import { useEffect, useMemo, useState } from "react";

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

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
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

function getEquipmentName(item: PlannerItem) {
  const equipment = first(item.equipment);
  return (equipment as any)?.name ?? item.item_name ?? "Unassigned";
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
      background: "rgba(0,120,255,0.12)",
      border: "1px solid rgba(0,120,255,0.18)",
    };
  }

  if (s === "in_progress") {
    return {
      background: "rgba(255,140,0,0.16)",
      border: "1px solid rgba(255,140,0,0.20)",
    };
  }

  if (s === "completed") {
    return {
      background: "rgba(0,180,120,0.14)",
      border: "1px solid rgba(0,180,120,0.18)",
    };
  }

  if (s === "cancelled") {
    return {
      background: "rgba(255,0,0,0.10)",
      border: "1px solid rgba(255,0,0,0.18)",
    };
  }

  return {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

export default function PlannerBoard() {
  const [weekStart, setWeekStart] = useState<string>(() => isoDate(mondayOf(new Date())));
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
  }, [weekStart]);

  const visibleDays = useMemo(() => {
    if (data?.days?.length) return data.days;

    const base = new Date(`${weekStart}T00:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      return {
        date: isoDate(d),
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

    return equipmentList.map((equipment) => {
      const equipmentItems = items.filter((item) => String(item.equipment_id ?? "") === equipment.id);
      return {
        equipment,
        items: equipmentItems,
      };
    });
  }, [data]);

  const unassignedItems = useMemo(() => {
    return (data?.items ?? []).filter((item) => !item.equipment_id);
  }, [data]);

  function moveWeek(delta: number) {
    const base = new Date(`${weekStart}T00:00:00`);
    setWeekStart(isoDate(addDays(base, delta * 7)));
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
          <button type="button" onClick={() => moveWeek(-1)} style={secondaryBtn}>
            ← Previous week
          </button>
          <button type="button" onClick={() => setWeekStart(isoDate(mondayOf(new Date())))} style={secondaryBtn}>
            This week
          </button>
          <button type="button" onClick={() => moveWeek(1)} style={secondaryBtn}>
            Next week →
          </button>
        </div>
      </div>

      {loading ? <div style={infoBox}>Loading planner…</div> : null}
      {error ? <div style={errorBox}>{error}</div> : null}

      {!loading && !error ? (
        <>
          {unassignedItems.length > 0 ? (
            <section style={sectionCard}>
              <div style={sectionTitle}>Unassigned crane jobs</div>
              <div style={{ display: "grid", gap: 10 }}>
                {unassignedItems.map((item) => (
                  <a
                    key={item.id}
                    href={`/jobs/${item.job_id}`}
                    style={{ ...jobCardStyle, ...getStatusTone(item.status) }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 1000 }}>
                          Job {item.job_number ? `#${item.job_number}` : ""}
                          {getClientName(item) ? ` • ${getClientName(item)}` : ""}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.82 }}>
                          {item.site_name ?? item.site_address ?? "No site"}
                        </div>
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontWeight: 1000 }}>{fmtMoney(getDisplayPrice(item))}</div>
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                          {String(item.price_mode ?? "full_job") === "per_day"
                            ? `Per day ${fmtMoney(item.price_per_day ?? 0)}`
                            : "Full job"}
                        </div>
                      </div>
                    </div>

                    <div style={tagWrap}>
                      <div style={pillWarn}>No crane assigned</div>
                      {item.exclude_weekends ? <div style={pillNeutral}>Exclude weekends</div> : null}
                    </div>
                  </a>
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

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `240px repeat(${visibleDays.length}, minmax(180px, 1fr))`,
                    gap: 10,
                    alignItems: "stretch",
                  }}
                >
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
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      {equipment.asset_number ?? ""}
                    </div>
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
                              <a
                                key={`${item.id}-${day.date}`}
                                href={`/jobs/${item.job_id}`}
                                style={{ ...miniJobCard, ...getStatusTone(item.status) }}
                              >
                                <div style={{ fontWeight: 1000 }}>
                                  Job {item.job_number ? `#${item.job_number}` : ""}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>
                                  {getClientName(item)}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>
                                  {item.site_name ?? item.site_address ?? "No site"}
                                </div>
                                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900 }}>
                                  {fmtMoney(getDisplayPrice(item))}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.72 }}>
                                  {String(item.price_mode ?? "full_job") === "per_day"
                                    ? `Per day ${fmtMoney(item.price_per_day ?? 0)}`
                                    : "Full job"}
                                </div>
                                <div style={{ marginTop: 6, fontSize: 11, opacity: 0.72 }}>
                                  {item.start_time ?? "—"} → {item.end_time ?? "—"}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.72 }}>
                                  {getOperatorName(item)}
                                </div>
                                {item.exclude_weekends ? (
                                  <div style={{ marginTop: 6 }}>
                                    <span style={pillNeutral}>Exclude weekends</span>
                                  </div>
                                ) : null}
                              </a>
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
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: 14,
  borderRadius: 14,
};

const miniJobCard: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: 10,
  borderRadius: 10,
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
