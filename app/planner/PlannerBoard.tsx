"use client";

import { useEffect, useMemo, useState } from "react";

type PlannerItem = {
  id: string;
  allocation_id: string | null;
  job_id: string;
  job_number?: string | null;
  job_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  operator_id?: string | null;
  equipment_id?: string | null;
  source_type?: string | null;
  item_name?: string | null;
  clients?: { company_name?: string | null } | { company_name?: string | null }[] | null;
  operators?: { id?: string; full_name?: string | null } | { id?: string; full_name?: string | null }[] | null;
  equipment?: { id?: string; name?: string | null; asset_number?: string | null } | { id?: string; name?: string | null; asset_number?: string | null }[] | null;
};

type PlannerPerson = {
  id: string;
  full_name?: string | null;
  status?: string | null;
};

type PlannerEquipment = {
  id: string;
  name?: string | null;
  asset_number?: string | null;
  status?: string | null;
};

type PlannerDay = {
  date: string;
  label: string;
};

type PlannerMode = "operator" | "equipment";

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function compactStatus(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "in_progress") return "LIVE";
  if (v === "completed") return "DONE";
  if (v === "confirmed") return "CONF";
  if (v === "cancelled") return "CANC";
  if (v === "draft") return "DRAFT";
  return String(value ?? "—").toUpperCase();
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

function timeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const m = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function rangesOverlap(
  startA: string | null | undefined,
  endA: string | null | undefined,
  startB: string | null | undefined,
  endB: string | null | undefined
) {
  const a1 = timeToMinutes(startA);
  const a2 = timeToMinutes(endA);
  const b1 = timeToMinutes(startB);
  const b2 = timeToMinutes(endB);

  if (a1 == null || a2 == null || b1 == null || b2 == null) return false;
  return a1 < b2 && b1 < a2;
}

function statusCardStyle(status: string | null | undefined): React.CSSProperties {
  const v = String(status ?? "").toLowerCase();

  if (v === "confirmed") {
    return {
      background: "rgba(0,180,120,0.12)",
      border: "1px solid rgba(0,180,120,0.24)",
    };
  }

  if (v === "in_progress") {
    return {
      background: "rgba(255,170,0,0.14)",
      border: "1px solid rgba(255,170,0,0.28)",
    };
  }

  if (v === "draft") {
    return {
      background: "rgba(0,120,255,0.10)",
      border: "1px solid rgba(0,120,255,0.22)",
    };
  }

  if (v === "completed") {
    return {
      background: "rgba(120,120,120,0.10)",
      border: "1px solid rgba(120,120,120,0.20)",
    };
  }

  if (v === "cancelled") {
    return {
      background: "rgba(255,0,0,0.09)",
      border: "1px solid rgba(255,0,0,0.20)",
    };
  }

  return {
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(0,0,0,0.08)",
  };
}

