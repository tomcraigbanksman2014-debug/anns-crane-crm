"use client";

import { useEffect, useMemo, useState } from "react";

type PlannerTransportJob = {
  id: string;
  transport_number?: string | null;
  transport_date?: string | null;
  collection_time?: string | null;
  delivery_time?: string | null;
  status?: string | null;
  job_type?: string | null;
  collection_address?: string | null;
  delivery_address?: string | null;
  load_description?: string | null;
  vehicle_id?: string | null;
  operator_id?: string | null;
  linked_job_id?: string | null;
  clients?:
    | { company_name?: string | null }
    | { company_name?: string | null }[]
    | null;
  vehicles?:
    | { id?: string; name?: string | null; reg_number?: string | null }
    | { id?: string; name?: string | null; reg_number?: string | null }[]
    | null;
  operators?:
    | { id?: string; full_name?: string | null }
    | { id?: string; full_name?: string | null }[]
    | null;
  jobs?:
    | { id?: string; job_number?: string | number | null; site_name?: string | null }
    | { id?: string; job_number?: string | number | null; site_name?: string | null }[]
    | null;
};

type PlannerVehicle = {
  id: string;
  name?: string | null;
  reg_number?: string | null;
  status?: string | null;
};

type PlannerDay = {
  date: string;
  label: string;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayOf(dateStr: string) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function prettyStatus(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "in_progress") return "In Progress";
  if (v === "completed") return "Completed";
  if (v === "confirmed") return "Confirmed";
  if (v === "cancelled") return "Cancelled";
  if (v === "planned") return "Planned";
  return value ?? "—";
}

function prettyJobType(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "crane_support") return "Crane Support";
  if (v === "haulage") return "Haulage";
  if (v === "delivery") return "Delivery";
  if (v === "collection") return "Collection";
  if (v === "ballast") return "Ballast";
  return value ?? "—";
}

