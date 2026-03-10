import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import OperatorJobActions from "./OperatorJobActions";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
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

export default async function OperatorJobsPage() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>Not signed in.</div>
        </div>
      </ClientShell>
    );
  }

  const authEmail = String(user.email ?? "").trim().toLowerCase();
  const authUsername = authEmail.includes("@")
    ? authEmail.split("@")[0]
    : authEmail;

  const { data: operators, error: operatorsError } = await supabase
    .from("operators")
    .select("id, full_name, email, status")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (operatorsError) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>{operatorsError.message}</div>
        </div>
      </ClientShell>
    );
  }

  const operator =
    (operators ?? []).find((op: any) => {
      const operatorEmail = String(op.email ?? "").trim().toLowerCase();
      const operatorName = String(op.full_name ?? "").trim().toLowerCase();

      return (
        operatorEmail === authEmail ||
        operatorName === authUsername ||
        (!!authUsername && operatorEmail.startsWith(`${authUsername}@`))
      );
    }) ?? null;

  if (!operator) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
          <div style={cardStyle}>
            <h1 style={{ marginTop: 0, fontSize: 32 }}>My Jobs</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              No operator record is linked to your login yet.
            </p>
            <div style={infoBox}>
              Ask an admin to make the operator full name match your username, or
              make the operator email start with your login name.
            </div>

            <div style={debugBox}>
              <div>
                <strong>Detected login email:</strong> {authEmail || "—"}
              </div>
              <div style={{ marginTop: 6 }}>
                <strong>Detected login username:</strong> {authUsername || "—"}
              </div>
            </div>
          </div>
        </div>
      </ClientShell>
    );
  }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const { data: jobs, error: jobsError } = await supabase
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
      contact_name,
      contact_phone,
      notes,
      started_at,
      arrived_on_site_at,
      lift_completed_at,
      completed_at,
      clients:client_id (
        company_name,
        contact_name,
        phone,
        email
      ),
      equipment:equipment_id (
        name,
        asset_number,
        type,
        capacity
      )
    `)
    .eq("operator_id", operator.id)
    .gte("job_date", todayStr)
    .order("job_date", { ascending: true })
    .order("start_time", { ascending: true });

  const jobsList = jobs ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0, fontSize: 32 }}>My Jobs</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Operator: <strong>{operator.full_name}</strong>
          </p>

          {jobsError ? (
            <div style={errorBox}>{jobsError.message}</div>
          ) : jobsList.length === 0 ? (
            <div style={infoBox}>No upcoming jobs assigned.</div>
          ) : (
            <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
              {jobsList.map((job: any) => {
                const client = first(job.clients);
                const equipment = first(job.equipment);

                return (
                  <div key={job.id} style={jobCard}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 1000, fontSize: 18 }}>
                          Job #{job.job_number ?? "—"}
                        </div>
                        <div style={{ marginTop: 4, opacity: 0.78 }}>
                          {fmtDate(job.job_date)}
                        </div>
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
                        {prettyStatus(job.status)}
                      </span>
                    </div>

                    <div style={sectionBlock}>
                      <div style={rowLabel}>Customer</div>
                      <div style={rowValue}>{client?.company_name ?? "—"}</div>
                    </div>

                    <div style={sectionBlock}>
                      <div style={rowLabel}>Crane</div>
                      <div style={rowValue}>
                        {equipment?.name ?? "—"}
                        {equipment?.capacity ? ` • ${equipment.capacity}` : ""}
                      </div>
                    </div>

                    <div style={sectionBlock}>
                      <div style={rowLabel}>Time</div>
                      <div style={rowValue}>
                        {job.start_time || job.end_time
                          ? `${job.start_time ?? "—"} - ${job.end_time ?? "—"}`
                          : "—"}
                      </div>
                    </div>

                    <div style={sectionBlock}>
                      <div style={rowLabel}>Site</div>
                      <div style={rowValue}>
                        {job.site_name ?? "—"}
                        {job.site_address ? (
                          <div style={{ marginTop: 4, fontWeight: 500 }}>
                            {job.site_address}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div style={sectionBlock}>
                      <div style={rowLabel}>Site contact</div>
                      <div style={rowValue}>
                        {job.contact_name ?? "—"}
                        {job.contact_phone ? (
                          <div style={{ marginTop: 4, fontWeight: 500 }}>
                            {job.contact_phone}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div style={sectionBlock}>
                      <div style={rowLabel}>Notes</div>
                      <div style={rowValue}>{job.notes ?? "—"}</div>
                    </div>

                    <div style={timelineBox}>
                      <div style={timelineTitle}>Job activity</div>
                      <div style={timelineRow}>
                        <strong>Started:</strong> {fmtDateTime(job.started_at)}
                      </div>
                      <div style={timelineRow}>
                        <strong>Arrived on site:</strong> {fmtDateTime(job.arrived_on_site_at)}
                      </div>
                      <div style={timelineRow}>
                        <strong>Lift completed:</strong> {fmtDateTime(job.lift_completed_at)}
                      </div>
                      <div style={timelineRow}>
                        <strong>Job completed:</strong> {fmtDateTime(job.completed_at)}
                      </div>
                    </div>

                    <OperatorJobActions jobId={job.id} />

                    <div style={{ marginTop: 12 }}>
                      <a href={`/operator/jobs/${job.id}`} style={openBtn}>
                        Open job sheet
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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

const jobCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const sectionBlock: React.CSSProperties = {
  marginTop: 12,
};

const rowLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.72,
  fontWeight: 800,
};

const rowValue: React.CSSProperties = {
  marginTop: 4,
  fontSize: 15,
  fontWeight: 700,
};

const timelineBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const timelineTitle: React.CSSProperties = {
  fontWeight: 900,
  marginBottom: 8,
};

const timelineRow: React.CSSProperties = {
  fontSize: 14,
  marginTop: 6,
};

const openBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.52)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const infoBox: React.CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontWeight: 700,
};

const debugBox: React.CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
