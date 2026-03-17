"use client";

import { useEffect, useMemo, useState } from "react";
import ClientShell from "../ClientShell";

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

function hasCoords(lat: number | null | undefined, lng: number | null | undefined) {
  return typeof lat === "number" && typeof lng === "number";
}

function toMinutes(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const match = v.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
}

function overlaps(
  aStart: string | null | undefined,
  aEnd: string | null | undefined,
  bStart: string | null | undefined,
  bEnd: string | null | undefined
) {
  const startA = toMinutes(aStart);
  const endA = toMinutes(aEnd);
  const startB = toMinutes(bStart);
  const endB = toMinutes(bEnd);

  if (startA === null || endA === null || startB === null || endB === null) {
    return false;
  }

  return startA < endB && startB < endA;
}

function jobCardColor(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").trim().toLowerCase();

  if (s === "planned") {
    return {
      background: "linear-gradient(180deg, rgba(245,245,245,0.98), rgba(232,232,232,0.98))",
      border: "1px solid rgba(0,0,0,0.12)",
    };
  }

  if (s === "confirmed") {
    return {
      background: "linear-gradient(180deg, rgba(255,248,230,0.98), rgba(255,236,191,0.98))",
      border: "1px solid rgba(255,170,0,0.25)",
    };
  }

  if (s === "in_progress") {
    return {
      background: "linear-gradient(180deg, rgba(232,242,255,0.98), rgba(204,226,255,0.98))",
      border: "1px solid rgba(0,120,255,0.25)",
    };
  }

  if (s === "completed") {
    return {
      background: "linear-gradient(180deg, rgba(232,255,244,0.98), rgba(205,245,225,0.98))",
      border: "1px solid rgba(0,180,120,0.25)",
    };
  }

  if (s === "cancelled") {
    return {
      background: "linear-gradient(180deg, rgba(255,238,238,0.98), rgba(255,220,220,0.98))",
      border: "1px solid rgba(255,0,0,0.22)",
    };
  }

  return {
    background: "rgba(255,255,255,0.90)",
    border: "1px solid rgba(0,0,0,0.08)",
  };
}

function statusStripe(status: string | null | undefined) {
  const s = String(status ?? "").trim().toLowerCase();

  if (s === "planned") return "rgba(120,120,120,0.85)";
  if (s === "confirmed") return "rgba(255,170,0,0.95)";
  if (s === "in_progress") return "rgba(0,120,255,0.95)";
  if (s === "completed") return "rgba(0,180,120,0.95)";
  if (s === "cancelled") return "rgba(220,0,0,0.90)";
  return "rgba(0,0,0,0.18)";
}

