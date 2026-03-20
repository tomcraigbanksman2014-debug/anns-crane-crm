"use client";

import { useEffect, useMemo, useState } from "react";

const ACTIVE_JOB_STATUSES = ["planned", "confirmed", "in_progress"];

type PlannerTransportJob = {
  id: string;
  transport_number?: string | null;
  transport_date?: string | null;
  collection_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  status?: string | null;
  job_type?: string | null;
  collection_address?: string | null;
  delivery_address?: string | null;
  collection_lat?: number | null;
  collection_lng?: number | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  load_description?: string | null;
  notes?: string | null;
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

type LookupOperator = {
  id: string;
  full_name?: string | null;
};

type LookupVehicle = {
  id: string;
  name?: string | null;
  reg_number?: string | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function todayIso() {
  const d = new Date();
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

function hasCoords(lat: number | null | undefined, lng: number | null | undefined) {
  return typeof lat === "number" && typeof lng === "number";
}

function toDateTime(dateValue: string | null | undefined, timeValue: string | null | undefined) {
  const date = String(dateValue ?? "").trim();
  const time = String(timeValue ?? "").trim();
  if (!date || !time) return null;

  const dt = new Date(`${date}T${time}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function eachDayInRange(startDate: string | null | undefined, endDate: string | null | undefined) {
  const start = String(startDate ?? "").trim();
  const end = String(endDate ?? startDate ?? "").trim();

  if (!start) return [];

  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end || start}T00:00:00`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
  if (from > to) return [];

  const out: string[] = [];
  const cursor = new Date(from);

  while (cursor <= to) {
    out.push(dateOnly(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

function touchesDay(job: PlannerTransportJob, day: string) {
  return eachDayInRange(
    job.transport_date,
    job.delivery_date ?? job.transport_date
  ).includes(day);
}

function overlapsDateTimes(a: PlannerTransportJob, b: PlannerTransportJob) {
  const aStart = toDateTime(a.transport_date, a.collection_time);
  const aEnd = toDateTime(a.delivery_date ?? a.transport_date, a.delivery_time);
  const bStart = toDateTime(b.transport_date, b.collection_time);
  const bEnd = toDateTime(b.delivery_date ?? b.transport_date, b.delivery_time);

  if (!aStart || !aEnd || !bStart || !bEnd) return false;

  return aStart < bEnd && bStart < aEnd;
}

function inferAutoStatus(update: Record<string, any>, current: PlannerTransportJob) {
  const nextVehicle = update.vehicle_id !== undefined ? update.vehicle_id : current.vehicle_id;
  const nextOperator = update.operator_id !== undefined ? update.operator_id : current.operator_id;
  const nextCollectionTime =
    update.collection_time !== undefined ? update.collection_time : current.collection_time;
  const nextDeliveryDate =
    update.delivery_date !== undefined
      ? update.delivery_date
      : current.delivery_date ?? current.transport_date;
  const nextDeliveryTime =
    update.delivery_time !== undefined ? update.delivery_time : current.delivery_time;
  const nextStatus = update.status !== undefined ? update.status : current.status;

  if (update.status !== undefined) return nextStatus;

  if (
    String(current.status ?? "").toLowerCase() === "planned" &&
    nextVehicle &&
    nextOperator &&
    nextCollectionTime &&
    nextDeliveryDate &&
    nextDeliveryTime
  ) {
    return "confirmed";
  }

  return nextStatus;
}

function cardTheme(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "planned") {
    return {
      background: "linear-gradient(180deg, rgba(247,247,247,0.98), rgba(236,236,236,0.98))",
      border: "1px solid rgba(0,0,0,0.10)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
    };
  }

  if (s === "confirmed") {
    return {
      background: "linear-gradient(180deg, rgba(255,248,230,0.98), rgba(255,238,198,0.98))",
      border: "1px solid rgba(255,170,0,0.22)",
      boxShadow: "0 2px 8px rgba(255,170,0,0.08)",
    };
  }

  if (s === "in_progress") {
    return {
      background: "linear-gradient(180deg, rgba(234,243,255,0.98), rgba(212,228,255,0.98))",
      border: "1px solid rgba(0,120,255,0.22)",
      boxShadow: "0 2px 8px rgba(0,120,255,0.08)",
    };
  }

  if (s === "completed") {
    return {
      background: "linear-gradient(180deg, rgba(234,255,244,0.98), rgba(214,247,228,0.98))",
      border: "1px solid rgba(0,180,120,0.22)",
      boxShadow: "0 2px 8px rgba(0,180,120,0.08)",
    };
  }

  if (s === "cancelled") {
    return {
      background: "linear-gradient(180deg, rgba(255,240,240,0.98), rgba(255,223,223,0.98))",
      border: "1px solid rgba(220,0,0,0.20)",
      boxShadow: "0 2px 8px rgba(220,0,0,0.06)",
    };
  }

  return {
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  };
}

function compactBadge(text: string, kind: "neutral" | "warn" | "bad" | "good") {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1,
  };

  if (kind === "good") {
    return <span style={{ ...base, background: "rgba(0,180,120,0.12)", color: "#0b7a4b" }}>{text}</span>;
  }
  if (kind === "warn") {
    return <span style={{ ...base, background: "rgba(255,170,0,0.14)", color: "#8a5200" }}>{text}</span>;
  }
  if (kind === "bad") {
    return <span style={{ ...base, background: "rgba(255,0,0,0.10)", color: "#b00020" }}>{text}</span>;
  }
  return <span style={{ ...base, background: "rgba(0,0,0,0.06)", color: "#444" }}>{text}</span>;
}

export default function TransportPlannerBoard() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [lookupOperators, setLookupOperators] = useState<LookupOperator[]>([]);
  const [lookupVehicles, setLookupVehicles] = useState<LookupVehicle[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorJob, setEditorJob] = useState<PlannerTransportJob | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [compactMode, setCompactMode] = useState(true);

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
      const [boardRes, lookupRes] = await Promise.all([
        fetch(`/api/transport-planner/board?date=${selectedDate}`, { cache: "no-store" }),
        fetch("/api/lookups/transport-form", { cache: "no-store" }),
      ]);

      const boardJson = await boardRes.json().catch(() => null);
      const lookupJson = await lookupRes.json().catch(() => null);

      if (!boardRes.ok) {
        setMsg(boardJson?.error || "Could not load transport planner.");
        return;
      }

      setData({
        week_start: boardJson?.week_start ?? "",
        week_end: boardJson?.week_end ?? "",
        days: boardJson?.days ?? [],
        jobs: boardJson?.jobs ?? [],
        vehicles: boardJson?.vehicles ?? [],
      });

      if (lookupRes.ok) {
        setLookupOperators(lookupJson?.operators ?? []);
        setLookupVehicles(lookupJson?.vehicles ?? []);
      }
    } catch {
      setMsg("Could not load transport planner.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [selectedDate]);

  function moveWeek(offset: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + offset * 7);
    setSelectedDate(d.toISOString().slice(0, 10));
  }

  async function updateTransportJob(jobId: string, update: Record<string, any>) {
    setSavingId(jobId);
    setMsg("");

    try {
      const current = data.jobs.find((j) => j.id === jobId);
      const finalPayload = current
        ? {
            ...update,
            status: inferAutoStatus(update, current),
          }
        : update;

      const res = await fetch("/api/transport-planner/board/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transport_job_id: jobId,
          ...finalPayload,
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

  async function saveEditor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editorJob) return;

    const form = new FormData(e.currentTarget);

    setEditorSaving(true);
    setMsg("");

    try {
      const update = {
        transport_date: String(form.get("transport_date") ?? "").trim() || null,
        collection_time: String(form.get("collection_time") ?? "").trim() || null,
        delivery_date: String(form.get("delivery_date") ?? "").trim() || null,
        delivery_time: String(form.get("delivery_time") ?? "").trim() || null,
        operator_id: String(form.get("operator_id") ?? "").trim() || null,
        vehicle_id: String(form.get("vehicle_id") ?? "").trim() || null,
        status: String(form.get("status") ?? "").trim() || "planned",
        collection_address: String(form.get("collection_address") ?? "").trim() || null,
        delivery_address: String(form.get("delivery_address") ?? "").trim() || null,
        load_description: String(form.get("load_description") ?? "").trim() || null,
        notes: String(form.get("notes") ?? "").trim() || null,
      };

      const res = await fetch("/api/transport-planner/board/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transport_job_id: editorJob.id,
          ...update,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg(json?.error || "Could not save transport job.");
        return;
      }

      setEditorOpen(false);
      setEditorJob(null);
      await load();
    } catch {
      setMsg("Could not save transport job.");
    } finally {
      setEditorSaving(false);
    }
  }

  const vehicleOptions = useMemo(() => {
    return lookupVehicles.map((v) => ({
      value: v.id,
      label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
    }));
  }, [lookupVehicles]);

  const operatorOptions = useMemo(() => {
    return lookupOperators.map((o) => ({
      value: o.id,
      label: o.full_name ?? "Operator",
    }));
  }, [lookupOperators]);

  function jobWarnings(job: PlannerTransportJob, cellCount: number, allJobs: PlannerTransportJob[]) {
    const warnings: string[] = [];

    if (!job.vehicle_id) warnings.push("No vehicle");
    if (!job.operator_id) warnings.push("No driver");
    if (!hasCoords(job.collection_lat, job.collection_lng) || !hasCoords(job.delivery_lat, job.delivery_lng)) {
      warnings.push("No route coords");
    }

    if (job.vehicle_id) {
      const vehicleConflict = allJobs.some((other) => {
        if (!ACTIVE_JOB_STATUSES.includes(String(other.status ?? "").toLowerCase())) return false;
        if (other.id === job.id) return false;
        if (other.vehicle_id !== job.vehicle_id) return false;
        return overlapsDateTimes(job, other);
      });
      if (vehicleConflict) warnings.push("Vehicle conflict");
    }

    if (job.operator_id) {
      const driverConflict = allJobs.some((other) => {
        if (!ACTIVE_JOB_STATUSES.includes(String(other.status ?? "").toLowerCase())) return false;
        if (other.id === job.id) return false;
        if (other.operator_id !== job.operator_id) return false;
        return overlapsDateTimes(job, other);
      });
      if (driverConflict) warnings.push("Driver conflict");
    }

    if (cellCount > 2) warnings.push("Busy day");

    return warnings;
  }

  const filteredJobs = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    return data.jobs.filter((job) => {
      const client = first(job.clients);
      const operator = first(job.operators);
      const vehicle = first(job.vehicles);
      const linkedJob = first(job.jobs);

      if (statusFilter && String(job.status ?? "") !== statusFilter) return false;
      if (vehicleFilter && String(job.vehicle_id ?? "") !== vehicleFilter) return false;
      if (driverFilter && String(job.operator_id ?? "") !== driverFilter) return false;
      if (unassignedOnly && !!job.vehicle_id) return false;

      const warnings = jobWarnings(job, 1, data.jobs);
      if (conflictsOnly && !warnings.some((w) => w.toLowerCase().includes("conflict"))) return false;

      if (!q) return true;

      const haystack = [
        job.transport_number,
        client?.company_name,
        job.collection_address,
        job.delivery_address,
        operator?.full_name,
        vehicle?.name,
        vehicle?.reg_number,
        linkedJob?.job_number,
        job.load_description,
        job.notes,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");

      return haystack.includes(q);
    });
  }, [data.jobs, searchText, statusFilter, vehicleFilter, driverFilter, unassignedOnly, conflictsOnly]);

  const vehicleMap = useMemo(() => {
    const map = new Map<string, PlannerVehicle>();
    data.vehicles.forEach((v) => map.set(v.id, v));
    return map;
  }, [data.vehicles]);

  const shownVehicles = useMemo(() => {
    if (vehicleFilter) {
      const one = vehicleMap.get(vehicleFilter);
      return one ? [one] : [];
    }

    return data.vehicles;
  }, [data.vehicles, vehicleFilter, vehicleMap]);

  const unassignedByDay = useMemo(() => {
    const map = new Map<string, PlannerTransportJob[]>();
    for (const day of data.days) {
      const jobs = filteredJobs.filter(
        (job) => touchesDay(job, day.date) && !job.vehicle_id
      );
      map.set(day.date, jobs);
    }
    return map;
  }, [data.days, filteredJobs]);

  const vehicleDayMap = useMemo(() => {
    const map = new Map<string, PlannerTransportJob[]>();
    for (const vehicle of shownVehicles) {
      for (const day of data.days) {
        const key = `${vehicle.id}__${day.date}`;
        const jobs = filteredJobs.filter(
          (job) => touchesDay(job, day.date) && job.vehicle_id === vehicle.id
        );
        map.set(key, jobs);
      }
    }
    return map;
  }, [shownVehicles, data.days, filteredJobs]);

  const visibleJobCount = filteredJobs.length;
  const conflictCount = filteredJobs.filter((job) =>
    jobWarnings(job, 1, filteredJobs).some((w) => w.toLowerCase().includes("conflict"))
  ).length;

  return (
    <>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={toolbarStyle}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Transport Planner Board</h2>
            <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
              Drag jobs between vehicles and days. Overnight jobs now show across the days they span.
            </div>
          </div>

          <div style={toolbarActionsStyle}>
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

        <div style={filtersStyle}>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search ref, customer, address, driver, vehicle, crane job..."
            style={{ ...inputStyle, minWidth: 220 }}
          />

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
            <option value="">All statuses</option>
            <option value="planned">Planned</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} style={inputStyle}>
            <option value="">All vehicles</option>
            {vehicleOptions.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>

          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} style={inputStyle}>
            <option value="">All drivers</option>
            {operatorOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <label style={tickLabel}>
            <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} />
            Unassigned only
          </label>

          <label style={tickLabel}>
            <input type="checkbox" checked={conflictsOnly} onChange={(e) => setConflictsOnly(e.target.checked)} />
            Conflicts only
          </label>

          <label style={tickLabel}>
            <input type="checkbox" checked={compactMode} onChange={(e) => setCompactMode(e.target.checked)} />
            Compact view
          </label>
        </div>

        <div style={statsStyle}>
          <StatCard label="Visible jobs" value={visibleJobCount} />
          <StatCard label="Conflicts" value={conflictCount} />
          <StatCard label="Shown vehicles" value={shownVehicles.length} />
          <StatCard label="Week" value={data.week_start ? `${data.week_start} → ${data.week_end}` : "—"} />
        </div>

        {msg ? <div style={infoBox}>{msg}</div> : null}

        {loading ? (
          <div style={boardShellStyle}>Loading transport planner...</div>
        ) : (
          <div style={boardShellStyle}>
            <div style={legendStyle}>
              {compactBadge("Planned", "neutral")}
              {compactBadge("Confirmed", "warn")}
              {compactBadge("In Progress", "neutral")}
              {compactBadge("Completed", "good")}
              {compactBadge("Cancelled", "bad")}
              {compactBadge("Conflict", "bad")}
            </div>

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
                  <div style={{ fontWeight: 1000, fontSize: 13 }}>Unassigned</div>
                  <div style={{ fontSize: 11, opacity: 0.72 }}>Needs vehicle</div>
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
                            key={`${job.id}-${day.date}`}
                            job={job}
                            compact={compactMode}
                            saving={savingId === job.id}
                            dragging={draggingJobId === job.id}
                            warnings={jobWarnings(job, jobs.length, filteredJobs)}
                            onDragStart={() => setDraggingJobId(job.id)}
                            onDragEnd={() => {
                              setDraggingJobId(null);
                              setHoverCell(null);
                            }}
                            onOpenQuickEdit={() => {
                              setEditorJob(job);
                              setEditorOpen(true);
                            }}
                          />
                        ))
                      )}
                    </DropCell>
                  );
                })}
              </div>

              {shownVehicles.map((vehicle) => (
                <div key={vehicle.id} style={rowStyle}>
                  <div style={nameCellStyle}>
                    <div style={{ fontWeight: 1000, fontSize: 13 }}>{vehicle.name ?? "Vehicle"}</div>
                    <div style={{ fontSize: 11, opacity: 0.72 }}>
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
                              key={`${job.id}-${day.date}`}
                              job={job}
                              compact={compactMode}
                              saving={savingId === job.id}
                              dragging={draggingJobId === job.id}
                              warnings={jobWarnings(job, jobs.length, filteredJobs)}
                              onDragStart={() => setDraggingJobId(job.id)}
                              onDragEnd={() => {
                                setDraggingJobId(null);
                                setHoverCell(null);
                              }}
                              onOpenQuickEdit={() => {
                                setEditorJob(job);
                                setEditorOpen(true);
                              }}
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

        {editorOpen && editorJob ? (
          <div style={drawerBackdrop} onClick={() => setEditorOpen(false)}>
            <div style={drawerStyle} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 1000 }}>
                    {editorJob.transport_number ?? "Transport job"}
                  </div>
                  <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
                    Quick edit
                  </div>
                </div>

                <button type="button" style={secondaryBtn} onClick={() => setEditorOpen(false)}>
                  Close
                </button>
              </div>

              <form onSubmit={saveEditor} style={{ display: "grid", gap: 12, marginTop: 16 }}>
                <div style={drawerGrid}>
                  <Field label="Collection date" name="transport_date" defaultValue={editorJob.transport_date ?? ""} type="date" />
                  <Field label="Collection time" name="collection_time" defaultValue={editorJob.collection_time ?? ""} type="time" />
                  <Field label="Delivery date" name="delivery_date" defaultValue={editorJob.delivery_date ?? editorJob.transport_date ?? ""} type="date" />
                  <Field label="Delivery time" name="delivery_time" defaultValue={editorJob.delivery_time ?? ""} type="time" />

                  <SelectField
                    label="Vehicle"
                    name="vehicle_id"
                    defaultValue={editorJob.vehicle_id ?? ""}
                    options={[{ value: "", label: "Unassigned" }, ...vehicleOptions]}
                  />

                  <SelectField
                    label="Driver"
                    name="operator_id"
                    defaultValue={editorJob.operator_id ?? ""}
                    options={[{ value: "", label: "Unassigned" }, ...operatorOptions]}
                  />

                  <SelectField
                    label="Status"
                    name="status"
                    defaultValue={editorJob.status ?? "planned"}
                    options={[
                      { value: "planned", label: "Planned" },
                      { value: "confirmed", label: "Confirmed" },
                      { value: "in_progress", label: "In Progress" },
                      { value: "completed", label: "Completed" },
                      { value: "cancelled", label: "Cancelled" },
                    ]}
                  />
                </div>

                <TextAreaField
                  label="Collection address"
                  name="collection_address"
                  defaultValue={editorJob.collection_address ?? ""}
                  rows={2}
                />

                <TextAreaField
                  label="Delivery address"
                  name="delivery_address"
                  defaultValue={editorJob.delivery_address ?? ""}
                  rows={2}
                />

                <TextAreaField
                  label="Load description"
                  name="load_description"
                  defaultValue={editorJob.load_description ?? ""}
                  rows={2}
                />

                <TextAreaField
                  label="Notes"
                  name="notes"
                  defaultValue={editorJob.notes ?? ""}
                  rows={3}
                />

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="submit" style={primaryBtn} disabled={editorSaving}>
                    {editorSaving ? "Saving..." : "Save changes"}
                  </button>
                  <a href={`/transport-jobs/${editorJob.id}`} style={secondaryLinkBtn}>
                    Open transport job
                  </a>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 20, fontWeight: 1000 }}>{value}</div>
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
  active?: boolean;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
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
  compact,
  saving,
  dragging,
  warnings,
  onDragStart,
  onDragEnd,
  onOpenQuickEdit,
}: {
  job: PlannerTransportJob;
  compact?: boolean;
  saving?: boolean;
  dragging?: boolean;
  warnings: string[];
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onOpenQuickEdit?: () => void;
}) {
  const client = first(job.clients);
  const vehicle = first(job.vehicles);
  const driver = first(job.operators);
  const linkedJob = first(job.jobs);
  const isMultiDay =
    !!job.transport_date &&
    !!(job.delivery_date ?? job.transport_date) &&
    job.transport_date !== (job.delivery_date ?? job.transport_date);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", job.id);
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={onOpenQuickEdit}
      style={{
        ...jobCardBase,
        ...cardTheme(job.status),
        opacity: dragging ? 0.55 : saving ? 0.7 : 1,
        padding: compact ? 8 : 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 1000, fontSize: compact ? 12 : 13, lineHeight: 1.2 }}>
            {job.transport_number ?? "Transport job"}
          </div>
          <div style={{ marginTop: 3, fontSize: 11, opacity: 0.76 }}>
            {client?.company_name ?? "No customer"}
          </div>
        </div>

        <div style={{ flexShrink: 0 }}>
          {compactBadge(prettyStatus(job.status), warnings.some((w) => w.toLowerCase().includes("conflict")) ? "bad" : "neutral")}
        </div>
      </div>

      <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: compact ? 11 : 12 }}>
        <div><strong>{prettyJobType(job.job_type)}</strong></div>
        <div>{job.collection_time ?? "—"} → {job.delivery_time ?? "—"}</div>
        {isMultiDay ? (
          <div>
            {job.transport_date} → {job.delivery_date}
          </div>
        ) : null}
        {!compact ? <div>Pickup: {job.collection_address ?? "—"}</div> : null}
        {!compact ? <div>Delivery: {job.delivery_address ?? "—"}</div> : null}
        <div>Driver: {driver?.full_name ?? "Unassigned"}</div>
        {linkedJob?.job_number ? <div>Crane job: #{linkedJob.job_number}</div> : null}
        {vehicle?.name ? <div>Vehicle: {vehicle.name}</div> : null}
      </div>

      {warnings.length > 0 ? (
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {warnings.slice(0, compact ? 2 : 4).map((warning) => (
            <span key={warning} style={warningPill}>
              {warning}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={fieldLabel}>{label}</label>
      <input name={name} defaultValue={defaultValue} type={type} style={inputStyle} />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={fieldLabel}>{label}</label>
      <select name={name} defaultValue={defaultValue} style={inputStyle}>
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
  rows,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows: number;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={fieldLabel}>{label}</label>
      <textarea name={name} defaultValue={defaultValue} rows={rows} style={drawerTextarea} />
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  background: "rgba(255,255,255,0.18)",
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const toolbarActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const filtersStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  background: "rgba(255,255,255,0.18)",
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const statsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
};

const statCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const boardShellStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const legendStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 10,
};

const boardScrollerStyle: React.CSSProperties = {
  overflowX: "auto",
  overflowY: "hidden",
  paddingBottom: 6,
};

const weekHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px repeat(7, minmax(130px, 1fr))",
  gap: 8,
  marginBottom: 8,
  minWidth: 1060,
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px repeat(7, minmax(130px, 1fr))",
  gap: 8,
  marginBottom: 8,
  minWidth: 1060,
};

const nameColHeaderStyle: React.CSSProperties = {
  padding: 8,
  borderRadius: 10,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
  fontSize: 12,
};

const dayHeaderStyle: React.CSSProperties = {
  padding: 8,
  borderRadius: 10,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
  textAlign: "center",
  fontSize: 12,
};

const nameCellStyle: React.CSSProperties = {
  padding: 8,
  borderRadius: 10,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  alignSelf: "stretch",
  minHeight: 88,
};

const cellStyle: React.CSSProperties = {
  minHeight: 88,
  padding: 5,
  borderRadius: 10,
  background: "rgba(255,255,255,0.34)",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "grid",
  gap: 5,
  alignContent: "start",
};

const activeCellStyle: React.CSSProperties = {
  outline: "2px dashed rgba(0,120,255,0.45)",
  background: "rgba(225,238,255,0.55)",
};

const jobCardBase: React.CSSProperties = {
  borderRadius: 10,
  cursor: "pointer",
  minWidth: 0,
  userSelect: "none",
};

const warningPill: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 7px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  background: "rgba(255,0,0,0.10)",
  color: "#b00020",
};

const emptyMiniStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.45,
  textAlign: "center",
  paddingTop: 8,
};

const inputStyle: React.CSSProperties = {
  minWidth: 0,
  height: 38,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  padding: "0 10px",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  height: 38,
  padding: "0 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  height: 38,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.8)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const primaryLinkBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 38,
  padding: "0 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  textDecoration: "none",
};

const secondaryLinkBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 38,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.8)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
};

const tickLabel: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
};

const infoBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const drawerBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.25)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 50,
};

const drawerStyle: React.CSSProperties = {
  width: "min(560px, 100vw)",
  height: "100%",
  overflowY: "auto",
  background: "#f6f8fb",
  padding: 18,
  boxShadow: "-10px 0 30px rgba(0,0,0,0.18)",
};

const drawerGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.76,
};

const drawerTextarea: React.CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  padding: "10px 12px",
  boxSizing: "border-box",
  resize: "vertical",
};
