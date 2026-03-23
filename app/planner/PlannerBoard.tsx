"use client";

import { useEffect, useMemo, useState } from "react";

type PlannerItem = {
  allocation_id?: string | null;
  job_id: string;
  job_number?: number | string | null;
  site_name?: string | null;
  site_address?: string | null;
  client_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  operator_name?: string | null;
  agreed_sell_rate?: number | null;
  job_price?: number | null;
  price_mode?: string | null;
  price_per_day?: number | null;
  exclude_weekends?: boolean;
  working_dates?: string[];
  billable_days?: number | null;
  notes?: string | null;
};

type CraneRow = {
  id: string;
  name: string;
  reg_number?: string | null;
  capacity?: string | null;
  status?: string | null;
  items: PlannerItem[];
};

type PlannerResponse = {
  week_start: string;
  week_end: string;
  bank_holidays: Array<{ date: string; label: string }>;
  cranes: CraneRow[];
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

  const weekDays = useMemo(() => {
    const base = new Date(`${weekStart}T00:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      return {
        key: isoDate(d),
        label: d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "2-digit" }),
      };
    });
  }, [weekStart]);

  const holidayMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of data?.bank_holidays ?? []) {
      map[item.date] = item.label;
    }
    return map;
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
            Week commencing {fmtDate(data?.week_start ?? weekStart)}
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

      <div style={weekHeaderGrid}>
        {weekDays.map((day) => {
          const holiday = holidayMap[day.key];
          return (
            <div
              key={day.key}
              style={{
                ...dayHeaderCard,
                ...(holiday
                  ? {
                      background: "rgba(255,170,0,0.16)",
                      border: "1px solid rgba(255,170,0,0.24)",
                    }
                  : {}),
              }}
            >
              <div style={{ fontWeight: 900 }}>{day.label}</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                {holiday ? holiday : "Working day"}
              </div>
            </div>
          );
        })}
      </div>

      {loading ? <div style={infoBox}>Loading planner…</div> : null}
      {error ? <div style={errorBox}>{error}</div> : null}

      {!loading && !error ? (
        <>
          <section style={sectionCard}>
            <div style={sectionTitle}>Unallocated crane jobs</div>

            {(data?.unallocated_jobs ?? []).length === 0 ? (
              <div style={infoBox}>No unallocated crane jobs for this week.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {(data?.unallocated_jobs ?? []).map((item) => (
                  <PlannerJobCard key={`unalloc-${item.job_id}`} item={item} href={`/jobs/${item.job_id}`} />
                ))}
              </div>
            )}
          </section>

          <div style={{ display: "grid", gap: 14 }}>
            {(data?.cranes ?? []).map((crane) => (
              <section key={crane.id} style={sectionCard}>
                <div style={sectionTitleRow}>
                  <div>
                    <div style={sectionTitle}>{crane.name ?? "Crane"}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                      {crane.reg_number ? `${crane.reg_number}` : "No reg"}
                      {crane.capacity ? ` • ${crane.capacity}` : ""}
                      {crane.status ? ` • ${crane.status}` : ""}
                    </div>
                  </div>
                </div>

                {crane.items.length === 0 ? (
                  <div style={infoBox}>No crane allocations this week.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {crane.items.map((item) => (
                      <PlannerJobCard
                        key={item.allocation_id ?? `${crane.id}-${item.job_id}`}
                        item={item}
                        href={`/jobs/${item.job_id}`}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function PlannerJobCard({
  item,
  href,
}: {
  item: PlannerItem;
  href: string;
}) {
  const displayPrice =
    Number(item.agreed_sell_rate ?? 0) > 0 ? Number(item.agreed_sell_rate ?? 0) : Number(item.job_price ?? 0);

  return (
    <a href={href} style={{ ...jobCardStyle, ...statusTone(item.status) }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 1000 }}>
            Job {item.job_number ? `#${item.job_number}` : ""}
            {item.client_name ? ` • ${item.client_name}` : ""}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.82 }}>
            {item.site_name ?? item.site_address ?? "No site"}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 1000 }}>{fmtMoney(displayPrice)}</div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
            {String(item.price_mode ?? "full_job") === "per_day"
              ? `Per day ${fmtMoney(item.price_per_day ?? 0)}`
              : "Full job"}
          </div>
        </div>
      </div>

      <div style={metaGrid}>
        <Meta label="Dates" value={`${fmtDate(item.start_date)} → ${fmtDate(item.end_date)}`} />
        <Meta label="Times" value={`${item.start_time ?? "—"} → ${item.end_time ?? "—"}`} />
        <Meta label="Operator" value={item.operator_name ?? "—"} />
        <Meta label="Status" value={item.status ?? "—"} />
      </div>

      {item.exclude_weekends ? (
        <div style={tagWrap}>
          <div style={tagStyle}>Exclude weekends</div>
          <div style={tagHelp}>
            Billable / active days: {Number(item.billable_days ?? 0)}
          </div>
        </div>
      ) : null}
    </a>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={metaBox}>
      <div style={metaLabel}>{label}</div>
      <div style={metaValue}>{value}</div>
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

const weekHeaderGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: 10,
};

const dayHeaderCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
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

const jobCardStyle: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: 14,
  borderRadius: 14,
};

const metaGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
  marginTop: 12,
};

const metaBox: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const metaLabel: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.72,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const metaValue: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  fontWeight: 800,
};

const tagWrap: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  marginTop: 10,
};

const tagStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(255,170,0,0.16)",
  border: "1px solid rgba(255,170,0,0.22)",
};

const tagHelp: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 800,
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

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