export default function TransportPlannerPage() {
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
        fetch(`/api/transport-planner/board?date=${selectedDate}`),
        fetch(`/api/lookups/transport-form`),
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

  async function saveEditor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editorJob) return;

    const form = new FormData(e.currentTarget);

    setEditorSaving(true);
    setMsg("");

    try {
      const res = await fetch(`/api/transport-jobs/${editorJob.id}`, {
        method: "POST",
        body: form,
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

  function jobWarnings(
    job: PlannerTransportJob,
    totalInCell: number,
    allJobs: PlannerTransportJob[]
  ) {
    const warnings: string[] = [];

    if (!job.vehicle_id) warnings.push("No vehicle");
    if (!job.operator_id) warnings.push("No driver");

    if (
      !hasCoords(job.collection_lat, job.collection_lng) ||
      !hasCoords(job.delivery_lat, job.delivery_lng)
    ) {
      warnings.push("No route coords");
    }

    if (totalInCell > 3) warnings.push("Busy day");

    if (job.vehicle_id && job.transport_date) {
      const vehicleConflict = allJobs.some((other) => {
        if (other.id === job.id) return false;
        if (other.vehicle_id !== job.vehicle_id) return false;
        if (other.transport_date !== job.transport_date) return false;

        return overlaps(
          job.collection_time,
          job.delivery_time,
          other.collection_time,
          other.delivery_time
        );
      });

      if (vehicleConflict) warnings.push("Vehicle conflict");
    }

    if (job.operator_id && job.transport_date) {
      const driverConflict = allJobs.some((other) => {
        if (other.id === job.id) return false;
        if (other.operator_id !== job.operator_id) return false;
        if (other.transport_date !== job.transport_date) return false;

        return overlaps(
          job.collection_time,
          job.delivery_time,
          other.collection_time,
          other.delivery_time
        );
      });

      if (driverConflict) warnings.push("Driver conflict");
    }

    return warnings;
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1420px, 99vw)", margin: "0 auto" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={toolbarStyle}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Transport Planner Board</h2>
              <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
                Drag transport jobs across the week and between vehicles. Click a card to quick edit.
              </div>
            </div>

            <div style={legendWrap}>
              <span style={{ ...legendItem, background: "rgba(245,245,245,0.96)" }}>Planned</span>
              <span style={{ ...legendItem, background: "rgba(255,236,191,0.96)" }}>Confirmed</span>
              <span style={{ ...legendItem, background: "rgba(204,226,255,0.96)" }}>In Progress</span>
              <span style={{ ...legendItem, background: "rgba(205,245,225,0.96)" }}>Completed</span>
              <span style={{ ...legendItem, background: "rgba(255,220,220,0.96)" }}>Cancelled</span>
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
                              key={job.id}
                              job={job}
                              vehicleOptions={vehicleOptions}
                              saving={savingId === job.id}
                              dragging={draggingJobId === job.id}
                              compact
                              warnings={jobWarnings(job, jobs.length, data.jobs)}
                              onDragStart={() => setDraggingJobId(job.id)}
                              onDragEnd={() => {
                                setDraggingJobId(null);
                                setHoverCell(null);
                              }}
                              onUpdate={updateTransportJob}
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

                {data.vehicles.map((vehicle) => (
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
                                key={job.id}
                                job={job}
                                vehicleOptions={vehicleOptions}
                                saving={savingId === job.id}
                                dragging={draggingJobId === job.id}
                                compact
                                warnings={jobWarnings(job, jobs.length, data.jobs)}
                                onDragStart={() => setDraggingJobId(job.id)}
                                onDragEnd={() => {
                                  setDraggingJobId(null);
                                  setHoverCell(null);
                                }}
                                onUpdate={updateTransportJob}
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
        </div>

        {editorOpen && editorJob ? (
          <div style={drawerBackdrop} onClick={() => setEditorOpen(false)}>
            <div style={drawerPanel} onClick={(e) => e.stopPropagation()}>
              <div style={drawerHeader}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 22 }}>
                    {editorJob.transport_number ?? "Transport Job"}
                  </h3>
                  <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
                    Quick edit panel
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  style={closeBtn}
                >
                  Close
                </button>
              </div>

              <form onSubmit={saveEditor} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                <div style={drawerGrid}>
                  <Field label="Date" name="transport_date" type="date" defaultValue={editorJob.transport_date ?? ""} />
                  <Field label="Collection time" name="collection_time" type="time" defaultValue={editorJob.collection_time ?? ""} />
                  <Field label="Delivery time" name="delivery_time" type="time" defaultValue={editorJob.delivery_time ?? ""} />

                  <SelectField
                    label="Driver"
                    name="operator_id"
                    defaultValue={editorJob.operator_id ?? ""}
                    options={[
                      { value: "", label: "— Unassigned —" },
                      ...lookupOperators.map((o) => ({
                        value: o.id,
                        label: o.full_name ?? "Operator",
                      })),
                    ]}
                  />

                  <SelectField
                    label="Vehicle"
                    name="vehicle_id"
                    defaultValue={editorJob.vehicle_id ?? ""}
                    options={[
                      { value: "", label: "— Unassigned —" },
                      ...lookupVehicles.map((v) => ({
                        value: v.id,
                        label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
                      })),
                    ]}
                  />

                  <SelectField
                    label="Status"
                    name="status"
                    defaultValue={editorJob.status ?? "planned"}
                    options={[
                      { value: "planned", label: "planned" },
                      { value: "confirmed", label: "confirmed" },
                      { value: "in_progress", label: "in_progress" },
                      { value: "completed", label: "completed" },
                      { value: "cancelled", label: "cancelled" },
                    ]}
                  />
                </div>

                <TextAreaField
                  label="Collection address"
                  name="collection_address"
                  defaultValue={editorJob.collection_address ?? ""}
                  rows={3}
                />

                <TextAreaField
                  label="Delivery address"
                  name="delivery_address"
                  defaultValue={editorJob.delivery_address ?? ""}
                  rows={3}
                />

                <TextAreaField
                  label="Load description"
                  name="load_description"
                  defaultValue={editorJob.load_description ?? ""}
                  rows={3}
                />

                <TextAreaField
                  label="Notes"
                  name="notes"
                  defaultValue={editorJob.notes ?? ""}
                  rows={4}
                />

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="submit" style={primaryDrawerBtn} disabled={editorSaving}>
                    {editorSaving ? "Saving..." : "Save changes"}
                  </button>

                  <a href={`/transport-jobs/${editorJob.id}`} style={secondaryDrawerLink}>
                    Open full job
                  </a>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </ClientShell>
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
  warnings,
  onDragStart,
  onDragEnd,
  onUpdate,
  onOpenQuickEdit,
}: {
  job: PlannerTransportJob;
  vehicleOptions: Array<{ value: string; label: string }>;
  saving: boolean;
  dragging: boolean;
  compact?: boolean;
  warnings: string[];
  onDragStart: () => void;
  onDragEnd: () => void;
  onUpdate: (jobId: string, update: Record<string, any>) => Promise<void>;
  onOpenQuickEdit: () => void;
}) {
  const client = first(job.clients);
  const vehicle = first(job.vehicles);
  const operator = first(job.operators);
  const linkedJob = first(job.jobs);
  const colorStyle = jobCardColor(job.status);
  const stripe = statusStripe(job.status);

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
        ...colorStyle,
        opacity: dragging ? 0.55 : 1,
        cursor: "grab",
        padding: compact ? 8 : 12,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          borderTopLeftRadius: 9,
          borderBottomLeftRadius: 9,
          background: stripe,
        }}
      />

      <div style={{ display: "grid", gap: 4, paddingLeft: 4 }}>
        <button
          type="button"
          onClick={onOpenQuickEdit}
          style={titleBtn}
        >
          {job.transport_number ?? "Transport Job"}
        </button>

        <div style={{ fontSize: 11, opacity: 0.8, lineHeight: 1.2 }}>
          {client?.company_name ?? "Customer"}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2 }}>
          {prettyJobType(job.job_type)}
        </div>

        <div style={{ fontSize: 11, opacity: 0.75 }}>
          {job.collection_time ?? "—"} → {job.delivery_time ?? "—"}
        </div>

        <div style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.3 }}>
          Pickup: {job.collection_address ?? "—"}
        </div>

        <div style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.3 }}>
          Delivery: {job.delivery_address ?? "—"}
        </div>

        <div style={{ fontSize: 10, opacity: 0.75 }}>
          Driver: {operator?.full_name ?? "—"}
        </div>

        <div style={{ fontSize: 11, fontWeight: 700 }}>
          {prettyStatus(job.status)}
        </div>

        {warnings.length > 0 ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {warnings.map((warning) => (
              <span
                key={`${job.id}-${warning}`}
                style={
                  warning.toLowerCase().includes("conflict")
                    ? conflictChipStyle
                    : warningChipStyle
                }
              >
                {warning}
              </span>
            ))}
          </div>
        ) : null}

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

        <div style={{ fontSize: 10, opacity: 0.68 }}>
          Vehicle: {vehicle?.name ?? "Unassigned"}
        </div>

        <div style={{ fontSize: 10, opacity: 0.68 }}>
          Crane Job: {linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}
        </div>
      </div>
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
      <input name={name} defaultValue={defaultValue} type={type} style={drawerInput} />
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
      <select name={name} defaultValue={defaultValue} style={drawerInput}>
        {options.map((o) => (
          <option key={`${name}-${o.value}`} value={o.value}>
            {o.label}
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
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        style={drawerTextarea}
      />
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
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const legendWrap: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const legendItem: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 11,
  fontWeight: 800,
};

const toolbarActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const boardShellStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const boardScrollerStyle: React.CSSProperties = {
  overflowX: "auto",
};

const weekHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "175px repeat(7, minmax(165px, 1fr))",
  gap: 10,
  marginBottom: 10,
  minWidth: 1360,
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "175px repeat(7, minmax(165px, 1fr))",
  gap: 10,
  marginBottom: 10,
  minWidth: 1360,
};

const nameColHeaderStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
  fontSize: 13,
};

const dayHeaderStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
  textAlign: "center",
  fontSize: 13,
};

const nameCellStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  alignSelf: "stretch",
  minHeight: 110,
};

const cellStyle: React.CSSProperties = {
  minHeight: 110,
  padding: 6,
  borderRadius: 10,
  background: "rgba(255,255,255,0.34)",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "grid",
  gap: 6,
  alignContent: "start",
};

const activeCellStyle: React.CSSProperties = {
  outline: "2px dashed rgba(0,120,255,0.55)",
  background: "rgba(225,238,255,0.65)",
};

const jobCardStyle: React.CSSProperties = {
  borderRadius: 9,
  boxShadow: "0 3px 10px rgba(0,0,0,0.05)",
};

const inputStyle: React.CSSProperties = {
  width: 140,
  height: 38,
  padding: "0 10px",
  borderRadius: 9,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
  fontSize: 13,
};

const miniInputStyle: React.CSSProperties = {
  width: "100%",
  height: 28,
  padding: "0 8px",
  borderRadius: 7,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  boxSizing: "border-box",
  fontSize: 11,
};

const secondaryBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 9,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.70)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

const primaryLinkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 9,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  fontSize: 12,
};

const miniLinkStyle: React.CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
  fontSize: 11,
};

const titleBtn: React.CSSProperties = {
  display: "block",
  padding: 0,
  margin: 0,
  background: "transparent",
  border: "none",
  textAlign: "left",
  fontWeight: 1000,
  fontSize: 12,
  lineHeight: 1.2,
  cursor: "pointer",
  color: "#111",
};

const emptyMiniStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.5,
  padding: 4,
};

const infoBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,170,0,0.14)",
  border: "1px solid rgba(255,170,0,0.24)",
  fontWeight: 800,
  fontSize: 13,
};

const warningChipStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 7px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  background: "rgba(255,170,0,0.16)",
  border: "1px solid rgba(255,170,0,0.25)",
  color: "#8a5200",
};

const conflictChipStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 7px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  background: "rgba(255,0,0,0.12)",
  border: "1px solid rgba(255,0,0,0.22)",
  color: "#b00020",
};

const drawerBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.32)",
  zIndex: 1000,
  display: "flex",
  justifyContent: "flex-end",
};

const drawerPanel: React.CSSProperties = {
  width: "min(560px, 96vw)",
  height: "100vh",
  background: "#f6f8fb",
  padding: 18,
  boxSizing: "border-box",
  overflowY: "auto",
  boxShadow: "-8px 0 30px rgba(0,0,0,0.18)",
};

const drawerHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const closeBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 9,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const drawerGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.8,
};

const drawerInput: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  boxSizing: "border-box",
};

const drawerTextarea: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  boxSizing: "border-box",
  resize: "vertical",
};

const primaryDrawerBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryDrawerLink: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};
