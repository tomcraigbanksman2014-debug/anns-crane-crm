import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import PlannerAssignSelect from "./PlannerAssignSelect";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function statusStyle(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "draft") {
    return {
      background: "rgba(120,120,120,0.12)",
      color: "#555",
      border: "1px solid rgba(120,120,120,0.18)",
    };
  }

  if (s === "confirmed") {
    return {
      background: "rgba(0,120,255,0.12)",
      color: "#0b57d0",
      border: "1px solid rgba(0,120,255,0.20)",
    };
  }

  if (s === "in_progress") {
    return {
      background: "rgba(255,140,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,140,0,0.22)",
    };
  }

  if (s === "completed") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (s === "cancelled") {
    return {
      background: "rgba(255,0,0,0.10)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.18)",
    };
  }

  return {
    background: "rgba(255,255,255,0.35)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function PlannerPage() {
  const supabase = createSupabaseServerClient();

  const [
    { data: jobs, error: jobsError },
    { data: equipment, error: equipmentError },
    { data: operators, error: operatorsError },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        job_date,
        start_time,
        end_time,
        status,
        site_name,
        site_address,
        equipment_id,
        operator_id,
        clients:client_id (
          company_name
        ),
        equipment:equipment_id (
          id,
          name
        ),
        operators:operator_id (
          id,
          full_name,
          status
        )
      `)
      .in("status", ["draft", "confirmed", "in_progress"])
      .order("job_date", { ascending: true })
      .order("start_time", { ascending: true }),

    supabase
      .from("equipment")
      .select("id, name, status")
      .order("name", { ascending: true }),

    supabase
      .from("operators")
      .select("id, full_name, status")
      .eq("status", "active")
      .order("full_name", { ascending: true }),
  ]);

  const jobsList = jobs ?? [];
  const equipmentList = equipment ?? [];
  const operatorsList = operators ?? [];

  const groupedJobs = jobsList.reduce((acc: Record<string, any[]>, job: any) => {
    const key = String(job.job_date ?? "No date");
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedJobs).sort((a, b) => a.localeCompare(b));

  // Crane assignment counts by date + equipment
  const equipmentAssignmentCounts: Record<string, number> = {};
  for (const job of jobsList) {
    const date = String(job.job_date ?? "");
    const equipmentId = String(job.equipment_id ?? "");
    if (!date || !equipmentId) continue;

    const key = `${date}__${equipmentId}`;
    equipmentAssignmentCounts[key] = (equipmentAssignmentCounts[key] ?? 0) + 1;
  }

  // Operator assignment counts by date + operator
  const operatorAssignmentCounts: Record<string, number> = {};
  for (const job of jobsList) {
    const date = String(job.job_date ?? "");
    const operatorId = String(job.operator_id ?? "");
    if (!date || !operatorId) continue;

    const key = `${date}__${operatorId}`;
    operatorAssignmentCounts[key] = (operatorAssignmentCounts[key] ?? 0) + 1;
  }

  function hasEquipmentDoubleBooking(job: any) {
    const date = String(job.job_date ?? "");
    const equipmentId = String(job.equipment_id ?? "");
    if (!date || !equipmentId) return false;

    const key = `${date}__${equipmentId}`;
    return (equipmentAssignmentCounts[key] ?? 0) > 1;
  }

  function hasOperatorDoubleBooking(job: any) {
    const date = String(job.job_date ?? "");
    const operatorId = String(job.operator_id ?? "");
    if (!date || !operatorId) return false;

    const key = `${date}__${operatorId}`;
    return (operatorAssignmentCounts[key] ?? 0) > 1;
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1320px, 96vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Planner</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Dispatch cranes and operators to live jobs.
            </p>
          </div>

          <a href="/jobs" style={btnStyle}>
            Open jobs
          </a>
        </div>

        {(jobsError || equipmentError || operatorsError) && (
          <div style={errorBox}>
            {jobsError?.message || equipmentError?.message || operatorsError?.message}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "1.3fr 0.9fr",
            gap: 18,
            alignItems: "start",
          }}
        >
          <section style={cardStyle}>
            <h2 style={sectionTitle}>Dispatch board</h2>

            {sortedDates.length === 0 ? (
              <p style={{ margin: 0 }}>No open jobs to dispatch.</p>
            ) : (
              <div style={{ display: "grid", gap: 18 }}>
                {sortedDates.map((dateKey) => (
                  <div key={dateKey}>
                    <div style={dateHeading}>{fmtDate(dateKey)}</div>

                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      {groupedJobs[dateKey].map((job: any) => {
                        const client = first(job.clients);
                        const assignedEquipment = first(job.equipment);
                        const assignedOperator = first(job.operators);

                        const equipmentConflict = hasEquipmentDoubleBooking(job);
                        const operatorConflict = hasOperatorDoubleBooking(job);

                        return (
                          <div
                            key={job.id}
                            style={{
                              ...jobCardStyle,
                              border:
                                equipmentConflict || operatorConflict
                                  ? "1px solid rgba(255,0,0,0.25)"
                                  : jobCardStyle.border,
                              background:
                                equipmentConflict || operatorConflict
                                  ? "rgba(255,0,0,0.05)"
                                  : jobCardStyle.background,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                alignItems: "flex-start",
                                flexWrap: "wrap",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 900, fontSize: 16 }}>
                                  Job #{job.job_number ?? "—"} •{" "}
                                  {client?.company_name ?? "No customer"}
                                </div>

                                <div style={mutedText}>
                                  {job.start_time || job.end_time
                                    ? `${job.start_time ?? "—"} - ${job.end_time ?? "—"}`
                                    : "No time set"}
                                </div>

                                <div style={mutedText}>
                                  {job.site_name ?? job.site_address ?? "No site"}
                                </div>

                                <div style={{ marginTop: 8 }}>
                                  <strong>Current crane:</strong>{" "}
                                  {assignedEquipment?.name ?? "Not assigned"}
                                </div>

                                <div style={{ marginTop: 6 }}>
                                  <strong>Current operator:</strong>{" "}
                                  {assignedOperator?.full_name ?? "Not assigned"}
                                </div>

                                {equipmentConflict ? (
                                  <div style={warningBox}>
                                    ⚠ This crane is assigned to more than one job on{" "}
                                    {fmtDate(job.job_date)}.
                                  </div>
                                ) : null}

                                {operatorConflict ? (
                                  <div style={warningBox}>
                                    ⚠ This operator is assigned to more than one job on{" "}
                                    {fmtDate(job.job_date)}.
                                  </div>
                                ) : null}
                              </div>

                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 900,
                                  ...statusStyle(job.status),
                                }}
                              >
                                {job.status ?? "—"}
                              </span>
                            </div>

                            <PlannerAssignSelect
                              jobId={job.id}
                              currentValue={job.equipment_id}
                              options={equipmentList}
                              label="Assign crane"
                              field="equipment_id"
                              placeholder="Not assigned"
                            />

                            <PlannerAssignSelect
                              jobId={job.id}
                              currentValue={job.operator_id}
                              options={operatorsList}
                              label="Assign operator"
                              field="operator_id"
                              placeholder="Not assigned"
                            />

                            <div
                              style={{
                                marginTop: 10,
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <a href={`/jobs/${job.id}`} style={smallBtn}>
                                Open job
                              </a>
                              <a href={`/jobs/${job.id}/edit`} style={smallBtn}>
                                Edit job
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>Fleet overview</h2>

            {equipmentList.length === 0 ? (
              <p style={{ margin: 0 }}>No equipment found.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {equipmentList.map((eq: any) => {
                  const assignedJobs = jobsList.filter(
                    (job: any) => job.equipment_id === eq.id
                  );

                  const duplicateDates = assignedJobs.reduce((acc: Record<string, number>, job: any) => {
                    const key = String(job.job_date ?? "");
                    if (!key) return acc;
                    acc[key] = (acc[key] ?? 0) + 1;
                    return acc;
                  }, {});

                  const hasConflict = Object.values(duplicateDates).some((count) => count > 1);

                  return (
                    <div
                      key={eq.id}
                      style={{
                        ...fleetRowStyle,
                        border: hasConflict
                          ? "1px solid rgba(255,0,0,0.25)"
                          : fleetRowStyle.border,
                        background: hasConflict
                          ? "rgba(255,0,0,0.05)"
                          : fleetRowStyle.background,
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>
                        {eq.name ?? "Unnamed crane"}
                      </div>

                      <div style={mutedText}>
                        Status: {eq.status ?? "—"}
                      </div>

                      <div style={{ marginTop: 6, fontSize: 13 }}>
                        <strong>Assigned jobs:</strong> {assignedJobs.length}
                      </div>

                      {hasConflict ? (
                        <div style={warningBox}>
                          ⚠ Double-booked on at least one date.
                        </div>
                      ) : null}

                      <div style={{ marginTop: 8 }}>
                        <a href={`/equipment/${eq.id}`} style={smallBtn}>
                          Open equipment
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <h2 style={sectionTitle}>Operators</h2>

              {operatorsList.length === 0 ? (
                <p style={{ margin: 0 }}>No active operators found.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {operatorsList.map((op: any) => {
                    const assignedJobs = jobsList.filter(
                      (job: any) => job.operator_id === op.id
                    );

                    const duplicateDates = assignedJobs.reduce((acc: Record<string, number>, job: any) => {
                      const key = String(job.job_date ?? "");
                      if (!key) return acc;
                      acc[key] = (acc[key] ?? 0) + 1;
                      return acc;
                    }, {});

                    const hasConflict = Object.values(duplicateDates).some((count) => count > 1);

                    return (
                      <div
                        key={op.id}
                        style={{
                          ...fleetRowStyle,
                          border: hasConflict
                            ? "1px solid rgba(255,0,0,0.25)"
                            : fleetRowStyle.border,
                          background: hasConflict
                            ? "rgba(255,0,0,0.05)"
                            : fleetRowStyle.background,
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>
                          {op.full_name ?? "Unnamed operator"}
                        </div>
                        <div style={mutedText}>Status: {op.status ?? "—"}</div>
                        <div style={{ marginTop: 6, fontSize: 13 }}>
                          <strong>Assigned jobs:</strong> {assignedJobs.length}
                        </div>

                        {hasConflict ? (
                          <div style={warningBox}>
                            ⚠ Double-booked on at least one date.
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </ClientShell>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const dateHeading: React.CSSProperties = {
  fontWeight: 1000,
  fontSize: 18,
};

const jobCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const fleetRowStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const mutedText: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.78,
  marginTop: 4,
};

const warningBox: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.18)",
  color: "#b00020",
  fontSize: 13,
  fontWeight: 700,
};

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const smallBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 9,
  textDecoration: "none",
  background: "rgba(255,255,255,0.52)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
