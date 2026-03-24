import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import OperatorJobActions from "../OperatorJobActions";
import OperatorPhotoUpload from "./OperatorPhotoUpload";
import OperatorJobSheetForm from "./OperatorJobSheetForm";

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

function prettyDocumentType(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "Other";
  return raw
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

  const craneAllocation = allocations.find((row: any) => {
    const crane = first(row?.cranes);
    return !!crane?.name;
  });

  if (craneAllocation) {
    const crane = first(craneAllocation.cranes);
    return {
      name: crane?.name ?? "Crane",
      extra: crane?.capacity ? ` • ${crane.capacity}` : "",
    };
  }

  const equipmentAllocation = allocations.find((row: any) => {
    const equipment = first(row?.equipment);
    return !!equipment?.name;
  });

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

export default async function OperatorJobSheetPage({
  params,
}: {
  params: { id: string };
}) {
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

  const { data: operators, error: operatorsError } = await supabase
    .from("operators")
    .select("id, full_name, email, status")
    .eq("status", "active");

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
    (operators ?? []).find((op: any) => matchesOperatorLogin(authEmail, op)) ?? null;

  if (!operator) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>No operator record linked to this login.</div>
        </div>
      </ClientShell>
    );
  }

  const [{ data: job, error: jobError }, { data: allDocuments, error: docsError }] =
    await Promise.all([
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
          travel_hours,
          break_hours,
          overtime_hours,
          operator_job_notes,
          customer_signoff_name,
          operator_signoff_name,
          submitted_to_office_at,
          clients:client_id (
            company_name
          ),
          equipment:equipment_id (
            name,
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
        .eq("id", params.id)
        .single(),

      supabase
        .from("job_documents")
        .select("id, file_name, file_path, created_at, document_type, uploaded_by, share_with_operator")
        .eq("job_id", params.id)
        .order("created_at", { ascending: false }),
    ]);

  if (jobError || !job) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>Job not found.</div>
        </div>
      </ClientShell>
    );
  }

  if (!jobIsAssignedToOperator(job, operator.id)) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>This job is not assigned to you.</div>
        </div>
      </ClientShell>
    );
  }

  if (docsError) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>{docsError.message}</div>
        </div>
      </ClientShell>
    );
  }

  const client = first((job as any).clients);
  const asset = displayAsset(job);

  const visibleDocuments = ((allDocuments ?? []) as any[]).filter((doc: any) => {
    const uploadedByCurrentUser = String(doc.uploaded_by ?? "") === String(user.id);
    const sharedByOffice = doc.share_with_operator === true;
    return uploadedByCurrentUser || sharedByOffice;
  });

  return (
    <ClientShell>
      <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
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
              <h1 style={{ margin: 0, fontSize: 32 }}>
                Job #{(job as any).job_number ?? "—"}
              </h1>
              <div style={{ marginTop: 6, opacity: 0.8 }}>
                {fmtDate((job as any).start_date ?? (job as any).job_date)}
              </div>
            </div>

            <span
              style={{
                display: "inline-block",
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 900,
                ...statusStyle((job as any).status),
              }}
            >
              {prettyStatus((job as any).status)}
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
              {(job as any).start_time || (job as any).end_time
                ? `${(job as any).start_time ?? "—"} - ${(job as any).end_time ?? "—"}`
                : "—"}
            </div>
          </div>

          <div style={sectionBlock}>
            <div style={rowLabel}>Site</div>
            <div style={rowValue}>
              {(job as any).site_name ?? "—"}
              {(job as any).site_address ? (
                <div style={{ marginTop: 4, fontWeight: 500 }}>
                  {(job as any).site_address}
                </div>
              ) : null}
            </div>
          </div>

          <div style={sectionBlock}>
            <div style={rowLabel}>Site contact</div>
            <div style={rowValue}>
              {(job as any).contact_name ?? "—"}
              {(job as any).contact_phone ? (
                <div style={{ marginTop: 4, fontWeight: 500 }}>
                  {(job as any).contact_phone}
                </div>
              ) : null}
            </div>
          </div>

          <div style={sectionBlock}>
            <div style={rowLabel}>Office notes</div>
            <div style={rowValue}>{(job as any).notes ?? "—"}</div>
          </div>

          <OperatorJobActions jobId={(job as any).id} />

          <OperatorJobSheetForm
            jobId={(job as any).id}
            initialTravelHours={(job as any).travel_hours}
            initialBreakHours={(job as any).break_hours}
            initialOvertimeHours={(job as any).overtime_hours}
            initialOperatorJobNotes={(job as any).operator_job_notes}
            initialCustomerSignoffName={(job as any).customer_signoff_name}
            initialOperatorSignoffName={(job as any).operator_signoff_name}
            initialSubmittedToOfficeAt={(job as any).submitted_to_office_at}
          />

          <div style={photoSection}>
            <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 22 }}>Job Documents</h2>

            <OperatorPhotoUpload jobId={(job as any).id} />

            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {visibleDocuments.length === 0 ? (
                <div style={infoBox}>No shared or uploaded documents yet.</div>
              ) : (
                visibleDocuments.map((doc: any) => {
                  const href = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-documents/${doc.file_path}`;
                  const uploadedByCurrentUser = String(doc.uploaded_by ?? "") === String(user.id);

                  return (
                    <a
                      key={doc.id}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      style={photoLinkCard}
                    >
                      <div style={{ fontWeight: 800 }}>{doc.file_name}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                        {prettyDocumentType(doc.document_type)} • Uploaded: {fmtDateTime(doc.created_at)}
                      </div>
                      <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {uploadedByCurrentUser ? (
                          <span style={pillNeutral}>Your upload</span>
                        ) : null}
                        {doc.share_with_operator ? (
                          <span style={pillGood}>Shared by office</span>
                        ) : null}
                      </div>
                    </a>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <a href="/operator/jobs" style={backBtn}>
              ← Back to My Jobs
            </a>
          </div>
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

const photoSection: React.CSSProperties = {
  marginTop: 18,
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const photoLinkCard: React.CSSProperties = {
  display: "block",
  padding: 12,
  borderRadius: 10,
  textDecoration: "none",
  color: "#111",
  background: "rgba(255,255,255,0.52)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const backBtn: React.CSSProperties = {
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

const errorBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.18)",
  fontWeight: 800,
};

const pillNeutral: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: "rgba(255,255,255,0.70)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const pillGood: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.20)",
};