export default function PlannerBoard() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [mode, setMode] = useState<PlannerMode>("operator");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [data, setData] = useState<{
    week_start: string;
    week_end: string;
    days: PlannerDay[];
    items: PlannerItem[];
    operators: PlannerPerson[];
    equipment: PlannerEquipment[];
  }>({
    week_start: "",
    week_end: "",
    days: [],
    items: [],
    operators: [],
    equipment: [],
  });

  async function load() {
    setLoading(true);
    setMsg("");

    try {
      const res = await fetch(`/api/planner/board?date=${selectedDate}`);
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg(json?.error || "Could not load weekly planner.");
        return;
      }

      setData({
        week_start: json?.week_start ?? "",
        week_end: json?.week_end ?? "",
        days: json?.days ?? [],
        items: json?.items ?? [],
        operators: json?.operators ?? [],
        equipment: json?.equipment ?? [],
      });
    } catch {
      setMsg("Could not load weekly planner.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [selectedDate]);

  async function updateItem(item: PlannerItem, update: Record<string, any>) {
    setSavingId(item.id);
    setMsg("");

    try {
      const res = await fetch("/api/planner/board/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allocation_id: item.allocation_id,
          job_id: item.job_id,
          ...update,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg(json?.error || "Could not update planner job.");
        return;
      }

      await load();
    } catch {
      setMsg("Could not update planner job.");
    } finally {
      setSavingId(null);
      setDraggingItemId(null);
      setHoverCell(null);
    }
  }

  function moveWeek(direction: -1 | 1) {
    const base = mondayOf(selectedDate);
    base.setDate(base.getDate() + direction * 7);
    setSelectedDate(isoDate(base));
  }

  const equipmentOptions = useMemo(
    () =>
      data.equipment.map((eq) => ({
        value: eq.id,
        label: `${eq.name ?? "Equipment"}${eq.asset_number ? ` (${eq.asset_number})` : ""}`,
      })),
    [data.equipment]
  );

  const operatorConflictIds = useMemo(() => {
    const ids = new Set<string>();

    for (const item of data.items) {
      if (!item.operator_id || !item.job_date) continue;

      const clashes = data.items.filter(
        (other) =>
          other.id !== item.id &&
          other.operator_id === item.operator_id &&
          other.job_date === item.job_date &&
          rangesOverlap(item.start_time, item.end_time, other.start_time, other.end_time)
      );

      if (clashes.length > 0) {
        ids.add(item.id);
      }
    }

    return ids;
  }, [data.items]);

  const equipmentConflictIds = useMemo(() => {
    const ids = new Set<string>();

    for (const item of data.items) {
      if (!item.equipment_id || !item.job_date) continue;

      const clashes = data.items.filter(
        (other) =>
          other.id !== item.id &&
          other.equipment_id === item.equipment_id &&
          other.job_date === item.job_date &&
          rangesOverlap(item.start_time, item.end_time, other.start_time, other.end_time)
      );

      if (clashes.length > 0) {
        ids.add(item.id);
      }
    }

    return ids;
  }, [data.items]);

  const unassignedByDay = useMemo(() => {
    const map = new Map<string, PlannerItem[]>();
    for (const day of data.days) map.set(day.date, []);

    for (const item of data.items) {
      if (!item.operator_id && item.job_date && map.has(item.job_date)) {
        map.get(item.job_date)!.push(item);
      }
    }

    return map;
  }, [data.days, data.items]);

  const operatorDayMap = useMemo(() => {
    const map = new Map<string, PlannerItem[]>();

    for (const operator of data.operators) {
      for (const day of data.days) {
        map.set(`${operator.id}__${day.date}`, []);
      }
    }

    for (const item of data.items) {
      if (item.operator_id && item.job_date) {
        const key = `${item.operator_id}__${item.job_date}`;
        if (map.has(key)) map.get(key)!.push(item);
      }
    }

    return map;
  }, [data.operators, data.days, data.items]);

  const equipmentDayMap = useMemo(() => {
    const map = new Map<string, PlannerItem[]>();

    for (const eq of data.equipment) {
      for (const day of data.days) {
        map.set(`${eq.id}__${day.date}`, []);
      }
    }

    for (const item of data.items) {
      if (item.equipment_id && item.job_date) {
        const key = `${item.equipment_id}__${item.job_date}`;
        if (map.has(key)) map.get(key)!.push(item);
      }
    }

    return map;
  }, [data.equipment, data.days, data.items]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={toolbarStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Weekly Planner Board</h2>
          <div style={{ marginTop: 4, opacity: 0.72, fontSize: 13 }}>
            Compact weekly view for operators and equipment allocations.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={toggleWrapStyle}>
            <button
              type="button"
              onClick={() => setMode("operator")}
              style={mode === "operator" ? activeToggleBtn : toggleBtn}
            >
              By Operator
            </button>
            <button
              type="button"
              onClick={() => setMode("equipment")}
              style={mode === "equipment" ? activeToggleBtn : toggleBtn}
            >
              By Crane
            </button>
          </div>

          <button type="button" onClick={() => moveWeek(-1)} style={secondaryBtn}>
            ← Prev
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={inputStyle}
          />

          <button type="button" onClick={() => moveWeek(1)} style={secondaryBtn}>
            Next →
          </button>

          <button type="button" onClick={load} style={secondaryBtn}>
            Refresh
          </button>
        </div>
      </div>

      {msg ? <div style={infoBox}>{msg}</div> : null}

      <div style={legendStyle}>
        <span style={{ ...legendPillStyle, background: "rgba(0,180,120,0.12)", border: "1px solid rgba(0,180,120,0.24)" }}>Confirmed</span>
        <span style={{ ...legendPillStyle, background: "rgba(255,170,0,0.14)", border: "1px solid rgba(255,170,0,0.28)" }}>In Progress</span>
        <span style={{ ...legendPillStyle, background: "rgba(0,120,255,0.10)", border: "1px solid rgba(0,120,255,0.22)" }}>Draft</span>
        <span style={{ ...legendPillStyle, background: "rgba(120,120,120,0.10)", border: "1px solid rgba(120,120,120,0.20)" }}>Completed</span>
        <span style={{ ...legendPillStyle, background: "rgba(255,0,0,0.09)", border: "1px solid rgba(255,0,0,0.20)" }}>Cancelled</span>
        <span style={{ ...legendPillStyle, border: "2px solid #7c3aed" }}>Cross hire</span>
        <span style={{ ...legendPillStyle, border: "2px solid #d97706" }}>Conflict</span>
      </div>

      <div style={plannerOuterStyle}>
        {loading ? (
          <div style={loadingStyle}>Loading weekly planner...</div>
        ) : (
          <div style={plannerScrollStyle}>
            <div style={plannerGridStyle}>
              <div style={cornerHeaderStyle}>
                {mode === "operator" ? "Lane" : "Crane"}
              </div>

              {data.days.map((day) => (
                <div key={day.date} style={dayHeaderStyle}>
                  {day.label}
                </div>
              ))}

              {mode === "operator" ? (
                <>
                  <div style={laneHeaderStyle}>
                    <div style={{ fontWeight: 1000 }}>Unassigned</div>
                    <div style={{ fontSize: 11, opacity: 0.68 }}>No operator</div>
                  </div>

                  {data.days.map((day) => {
                    const cellKey = `unassigned__${day.date}`;
                    const items = unassignedByDay.get(day.date) ?? [];

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
                          const itemId = e.dataTransfer.getData("text/plain");
                          const item = data.items.find((x) => x.id === itemId);
                          if (!item) return;
                          await updateItem(item, {
                            operator_id: null,
                            job_date: day.date,
                          });
                        }}
                      >
                        {items.length === 0 ? (
                          <div style={emptyMiniStyle}>—</div>
                        ) : (
                          items.map((item) => (
                            <PlannerCard
                              key={item.id}
                              item={item}
                              equipmentOptions={equipmentOptions}
                              saving={savingId === item.id}
                              dragging={draggingItemId === item.id}
                              operatorConflict={operatorConflictIds.has(item.id)}
                              equipmentConflict={equipmentConflictIds.has(item.id)}
                              onDragStart={() => setDraggingItemId(item.id)}
                              onDragEnd={() => {
                                setDraggingItemId(null);
                                setHoverCell(null);
                              }}
                              onUpdate={updateItem}
                            />
                          ))
                        )}
                      </DropCell>
                    );
                  })}

                  {data.operators.map((operator) => (
                    <OperatorRow
                      key={operator.id}
                      operator={operator}
                      days={data.days}
                      operatorDayMap={operatorDayMap}
                      hoverCell={hoverCell}
                      setHoverCell={setHoverCell}
                      dataItems={data.items}
                      equipmentOptions={equipmentOptions}
                      savingId={savingId}
                      draggingItemId={draggingItemId}
                      setDraggingItemId={setDraggingItemId}
                      updateItem={updateItem}
                      operatorConflictIds={operatorConflictIds}
                      equipmentConflictIds={equipmentConflictIds}
                    />
                  ))}
                </>
              ) : (
                <>
                  {data.equipment.map((eq) => (
                    <EquipmentRow
                      key={eq.id}
                      equipment={eq}
                      days={data.days}
                      equipmentDayMap={equipmentDayMap}
                      hoverCell={hoverCell}
                      setHoverCell={setHoverCell}
                      dataItems={data.items}
                      equipmentOptions={equipmentOptions}
                      savingId={savingId}
                      draggingItemId={draggingItemId}
                      setDraggingItemId={setDraggingItemId}
                      updateItem={updateItem}
                      operatorConflictIds={operatorConflictIds}
                      equipmentConflictIds={equipmentConflictIds}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OperatorRow({
  operator,
  days,
  operatorDayMap,
  hoverCell,
  setHoverCell,
  dataItems,
  equipmentOptions,
  savingId,
  draggingItemId,
  setDraggingItemId,
  updateItem,
  operatorConflictIds,
  equipmentConflictIds,
}: {
  operator: PlannerPerson;
  days: PlannerDay[];
  operatorDayMap: Map<string, PlannerItem[]>;
  hoverCell: string | null;
  setHoverCell: React.Dispatch<React.SetStateAction<string | null>>;
  dataItems: PlannerItem[];
  equipmentOptions: Array<{ value: string; label: string }>;
  savingId: string | null;
  draggingItemId: string | null;
  setDraggingItemId: React.Dispatch<React.SetStateAction<string | null>>;
  updateItem: (item: PlannerItem, update: Record<string, any>) => Promise<void>;
  operatorConflictIds: Set<string>;
  equipmentConflictIds: Set<string>;
}) {
  return (
    <>
      <div style={laneHeaderStyle}>
        <div style={{ fontWeight: 1000 }}>{operator.full_name ?? "Operator"}</div>
        <div style={{ fontSize: 11, opacity: 0.68 }}>Assigned</div>
      </div>

      {days.map((day) => {
        const cellKey = `${operator.id}__${day.date}`;
        const items = operatorDayMap.get(cellKey) ?? [];

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
              const itemId = e.dataTransfer.getData("text/plain");
              const item = dataItems.find((x) => x.id === itemId);
              if (!item) return;
              await updateItem(item, {
                operator_id: operator.id,
                job_date: day.date,
              });
            }}
          >
            {items.length === 0 ? (
              <div style={emptyMiniStyle}>—</div>
            ) : (
              items.map((item) => (
                <PlannerCard
                  key={item.id}
                  item={item}
                  equipmentOptions={equipmentOptions}
                  saving={savingId === item.id}
                  dragging={draggingItemId === item.id}
                  operatorConflict={operatorConflictIds.has(item.id)}
                  equipmentConflict={equipmentConflictIds.has(item.id)}
                  onDragStart={() => setDraggingItemId(item.id)}
                  onDragEnd={() => {
                    setDraggingItemId(null);
                    setHoverCell(null);
                  }}
                  onUpdate={updateItem}
                />
              ))
            )}
          </DropCell>
        );
      })}
    </>
  );
}

function EquipmentRow({
  equipment,
  days,
  equipmentDayMap,
  hoverCell,
  setHoverCell,
  dataItems,
  equipmentOptions,
  savingId,
  draggingItemId,
  setDraggingItemId,
  updateItem,
  operatorConflictIds,
  equipmentConflictIds,
}: {
  equipment: PlannerEquipment;
  days: PlannerDay[];
  equipmentDayMap: Map<string, PlannerItem[]>;
  hoverCell: string | null;
  setHoverCell: React.Dispatch<React.SetStateAction<string | null>>;
  dataItems: PlannerItem[];
  equipmentOptions: Array<{ value: string; label: string }>;
  savingId: string | null;
  draggingItemId: string | null;
  setDraggingItemId: React.Dispatch<React.SetStateAction<string | null>>;
  updateItem: (item: PlannerItem, update: Record<string, any>) => Promise<void>;
  operatorConflictIds: Set<string>;
  equipmentConflictIds: Set<string>;
}) {
  return (
    <>
      <div style={laneHeaderStyle}>
        <div style={{ fontWeight: 1000 }}>
          {equipment.name ?? "Equipment"}
        </div>
        <div style={{ fontSize: 11, opacity: 0.68 }}>
          {equipment.asset_number ?? "No asset"}
        </div>
      </div>

      {days.map((day) => {
        const cellKey = `${equipment.id}__${day.date}`;
        const items = equipmentDayMap.get(cellKey) ?? [];

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
              const itemId = e.dataTransfer.getData("text/plain");
              const item = dataItems.find((x) => x.id === itemId);
              if (!item) return;
              await updateItem(item, {
                equipment_id: equipment.id,
                job_date: day.date,
              });
            }}
          >
            {items.length === 0 ? (
              <div style={emptyMiniStyle}>—</div>
            ) : (
              items.map((item) => (
                <PlannerCard
                  key={item.id}
                  item={item}
                  equipmentOptions={equipmentOptions}
                  saving={savingId === item.id}
                  dragging={draggingItemId === item.id}
                  operatorConflict={operatorConflictIds.has(item.id)}
                  equipmentConflict={equipmentConflictIds.has(item.id)}
                  onDragStart={() => setDraggingItemId(item.id)}
                  onDragEnd={() => {
                    setDraggingItemId(null);
                    setHoverCell(null);
                  }}
                  onUpdate={updateItem}
                />
              ))
            )}
          </DropCell>
        );
      })}
    </>
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

function PlannerCard({
  item,
  equipmentOptions,
  saving,
  dragging,
  operatorConflict,
  equipmentConflict,
  onDragStart,
  onDragEnd,
  onUpdate,
}: {
  item: PlannerItem;
  equipmentOptions: Array<{ value: string; label: string }>;
  saving: boolean;
  dragging: boolean;
  operatorConflict: boolean;
  equipmentConflict: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onUpdate: (item: PlannerItem, update: Record<string, any>) => Promise<void>;
}) {
  const client = first(item.clients);
  const equipment = first(item.equipment);

  const itemLabel =
    item.item_name ||
    equipment?.name ||
    (item.source_type === "cross_hire" ? "Cross hire" : "Equipment");

  const isCrossHire = item.source_type === "cross_hire";
  const hasConflict = operatorConflict || equipmentConflict;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      style={{
        ...jobCardStyle,
        ...statusCardStyle(item.status),
        ...(isCrossHire ? crossHireCardStyle : {}),
        ...(hasConflict ? conflictCardStyle : {}),
        opacity: dragging ? 0.55 : 1,
        cursor: "grab",
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "start" }}>
          <div style={{ fontWeight: 1000, fontSize: 13 }}>
            Job #{item.job_number ?? "—"}
          </div>
          <div style={statusBadgeStyle}>{compactStatus(item.status)}</div>
        </div>

        <div style={smallText}>{client?.company_name ?? "Customer"}</div>

        <div style={{ ...smallText, fontWeight: 800 }}>
          {itemLabel}
          {equipment?.asset_number ? ` (${equipment.asset_number})` : ""}
        </div>

        <div style={smallText}>
          {item.start_time ?? "—"} - {item.end_time ?? "—"}
        </div>

        <div style={smallText}>{item.site_name ?? "No site"}</div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {isCrossHire ? <span style={miniTagPurple}>Cross hire</span> : <span style={miniTagGrey}>Owned</span>}
          {operatorConflict ? <span style={miniTagWarn}>Operator clash</span> : null}
          {equipmentConflict ? <span style={miniTagWarn}>Crane clash</span> : null}
        </div>

        <select
          value={item.equipment_id ?? ""}
          onChange={(e) => onUpdate(item, { equipment_id: e.target.value || null })}
          disabled={saving}
          style={miniInputStyle}
        >
          <option value="">Crane</option>
          {equipmentOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={item.status ?? ""}
          onChange={(e) => onUpdate(item, { status: e.target.value })}
          disabled={saving}
          style={miniInputStyle}
        >
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <a href={`/jobs/${item.job_id}`} style={miniLinkStyle}>
          Open
        </a>
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
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const toggleWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  borderRadius: 10,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.5)",
};

const toggleBtn: React.CSSProperties = {
  padding: "8px 12px",
  border: "none",
  background: "transparent",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const activeToggleBtn: React.CSSProperties = {
  ...toggleBtn,
  background: "#111",
  color: "#fff",
};

const legendStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const legendPillStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: "rgba(255,255,255,0.6)",
};

const plannerOuterStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  height: "calc(100vh - 205px)",
  minHeight: 540,
};

const plannerScrollStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "auto",
};

const plannerGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "160px repeat(7, minmax(170px, 1fr))",
  gap: 8,
  minWidth: 1380,
  alignItems: "start",
};

const cornerHeaderStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  left: 0,
  zIndex: 5,
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
};

const dayHeaderStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 4,
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
  textAlign: "center",
  fontSize: 13,
};

const laneHeaderStyle: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 3,
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.08)",
  minHeight: 88,
};

const cellStyle: React.CSSProperties = {
  minHeight: 88,
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
  padding: 8,
};

const crossHireCardStyle: React.CSSProperties = {
  border: "2px solid #7c3aed",
};

const conflictCardStyle: React.CSSProperties = {
  boxShadow: "0 0 0 2px rgba(217,119,6,0.75)",
};

const statusBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  padding: "3px 6px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.7)",
};

const inputStyle: React.CSSProperties = {
  width: 150,
  height: 36,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
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
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.70)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const miniLinkStyle: React.CSSProperties = {
  display: "inline-block",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
  fontSize: 11,
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
};

const loadingStyle: React.CSSProperties = {
  height: "100%",
  display: "grid",
  placeItems: "center",
  fontWeight: 800,
};

const smallText: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.25,
  opacity: 0.82,
};

const miniTagPurple: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  padding: "2px 6px",
  borderRadius: 999,
  background: "rgba(124,58,237,0.12)",
  color: "#6d28d9",
  border: "1px solid rgba(124,58,237,0.26)",
};

const miniTagGrey: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  padding: "2px 6px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.05)",
  color: "#444",
  border: "1px solid rgba(0,0,0,0.10)",
};

const miniTagWarn: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  padding: "2px 6px",
  borderRadius: 999,
  background: "rgba(217,119,6,0.12)",
  color: "#b45309",
  border: "1px solid rgba(217,119,6,0.28)",
};
