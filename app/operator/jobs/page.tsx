import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import OperatorTransportTracker from "../transport/OperatorTransportTracker";
import OperatorSignOutButton from "./OperatorSignOutButton";
import OperatorShiftWizard from "./OperatorShiftWizard";
import { redirect } from "next/navigation";

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

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function matchesOperatorLogin(authEmail: string, operator: any) {
  const email = String(authEmail ?? "").trim().toLowerCase();
  const username = email.includes("@") ? email.split("@")[0] : email;
  const operatorEmail = String(operator?.email ?? "").trim().toLowerCase();
  const operatorEmailUsername = operatorEmail.includes("@")
    ? operatorEmail.split("@")[0]
    : operatorEmail;
  const operatorName = String(operator?.full_name ?? "").trim().toLowerCase();

  return (
    (!!operatorEmail && operatorEmail === email) ||
    (!!operatorEmailUsername && operatorEmailUsername === username) ||
    (!!operatorName && operatorName === username)
  );
}

function jobIsAssignedToOperator(job: any, operatorId: string) {
  if (!job) return false;
  if (String(job.operator_id ?? "") === operatorId) return true;
  if (String(job.main_operator_id ?? "") === operatorId) return true;

  const allocations = Array.isArray(job.job_equipment) ? job.job_equipment : [];
  return allocations.some((row: any) => String(row?.operator_id ?? "") === operatorId);
}

function displayAsset(job: any) {
  const directEquipment = first(job?.equipment);
  if (directEquipment?.name) {
    return {
      name: directEquipment.name,
      extra: directEquipment.capacity ? ` • ${directEquipment.capacity}` : "",
    };
  }

  const allocations = Array.isArray(job?.job_equipment) ? job.job_equipment : [];

  const craneAllocation = allocations.find((row: any) => !!first(row?.cranes)?.name);
  if (craneAllocation) {
    const crane = first(craneAllocation.cranes);
    return {
      name: crane?.name ?? "Crane",
      extra: crane?.capacity ? ` • ${crane.capacity}` : "",
    };
  }

  const equipmentAllocation = allocations.find((row: any) => !!first(row?.equipment)?.name);
  if (equipmentAllocation) {
    const equipment = first(equipmentAllocation.equipment);
    return {
      name: equipment?.name ?? "Equipment",
      extra: equipment?.capacity ? ` • ${equipment.capacity}` : "",
    };
  }

  const otherAllocation = allocations.find((row: any) => !!row?.item_name);
  if (otherAllocation) {
    return {
      name: otherAllocation.item_name ?? "Other",
      extra: "",
    };
  }

  return { name: "—", extra: "" };
}

