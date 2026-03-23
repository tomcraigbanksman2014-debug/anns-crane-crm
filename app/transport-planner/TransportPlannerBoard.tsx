"use client";

import { useEffect, useMemo, useState } from "react";

type PlannerItem = {
  job_id: string;
  transport_number?: string | null;
  client_name?: string | null;
  collection_address?: string | null;
  delivery_address?: string | null;
  transport_date?: string | null;
  collection_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  operator_name?: string | null;
  status?: string | null;
  job_type?: string | null;
  load_description?: string | null;
  supplier_cost?: number | null;
  agreed_sell_rate?: number | null;
  job_price?: number | null;
  price_mode?: string | null;
  price_per_day?: number | null;
};

type VehicleRow = {
  id: string;
  name: string;
  reg_number?: string | null;
  status?: string | null;
  items: PlannerItem[];
};

type PlannerDay = {
  key: string;
  label: string;
  holiday?: string | null;
};

type PlannerResponse = {
  week_start: string;
  week_end: string;
  bank_holidays: Array<{ date: string; label: string }>;
  vehicles: VehicleRow[];
  unallocated_jobs: PlannerItem[];
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
}

function fmtMoney(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function statusTone(status: string | null | undefined): React.CSSProperties {
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

  return {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(0,0,0,0.10)",
  };
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
  const start = String(item.transport_date ?? "").trim();
  const end = String(item.delivery_date ?? item.transport_date ?? "").trim();
  if (!start || !end) return false;
  return start <= dayIso && end >= dayIso;
}

function getDisplayPrice(item: PlannerItem) {
  const agreed = Number(item.agreed_sell_rate ?? 0);
  if (agreed > 0) return agreed;
  return Number(item.job_price ?? 0);
}

export default function TransportPlannerBoard() {
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
        const res = await fetch(`/api/transport-planner/board?date=${encodeURIComponent(weekStart)}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.error || "Could not load transport planner.");
        }

        if (!active) return;
        setData(json);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || "Could not load transport planner.");
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
    const base = new Date(`${weekStart}T00:00:00`);
    const holidayMap: Record<string, string> = {};

    for (const item of data?.bank_holidays ?? []) {
      holidayMap[item.date] = item.label;
    }

    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      const key = isoDate(d);

      return {
        key,
        label: d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        }),
        holiday: holidayMap[key] ?? null,
      };
    });
  }, [data, weekStart]);

  function moveWeek(delta: number) {
    const base = new Date(`${weekStart}T00:00:00`);
    setWeekStart(isoDate(addDays(base, delta * 7)));
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={toolbarStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: 28 }}>Transport Planner</h2>
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

      {loading ? <div style={infoBox}>Loading transport planner…</div> : null}
      {error ? <div style={errorBox}>{error}</div> : null}

      {!loading && !error ? (
        <>
          {(data?.unallocated_jobs ?? []).length > 0 ? (
            <section style={sectionCard}>
              <div style={sectionTitle}>Unassigned transport jobs</div>

              <div style={{ display: "grid", gap: 10 }}>
                {(data?.unallocated_jobs ?? []).map((item) => (
                  <a
                    key={`unalloc-${item.job_id}`}
                    href={`/transport-jobs/${item.job_id}`}
                    style={{ ...jobCardStyle, ...statusTone(item.status) }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 1000 }}>
                          {item.transport_number ?? "Transport job"}
                          {item.client_name ? ` • ${item.client_name}` : ""}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.82 }}>
                          {item.collection_address ?? "No collection"} → {item.delivery_address ?? "No delivery"}
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
                      <div style={pillWarn}>No vehicle assigned</div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <div style={{ display: "grid", gap: 16 }}>
            {(data?.vehicles ?? []).map((vehicle) => (
              <section key={vehicle.id} style={sectionCard}>
                <div style={sectionTitleRow}>
                  <div>
                    <div style={sectionTitle}>{vehicle.name ?? "Vehicle"}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                      {vehicle.reg_number ? vehicle.reg_number : "No reg"}
                      {vehicle.status ? ` • ${vehicle.status}` : ""}
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
                  <div style={headCell}>Vehicle / Week</div>

                  {visibleDays.map((day) => (
                    <div
                      key={day.key}
                      style={{
                        ...headCell,
                        ...(day.holiday
                          ? {
                              background: "rgba(255,170,0,0.16)",
                              border: "1px solid rgba(255,170,0,0.24)",
                            }
                          : {}),
                      }}
                    >
                      <div>{day.label}</div>
                      <div style={{ marginTop: 4, fontSize: 11, opacity: 0.72 }}>
                        {day.holiday ? day.holiday : "Working day"}
                      </div>
                    </div>
                  ))}

                  <div style={sideCell}>
                    <div style={{ fontWeight: 1000 }}>{vehicle.name ?? "Vehicle"}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      {vehicle.reg_number ?? ""}
                    </div>
                  </div>

                  {visibleDays.map((day) => {
                    const dayItems = vehicle.items.filter((item) => itemMatchesDay(item, day.key));

                    return (
                      <div
                        key={`${vehicle.id}-${day.key}`}
                        style={{
                          ...dayCell,
                          ...(day.holiday
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
                                key={`${item.job_id}-${day.key}`}
                                href={`/transport-jobs/${item.job_id}`}
                                style={{ ...miniJobCard, ...statusTone(item.status) }}
                              >
                                <div style={{ fontWeight: 1000 }}>
                                  {item.transport_number ?? "Transport"}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>
                                  {item.client_name ?? "No customer"}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>
                                  {item.job_type ?? "—"}
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
                                  {item.collection_time ?? "—"} → {item.delivery_time ?? "—"}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.72 }}>
                                  {item.operator_name ?? "Unassigned"}
                                </div>
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
