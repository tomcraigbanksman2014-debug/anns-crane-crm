"use client";

import { useEffect, useMemo, useState } from "react";

type PlannerJob = {
  id: string;
  job_number?: string | null;
  job_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  operator_id?: string | null;
  equipment_id?: string | null;
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

function prettyStatus(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "in_progress") return "In Progress";
  if (v === "completed") return "Completed";
  if (v === "confirmed") return "Confirmed";
  if (v === "cancelled") return "Cancelled";
  if (v === "draft") return "Draft";
  return value ?? "—";
}

export default function PlannerBoard() {
  const [date, setDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [data, setData] = useState<{
    unassigned: PlannerJob[];
    assigned: PlannerJob[];
    operators: PlannerPerson[];
    equipment: PlannerEquipment[];
  }>({
    unassigned: [],
    assigned: [],
    operators: [],
    equipment: [],
  });

  async function load() {
    setLoading(true);
    setMsg("");

    try {
      const res = await fetch(`/api/planner/board?date=${date}`);
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg(json?.error || "Could not load planner board.");
        return;
      }

      setData({
        unassigned: json?.unassigned ?? [],
        assigned: json?.assigned ?? [],
        operators: json?.operators ?? [],
        equipment: json?.equipment ?? [],
      });
    } catch {
      setMsg("Could not load planner board.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [date]);

  async function updateJob(jobId: string, update: Record<string, any>) {
    setSavingId(jobId);
    setMsg("");

    try {
      const res = await fetch("/api/planner/board/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
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
    }
  }

  const operatorMap = useMemo(() => {
    return new Map(data.operators.map((o) => [o.id, o]));
  }, [data.operators]);

  const equipmentMap = useMemo(() => {
    return new Map(data.equipment.map((e) => [e.id, e]));
  }, [data.equipment]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={toolbarStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24 }}>Planner Board</h2>
          <div style={{ marginTop: 4, opacity: 0.75 }}>
            Assign cranes and operators for the selected day.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />

          <button type="button" onClick={load} style={secondaryBtn}>
            Refresh
          </button>
        </div>
      </div>

      {msg ? <div style={infoBox}>{msg}</div> : null}

      <section style={panelStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <div style={sectionTitleStyle}>Unassigned / Needs Attention</div>
            <div style={sectionSubStyle}>
              Jobs missing operator or crane.
            </div>
          </div>
          <div style={countPill}>{data.unassigned.length}</div>
        </div>

        {loading ? (
          <div style={emptyStyle}>Loading planner...</div>
        ) : data.unassigned.length === 0 ? (
          <div style={emptyStyle}>No unassigned jobs for this day.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {data.unassigned.map((job) => {
              const client = first(job.clients);
              const jobOperator = first(job.operators);
              const jobEquipment = first(job.equipment);

              return (
                <div key={job.id} style={jobCardStyle}>
                  <div style={jobTopStyle}>
                    <div>
                      <div style={{ fontWeight: 1000, fontSize: 18 }}>
                        Job #{job.job_number ?? "—"}
                      </div>
                      <div style={{ marginTop: 4, opacity: 0.78 }}>
                        {client?.company_name ?? "Customer"} • {job.site_name ?? "No site"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                        {job.start_time ?? "—"} - {job.end_time ?? "—"} • {prettyStatus(job.status)}
                      </div>
                    </div>

                    <a href={`/jobs/${job.id}`} style={linkBtn}>
                      Open job
                    </a>
                  </div>

                  <div style={plannerGridStyle}>
                    <SelectBox
                      label="Operator"
                      value={job.operator_id ?? ""}
                      options={data.operators.map((op) => ({
                        value: op.id,
                        label: op.full_name ?? "Unnamed operator",
                      }))}
                      onChange={(value) => updateJob(job.id, { operator_id: value || null })}
                      disabled={savingId === job.id}
                    />

                    <SelectBox
                      label="Crane / Equipment"
                      value={job.equipment_id ?? ""}
                      options={data.equipment.map((eq) => ({
                        value: eq.id,
                        label: `${eq.name ?? "Equipment"}${eq.asset_number ? ` (${eq.asset_number})` : ""}`,
                      }))}
                      onChange={(value) => updateJob(job.id, { equipment_id: value || null })}
                      disabled={savingId === job.id}
                    />

                    <FieldBox
                      label="Planned date"
                      value={job.job_date ?? date}
                      type="date"
                      onChange={(value) => updateJob(job.id, { job_date: value })}
                      disabled={savingId === job.id}
                    />

                    <SelectBox
                      label="Status"
                      value={job.status ?? ""}
                      options={[
                        { value: "draft", label: "Draft" },
                        { value: "confirmed", label: "Confirmed" },
                        { value: "in_progress", label: "In Progress" },
                        { value: "completed", label: "Completed" },
                        { value: "cancelled", label: "Cancelled" },
                      ]}
                      onChange={(value) => updateJob(job.id, { status: value })}
                      disabled={savingId === job.id}
                    />
                  </div>

                  <div style={currentRowStyle}>
                    <div><strong>Current operator:</strong> {jobOperator?.full_name ?? "Unassigned"}</div>
                    <div><strong>Current crane:</strong> {jobEquipment?.name ?? "Unassigned"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={panelStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <div style={sectionTitleStyle}>Assigned Jobs</div>
            <div style={sectionSubStyle}>
              Live dispatch board for the selected day.
            </div>
          </div>
          <div style={countPill}>{data.assigned.length}</div>
        </div>

        {loading ? (
          <div style={emptyStyle}>Loading planner...</div>
        ) : data.assigned.length === 0 ? (
          <div style={emptyStyle}>No assigned jobs for this day.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {data.assigned.map((job) => {
              const client = first(job.clients);
              const jobOperator = job.operator_id ? operatorMap.get(job.operator_id) : null;
              const jobEquipment = job.equipment_id ? equipmentMap.get(job.equipment_id) : null;

              return (
                <div key={job.id} style={jobCardStyle}>
                  <div style={jobTopStyle}>
                    <div>
                      <div style={{ fontWeight: 1000, fontSize: 18 }}>
                        Job #{job.job_number ?? "—"}
                      </div>
                      <div style={{ marginTop: 4, opacity: 0.78 }}>
                        {client?.company_name ?? "Customer"} • {job.site_name ?? "No site"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                        {job.start_time ?? "—"} - {job.end_time ?? "—"} • {prettyStatus(job.status)}
                      </div>
                    </div>

                    <a href={`/jobs/${job.id}`} style={linkBtn}>
                      Open job
                    </a>
                  </div>

                  <div style={assignedSummaryStyle}>
                    <div style={assignedPillGood}>
                      Operator: {jobOperator?.full_name ?? "Unassigned"}
                    </div>
                    <div style={assignedPillNeutral}>
                      Crane: {jobEquipment?.name ?? "Unassigned"}
                    </div>
                  </div>

                  <div style={plannerGridStyle}>
                    <SelectBox
                      label="Reassign operator"
                      value={job.operator_id ?? ""}
                      options={data.operators.map((op) => ({
                        value: op.id,
                        label: op.full_name ?? "Unnamed operator",
                      }))}
                      onChange={(value) => updateJob(job.id, { operator_id: value || null })}
                      disabled={savingId === job.id}
                    />

                    <SelectBox
                      label="Reassign crane"
                      value={job.equipment_id ?? ""}
                      options={data.equipment.map((eq) => ({
                        value: eq.id,
                        label: `${eq.name ?? "Equipment"}${eq.asset_number ? ` (${eq.asset_number})` : ""}`,
                      }))}
                      onChange={(value) => updateJob(job.id, { equipment_id: value || null })}
                      disabled={savingId === job.id}
                    />

                    <FieldBox
                      label="Move date"
                      value={job.job_date ?? date}
                      type="date"
                      onChange={(value) => updateJob(job.id, { job_date: value })}
                      disabled={savingId === job.id}
                    />

                    <SelectBox
                      label="Status"
                      value={job.status ?? ""}
                      options={[
                        { value: "draft", label: "Draft" },
                        { value: "confirmed", label: "Confirmed" },
                        { value: "in_progress", label: "In Progress" },
                        { value: "completed", label: "Completed" },
                        { value: "cancelled", label: "Cancelled" },
                      ]}
                      onChange={(value) => updateJob(job.id, { status: value })}
                      disabled={savingId === job.id}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SelectBox({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={inputStyle}
      >
        <option value="">— Select —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldBox({
  label,
  value,
  onChange,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={inputStyle}
      />
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

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 14,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 1000,
};

const sectionSubStyle: React.CSSProperties = {
  marginTop: 4,
  opacity: 0.72,
  fontSize: 14,
};

const countPill: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
};

const emptyStyle: React.CSSProperties = {
  padding: "16px 0",
  opacity: 0.62,
};

const jobCardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "grid",
  gap: 14,
};

const jobTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const plannerGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const currentRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 18,
  flexWrap: "wrap",
  fontSize: 14,
  opacity: 0.82,
};

const assignedSummaryStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const assignedPillGood: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.20)",
  fontWeight: 800,
};

const assignedPillNeutral: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
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

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 800,
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

const linkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.70)",
  color: "#111",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
};

const infoBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,170,0,0.14)",
  border: "1px solid rgba(255,170,0,0.24)",
  fontWeight: 800,
};
