import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import OperatorTransportTracker from "./OperatorTransportTracker";

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

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

export default async function OperatorTransportPage() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return (
      <ClientShell>
        <div style={{ width: "min(1000px, 95vw)", margin: "0 auto" }}>
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
        <div style={{ width: "min(1000px, 95vw)", margin: "0 auto" }}>
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
        <div style={{ width: "min(1000px, 95vw)", margin: "0 auto" }}>
          <div style={cardStyle}>
            <h1 style={{ marginTop: 0, fontSize: 32 }}>My Transport</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              No operator record is linked to your login yet.
            </p>
          </div>
        </div>
      </ClientShell>
    );
  }

  const today = new Date();
  const startWindow = new Date(today);
  startWindow.setDate(startWindow.getDate() - 1);
  const startStr = startWindow.toISOString().slice(0, 10);

  const { data: transportJobs, error: jobsError } = await supabase
    .from("transport_jobs")
    .select(`
      id,
      transport_number,
      transport_date,
      collection_time,
      delivery_time,
      collection_address,
      delivery_address,
      load_description,
      status,
      job_type,
      vehicle_id,
      operator_id,
      linked_job_id,
      clients:client_id (
        company_name
      ),
      vehicles:vehicle_id (
        id,
        name,
        reg_number
      ),
      jobs:linked_job_id (
        id,
        job_number,
        site_name
      )
    `)
    .eq("operator_id", operator.id)
    .gte("transport_date", startStr)
    .order("transport_date", { ascending: true })
    .order("collection_time", { ascending: true });

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0, fontSize: 32 }}>My Transport</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Driver / Operator: <strong>{operator.full_name}</strong>
          </p>

          {jobsError ? (
            <div style={errorBox}>{jobsError.message}</div>
          ) : !transportJobs || transportJobs.length === 0 ? (
            <div style={infoBox}>No transport work assigned.</div>
          ) : (
            <>
              <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
                {transportJobs.map((job: any) => {
                  const client = first(job.clients);
                  const vehicle = first(job.vehicles);
                  const linkedJob = first(job.jobs);

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
                            {job.transport_number ?? "Transport Job"}
                          </div>
                          <div style={{ marginTop: 4, opacity: 0.78 }}>
                            {fmtDate(job.transport_date)}
                          </div>
                        </div>

                        <span style={statusBadge}>
                          {job.status ?? "—"}
                        </span>
                      </div>

                      <div style={detailBlock}>
                        <strong>Customer:</strong> {client?.company_name ?? "—"}
                      </div>
                      <div style={detailBlock}>
                        <strong>Vehicle:</strong> {vehicle?.name ?? "—"}
                        {vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}
                      </div>
                      <div style={detailBlock}>
                        <strong>Type:</strong> {job.job_type ?? "—"}
                      </div>
                      <div style={detailBlock}>
                        <strong>Pickup:</strong> {job.collection_address ?? "—"}
                      </div>
                      <div style={detailBlock}>
                        <strong>Delivery:</strong> {job.delivery_address ?? "—"}
                      </div>
                      <div style={detailBlock}>
                        <strong>Times:</strong> {job.collection_time ?? "—"} → {job.delivery_time ?? "—"}
                      </div>
                      <div style={detailBlock}>
                        <strong>Load:</strong> {job.load_description ?? "—"}
                      </div>
                      <div style={detailBlock}>
                        <strong>Linked Crane Job:</strong> {linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 18 }}>
                <OperatorTransportTracker
                  operatorId={operator.id}
                  jobs={(transportJobs ?? []).map((job: any) => {
                    const vehicle = first(job.vehicles);
                    return {
                      id: job.id,
                      transport_number: job.transport_number ?? "Transport Job",
                      transport_date: job.transport_date ?? "",
                      collection_time: job.collection_time ?? "",
                      delivery_time: job.delivery_time ?? "",
                      collection_address: job.collection_address ?? "",
                      delivery_address: job.delivery_address ?? "",
                      status: job.status ?? "",
                      vehicle_id: job.vehicle_id ?? "",
                      vehicle_label: `${vehicle?.name ?? "Vehicle"}${vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}`,
                    };
                  })}
                />
              </div>
            </>
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

const detailBlock: React.CSSProperties = {
  marginTop: 8,
  fontSize: 14,
};

const statusBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(0,120,255,0.12)",
  color: "#0b57d0",
  border: "1px solid rgba(0,120,255,0.20)",
};

const infoBox: React.CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontWeight: 700,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
