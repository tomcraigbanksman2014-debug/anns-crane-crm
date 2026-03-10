import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import OperatorJobActions from "../OperatorJobActions";
import OperatorPhotoUpload from "./OperatorPhotoUpload";

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
  const authUsername = authEmail.includes("@")
    ? authEmail.split("@")[0]
    : authEmail;

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
          <div style={errorBox}>No operator record linked to this login.</div>
        </div>
      </ClientShell>
    );
  }

  const [{ data: job, error: jobError }, { data: photos }] = await Promise.all([
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
        contact_name,
        contact_phone,
        notes,
        started_at,
        arrived_on_site_at,
        lift_completed_at,
        completed_at,
        operator_id,
        clients:client_id (
          company_name
        ),
        equipment:equipment_id (
          name,
          capacity
        )
      `)
      .eq("id", params.id)
      .single(),

    supabase
      .from("job_documents")
      .select("id, file_name, file_path, created_at, document_type")
      .eq("job_id", params.id)
      .eq("document_type", "photo")
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

  if ((job as any).operator_id !== operator.id) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>This job is not assigned to you.</div>
        </div>
      </ClientShell>
    );
  }

  const client = first((job as any).clients);
  const equipment = first((job as any).equipment);
  const photoDocs = photos ?? [];

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
                {fmtDate((job as any).job_date)}
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
            <div style={rowLabel}>Crane</div>
            <div style={rowValue}>
              {equipment?.name ?? "—"}
              {equipment?.capacity ? ` • ${equipment.capacity}` : ""}
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
            <div style={rowLabel}>Notes</div>
            <div style={rowValue}>{(job as any).notes ?? "—"}</div>
          </div>

          <div style={timelineBox}>
            <div style={timelineTitle}>Job activity</div>
            <div style={timelineRow}>
              <strong>Started:</strong> {fmtDateTime((job as any).started_at)}
            </div>
            <div style={timelineRow}>
              <strong>Arrived on site:</strong> {fmtDateTime((job as any).arrived_on_site_at)}
            </div>
            <div style={timelineRow}>
              <strong>Lift completed:</strong> {fmtDateTime((job as any).lift_completed_at)}
            </div>
            <div style={timelineRow}>
              <strong>Job completed:</strong> {fmtDateTime((job as any).completed_at)}
            </div>
          </div>

          <OperatorJobActions jobId={(job as any).id} />

          <div style={photoSection}>
            <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 22 }}>Site Photos</h2>

            <OperatorPhotoUpload jobId={(job as any).id} />

            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {photoDocs.length === 0 ? (
                <div style={infoBox}>No site photos uploaded yet.</div>
              ) : (
                photoDocs.map((doc: any) => {
                  const href = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-documents/${doc.file_path}`;

                  return (
                    <a
                      key={doc.id}
                      href={href}
                      target="_blank"
                      style={photoLinkCard}
                    >
                      <div style={{ fontWeight: 800 }}>{doc.file_name}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                        Uploaded: {fmtDateTime(doc.created_at)}
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
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
