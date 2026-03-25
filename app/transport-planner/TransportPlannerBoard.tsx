"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

function isoDateLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function ActionMenu({ jobId, onRemoved }: { jobId: string; onRemoved: () => void }) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function removeJob() {
    const ok = window.confirm("Remove this transport job from the planner by marking it cancelled?");
    if (!ok) return;

    setBusy(true);
    try {
      const formData = new FormData();
      const res = await fetch(`/api/transport-jobs/${jobId}/cancel`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Could not remove transport job.");
      }

      if (detailsRef.current) detailsRef.current.open = false;
      onRemoved();
    } catch (e: any) {
      window.alert(e?.message ?? "Could not remove transport job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details ref={detailsRef} style={{ position: "relative" }}>
      <summary style={menuSummaryBtn}>⋯</summary>
      <div style={menuPopup}>
        <a href={`/transport-jobs/${jobId}`} style={menuLink}>Open job</a>
        <a href={`/transport-jobs/${jobId}`} style={menuLink}>Edit job</a>
        <button type="button" onClick={removeJob} disabled={busy} style={menuDangerBtn}>
          {busy ? "Removing…" : "Remove job"}
        </button>
      </div>
    </details>
  );
}

export default function TransportPlannerBoard() {
  const [weekStart, setWeekStart] = useState<string>(() => isoDateLocal(mondayOf(new Date())));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PlannerResponse | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [weekStart, reloadKey]);

  const visibleDays = useMemo(() => {
    const base = new Date(`${weekStart}T00:00:00`);
    const holidayMap: Record<string, string> = {};

    for (const item of data?.bank_holidays ?? []) {
      holidayMap[item.date] = item.label;
    }

    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      const key = isoDateLocal(d);

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
    setWeekStart(isoDateLocal(addDays(base, delta * 7)));
  }

  function refreshPlanner() {
    setReloadKey((value) => value + 1);
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
          <button type="button" onClick={() => setWeekStart(isoDateLocal(mondayOf(new Date())))} style={secondaryBtn}>
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
                  <div
                    key={`unalloc-${item.job_id}`}
                    style={{ ...jobCardStyle, ...statusTone(item.status) }}
                  >
                    <div style={cardTopRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 1000 }}>
                          {item.transport_number ?? "Transport job"}
                          {item.client_name ? ` • ${item.client_name}` : ""}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.82 }}>
                          {item.collection_address ?? "No collection"} → {item.delivery_address ?? "No delivery"}
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

                    <div style={tagWrap}>
                      <div style={pillWarn}>No vehicle assigned</div>
                    </div>
                  </div>
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
                              <div
                                key={`${item.job_id}-${day.key}`}
                                style={{ ...miniJobCard, ...statusTone(item.status) }}
                              >
                                <div style={miniCardTopRow}>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontWeight: 1000 }}>
                                      {item.transport_number ?? "Transport"}
                                    </div>
                                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>
                                      {item.client_name ?? "No customer"}
                                    </div>
                                  </div>
                                  <ActionMenu jobId={item.job_id} onRemoved={refreshPlanner} />
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

const cardTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
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
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.86)",
  borderRadius: 10,
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  fontSize: 18,
  fontWeight: 900,
  userSelect: "none",
};

const menuPopup: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 6px)",
  minWidth: 160,
  padding: 8,
  borderRadius: 12,
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.10)",
  boxShadow: "0 12px 32px rgba(0,0,0,0.16)",
  display: "grid",
  gap: 6,
  zIndex: 30,
};

const menuLink: React.CSSProperties = {
  display: "block",
  padding: "8px 10px",
  borderRadius: 8,
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
  background: "rgba(255,255,255,0.95)",
};

const menuDangerBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,0,0,0.15)",
  background: "rgba(255,0,0,0.08)",
  color: "#b00020",
  fontWeight: 900,
  cursor: "pointer",
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