export default function TransportPlannerBoard() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [data, setData] = useState<{
    week_start: string;
    week_end: string;
    days: PlannerDay[];
    jobs: PlannerTransportJob[];
    vehicles: PlannerVehicle[];
  }>({
    week_start: "",
    week_end: "",
    days: [],
    jobs: [],
    vehicles: [],
  });

  async function load() {
    setLoading(true);
    setMsg("");

    try {
      const res = await fetch(`/api/transport-planner/board?date=${selectedDate}`);
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg(json?.error || "Could not load transport planner.");
        return;
      }

      setData({
        week_start: json?.week_start ?? "",
        week_end: json?.week_end ?? "",
        days: json?.days ?? [],
        jobs: json?.jobs ?? [],
        vehicles: json?.vehicles ?? [],
      });
    } catch {
      setMsg("Could not load transport planner.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [selectedDate]);

  async function updateTransportJob(jobId: string, update: Record<string, any>) {
    setSavingId(jobId);
    setMsg("");

    try {
      const res = await fetch("/api/transport-planner/board/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transport_job_id: jobId,
          ...update,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg(json?.error || "Could not update transport job.");
        return;
      }

      await load();
    } catch {
      setMsg("Could not update transport job.");
    } finally {
      setSavingId(null);
      setDraggingJobId(null);
      setHoverCell(null);
    }
  }

  function moveWeek(direction: -1 | 1) {
    const base = mondayOf(selectedDate);
    base.setDate(base.getDate() + direction * 7);
    setSelectedDate(isoDate(base));
  }

  const vehicleOptions = useMemo(
    () =>
      data.vehicles.map((v) => ({
        value: v.id,
        label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
      })),
    [data.vehicles]
  );

  const unassignedByDay = useMemo(() => {
    const map = new Map<string, PlannerTransportJob[]>();

    for (const day of data.days) {
      map.set(day.date, []);
    }

    for (const job of data.jobs) {
      if (!job.vehicle_id && job.transport_date && map.has(job.transport_date)) {
        map.get(job.transport_date)!.push(job);
      }
    }

    return map;
  }, [data.days, data.jobs]);

  const vehicleDayMap = useMemo(() => {
    const map = new Map<string, PlannerTransportJob[]>();

    for (const vehicle of data.vehicles) {
      for (const day of data.days) {
        map.set(`${vehicle.id}__${day.date}`, []);
      }
    }

    for (const job of data.jobs) {
      if (job.vehicle_id && job.transport_date) {
        const key = `${job.vehicle_id}__${job.transport_date}`;
        if (map.has(key)) {
          map.get(key)!.push(job);
        }
      }
    }

    return map;
  }, [data.vehicles, data.days, data.jobs]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={toolbarStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24 }}>Transport Planner Board</h2>
          <div style={{ marginTop: 4, opacity: 0.75 }}>
            Drag transport jobs across the week and between vehicles.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => moveWeek(-1)} style={secondaryBtn}>
            ← Previous week
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={inputStyle}
          />

          <button type="button" onClick={() => moveWeek(1)} style={secondaryBtn}>
            Next week →
          </button>

          <button type="button" onClick={load} style={secondaryBtn}>
            Refresh
          </button>

          <a href="/transport-jobs/new" style={primaryLinkBtn}>
            + New transport job
          </a>
        </div>
      </div>

      {msg ? <div style={infoBox}>{msg}</div> : null}

      {loading ? (
        <div style={boardShellStyle}>Loading transport planner...</div>
      ) : (
        <div style={boardShellStyle}>
          <div style={boardScrollerStyle}>
            <div style={weekHeaderStyle}>
              <div style={nameColHeaderStyle}>Vehicle</div>
              {data.days.map((day) => (
                <div key={day.date} style={dayHeaderStyle}>
                  {day.label}
                </div>
              ))}
            </div>

            <div style={rowStyle}>
              <div style={nameCellStyle}>
                <div style={{ fontWeight: 1000 }}>Unassigned</div>
                <div style={{ fontSize: 12, opacity: 0.72 }}>Needs vehicle</div>
              </div>

              {data.days.map((day) => {
                const cellKey = `unassigned__${day.date}`;
                const jobs = unassignedByDay.get(day.date) ?? [];

                return (
                  <DropCell
                    key={cellKey}
                    active={hoverCell === cellKey}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setHoverCell(cellKey);
                    }}
                    onDragLeave={() => setHoverCell((prev) => (prev === cellKey ? null : prev))}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const jobId = e.dataTransfer.getData("text/plain");
                      if (!jobId) return;
                      await updateTransportJob(jobId, {
                        vehicle_id: null,
                        transport_date: day.date,
                      });
                    }}
                  >
                    {jobs.length === 0 ? (
                      <div style={emptyMiniStyle}>—</div>
                    ) : (
                      jobs.map((job) => (
                        <TransportCard
                          key={job.id}
                          job={job}
                          vehicleOptions={vehicleOptions}
                          saving={savingId === job.id}
                          dragging={draggingJobId === job.id}
                          compact
                          onDragStart={() => setDraggingJobId(job.id)}
                          onDragEnd={() => {
                            setDraggingJobId(null);
                            setHoverCell(null);
                          }}
                          onUpdate={updateTransportJob}
                        />
                      ))
                    )}
                  </DropCell>
                );
              })}
            </div>

            {data.vehicles.map((vehicle) => (
              <div key={vehicle.id} style={rowStyle}>
                <div style={nameCellStyle}>
                  <div style={{ fontWeight: 1000 }}>{vehicle.name ?? "Vehicle"}</div>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>
                    {vehicle.reg_number ?? "No registration"}
                  </div>
                </div>

                {data.days.map((day) => {
                  const cellKey = `${vehicle.id}__${day.date}`;
                  const jobs = vehicleDayMap.get(cellKey) ?? [];

                  return (
                    <DropCell
                      key={cellKey}
                      active={hoverCell === cellKey}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setHoverCell(cellKey);
                      }}
                      onDragLeave={() => setHoverCell((prev) => (prev === cellKey ? null : prev))}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const jobId = e.dataTransfer.getData("text/plain");
                        if (!jobId) return;
                        await updateTransportJob(jobId, {
                          vehicle_id: vehicle.id,
                          transport_date: day.date,
                        });
                      }}
                    >
                      {jobs.length === 0 ? (
                        <div style={emptyMiniStyle}>—</div>
                      ) : (
                        jobs.map((job) => (
                          <TransportCard
                            key={job.id}
                            job={job}
                            vehicleOptions={vehicleOptions}
                            saving={savingId === job.id}
                            dragging={draggingJobId === job.id}
                            compact
                            onDragStart={() => setDraggingJobId(job.id)}
                            onDragEnd={() => {
                              setDraggingJobId(null);
                              setHoverCell(null);
                            }}
                            onUpdate={updateTransportJob}
                          />
                        ))
                      )}
                    </DropCell>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DropCell({
  active,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  active: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        ...cellStyle,
        ...(active ? activeCellStyle : {}),
      }}
    >
      {children}
    </div>
  );
}

function TransportCard({
  job,
  vehicleOptions,
  saving,
  dragging,
  compact,
  onDragStart,
  onDragEnd,
  onUpdate,
}: {
  job: PlannerTransportJob;
  vehicleOptions: Array<{ value: string; label: string }>;
  saving: boolean;
  dragging: boolean;
  compact?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onUpdate: (jobId: string, update: Record<string, any>) => Promise<void>;
}) {
  const client = first(job.clients);
  const vehicle = first(job.vehicles);
  const operator = first(job.operators);
  const linkedJob = first(job.jobs);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", job.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      style={{
        ...jobCardStyle,
        opacity: dragging ? 0.55 : 1,
        cursor: "grab",
        padding: compact ? 10 : 16,
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 1000, fontSize: compact ? 14 : 18 }}>
          {job.transport_number ?? "Transport Job"}
        </div>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {client?.company_name ?? "Customer"}
        </div>

        <div style={{ fontSize: 12, fontWeight: 800 }}>
          {prettyJobType(job.job_type)}
        </div>

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {job.collection_time ?? "—"} → {job.delivery_time ?? "—"}
        </div>

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Pickup: {job.collection_address ?? "—"}
        </div>

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Delivery: {job.delivery_address ?? "—"}
        </div>

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Driver: {operator?.full_name ?? "—"}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700 }}>
          {prettyStatus(job.status)}
        </div>

        <select
          value={job.vehicle_id ?? ""}
          onChange={(e) => onUpdate(job.id, { vehicle_id: e.target.value || null })}
          disabled={saving}
          style={miniInputStyle}
        >
          <option value="">Vehicle</option>
          {vehicleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={job.status ?? ""}
          onChange={(e) => onUpdate(job.id, { status: e.target.value })}
          disabled={saving}
          style={miniInputStyle}
        >
          <option value="planned">Planned</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <a href={`/transport-jobs/${job.id}`} style={miniLinkStyle}>
          Open
        </a>

        <div style={{ fontSize: 11, opacity: 0.68 }}>
          Vehicle: {vehicle?.name ?? "Unassigned"}
        </div>

        <div style={{ fontSize: 11, opacity: 0.68 }}>
          Crane Job: {linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}
        </div>
      </div>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const boardShellStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const boardScrollerStyle: React.CSSProperties = {
  overflowX: "auto",
};

const weekHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px repeat(7, minmax(220px, 1fr))",
  gap: 12,
  marginBottom: 12,
  minWidth: 1780,
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px repeat(7, minmax(220px, 1fr))",
  gap: 12,
  marginBottom: 12,
  minWidth: 1780,
};

const nameColHeaderStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
};

const dayHeaderStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
  textAlign: "center",
};

const nameCellStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  alignSelf: "stretch",
};

const cellStyle: React.CSSProperties = {
  minHeight: 150,
  padding: 8,
  borderRadius: 12,
  background: "rgba(255,255,255,0.34)",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "grid",
  gap: 8,
  alignContent: "start",
};

const activeCellStyle: React.CSSProperties = {
  outline: "2px dashed rgba(0,120,255,0.55)",
  background: "rgba(225,238,255,0.65)",
};

const jobCardStyle: React.CSSProperties = {
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
};

const miniInputStyle: React.CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  boxSizing: "border-box",
  fontSize: 12,
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.70)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const primaryLinkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
};

const miniLinkStyle: React.CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
  fontSize: 12,
};

const emptyMiniStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.5,
  padding: 6,
};

const infoBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,170,0,0.14)",
  border: "1px solid rgba(255,170,0,0.24)",
  fontWeight: 800,
};