export default async function OperatorJobsPage() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/operator/jobs");
  }

  const authEmail = String(user.email ?? "").trim().toLowerCase();
  const username = fromAuthEmail(user.email ?? null).toLowerCase();

  const { data: operators, error: operatorsError } = await supabase
    .from("operators")
    .select("id, full_name, email, status")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (operatorsError) {
    return (
      <ClientShell>
        <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>{operatorsError.message}</div>
        </div>
      </ClientShell>
    );
  }

  const operator =
    (operators ?? []).find((op: any) => matchesOperatorLogin(authEmail, op)) ?? null;

  if (!operator) {
    return (
      <ClientShell>
        <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
          <div style={cardStyle}>
            <div style={topBarStyle}>
              <div>
                <h1 style={{ marginTop: 0, marginBottom: 0, fontSize: 32 }}>My Jobs</h1>
                <p style={{ marginTop: 6, opacity: 0.8 }}>
                  No operator record is linked to this login.
                </p>
              </div>
              <OperatorSignOutButton />
            </div>

            <div style={infoBox}>
              This login is using <strong>{authEmail || "—"}</strong> and username{" "}
              <strong>{username || "—"}</strong>.
            </div>
          </div>
        </div>
      </ClientShell>
    );
  }

  const startWindow = new Date();
  startWindow.setDate(startWindow.getDate() - 60);
  const startStr = startWindow.toISOString().slice(0, 10);

  const [
    { data: jobs, error: jobsError },
    { data: transportJobs, error: transportJobsError },
    { data: activeShift },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        job_date,
        start_date,
        end_date,
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
        operator_id,
        main_operator_id,
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
        ),
        job_equipment (
          id,
          operator_id,
          item_name,
          cranes:crane_id (
            id,
            name,
            capacity
          ),
          equipment:equipment_id (
            id,
            name,
            capacity
          )
        )
      `)
      .neq("status", "cancelled")
      .gte("job_date", startStr)
      .order("job_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(300),

    supabase
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
        notes,
        status,
        vehicle_id,
        operator_id,
        vehicles:vehicle_id (
          id,
          name,
          reg_number
        )
      `)
      .eq("operator_id", operator.id)
      .neq("status", "cancelled")
      .gte("transport_date", startStr)
      .order("transport_date", { ascending: true })
      .order("collection_time", { ascending: true }),

    supabase
      .from("operator_shift_sessions")
      .select("id, started_at, start_site_text")
      .eq("operator_id", operator.id)
      .eq("status", "started")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const jobsList = ((jobs ?? []) as any[]).filter((job) =>
    jobIsAssignedToOperator(job, operator.id)
  );
  const transportList = (transportJobs ?? []) as any[];

  const assignedSites = [
    ...jobsList.map((job: any) => ({
      kind: "job" as const,
      id: job.id,
      label: `Crane Job #${job.job_number ?? "—"} • ${job.site_name ?? "No site"}`,
      siteText:
        [job.site_name, job.site_address].filter(Boolean).join(" • ") ||
        `Job #${job.job_number ?? "—"}`,
    })),
    ...transportList.map((job: any) => ({
      kind: "transport" as const,
      id: job.id,
      label: `${job.transport_number ?? "Transport Job"} • ${job.collection_address ?? "No pickup"}`,
      siteText:
        [job.collection_address, job.delivery_address].filter(Boolean).join(" → ") ||
        (job.transport_number ?? "Transport Job"),
    })),
  ];

  return (
    <ClientShell>
      <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={topBarStyle}>
            <div>
              <h1 style={{ marginTop: 0, marginBottom: 0, fontSize: 32 }}>My Jobs</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Operator: <strong>{operator.full_name}</strong>
              </p>
            </div>
            <OperatorSignOutButton />
          </div>

          <div style={{ marginTop: 18 }}>
            <OperatorShiftWizard
              operatorName={operator.full_name}
              assignedSites={assignedSites}
              activeShift={
                activeShift
                  ? {
                      id: (activeShift as any).id,
                      started_at: (activeShift as any).started_at,
                      start_site_text: (activeShift as any).start_site_text,
                    }
                  : null
              }
            />
          </div>

          {transportJobsError ? (
            <div style={errorBox}>{transportJobsError.message}</div>
          ) : transportList.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <OperatorTransportTracker
                operatorId={operator.id}
                jobs={transportList.map((job: any) => {
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
                    vehicle_label: `${vehicle?.name ?? "Vehicle"}${
                      vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""
                    }`,
                  };
                })}
              />
            </div>
          ) : null}

          {jobsError ? (
            <div style={errorBox}>{jobsError.message}</div>
          ) : jobsList.length === 0 ? (
            <div style={infoBox}>No crane jobs assigned.</div>
          ) : (
            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
              {jobsList.map((job: any) => {
                const client = first(job.clients);
                const asset = displayAsset(job);

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
                          {fmtDate(job.start_date ?? job.job_date)}
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
                      <div style={rowLabel}>Crane / equipment</div>
                      <div style={rowValue}>
                        {asset.name}
                        {asset.extra}
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

          {transportList.length > 0 ? (
            <div style={{ marginTop: 22 }}>
              <h2 style={{ margin: 0, fontSize: 24 }}>My Transport Allocations</h2>

              <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
                {transportList.map((job: any) => {
                  const vehicle = first(job.vehicles);

                  return (
                    <div key={job.id} style={transportCard}>
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
                        <div style={rowLabel}>Vehicle</div>
                        <div style={rowValue}>
                          {vehicle?.name ?? "—"}
                          {vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}
                        </div>
                      </div>

                      <div style={sectionBlock}>
                        <div style={rowLabel}>Times</div>
                        <div style={rowValue}>
                          {job.collection_time ?? "—"} → {job.delivery_time ?? "—"}
                        </div>
                      </div>

                      <div style={sectionBlock}>
                        <div style={rowLabel}>Pickup</div>
                        <div style={rowValue}>{job.collection_address ?? "—"}</div>
                      </div>

                      <div style={sectionBlock}>
                        <div style={rowLabel}>Delivery</div>
                        <div style={rowValue}>{job.delivery_address ?? "—"}</div>
                      </div>

                      <div style={sectionBlock}>
                        <div style={rowLabel}>Load</div>
                        <div style={rowValue}>{job.load_description ?? "—"}</div>
                      </div>

                      <div style={sectionBlock}>
                        <div style={rowLabel}>Notes</div>
                        <div style={rowValue}>{job.notes ?? "—"}</div>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <a href={`/operator/transport/${job.id}`} style={openBtn}>
                          Open transport job
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
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

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const infoBox: React.CSSProperties = {
  marginTop: 18,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontWeight: 700,
};

const errorBox: React.CSSProperties = {
  marginTop: 18,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.18)",
  fontWeight: 800,
};

const jobCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const transportCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const sectionBlock: React.CSSProperties = {
  marginTop: 10,
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

const openBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
};
