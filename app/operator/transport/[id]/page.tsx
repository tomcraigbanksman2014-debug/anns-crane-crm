import { createClient } from "@supabase/supabase-js";
import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import OperatorTransportDocumentUpload from "./OperatorTransportDocumentUpload";
import { redirect } from "next/navigation";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

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

function prettyDocumentType(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "Other";
  return raw
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function hrefFor(path: string | null | undefined) {
  if (!path || !process.env.NEXT_PUBLIC_SUPABASE_URL) return "#";
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-documents/${path}`;
}

export default async function OperatorTransportJobPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();
  const admin = getAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?next=/operator/transport/${params.id}`);
  }

  const authEmail = String(user.email ?? "").trim().toLowerCase();

  const { data: operators, error: operatorsError } = await admin
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

  const [{ data: job, error: jobError }, { data: documents, error: docsError }] =
    await Promise.all([
      admin
        .from("transport_jobs")
        .select(`
          id,
          transport_number,
          transport_date,
          collection_time,
          delivery_date,
          delivery_time,
          collection_route_order,
          delivery_route_order,
          collection_address,
          delivery_address,
          load_description,
          notes,
          status,
          operator_id,
          vehicles:vehicle_id (
            id,
            name,
            reg_number
          ),
          clients:client_id (
            company_name
          )
        `)
        .eq("id", params.id)
        .single(),

      admin
        .from("transport_job_documents")
        .select(
          "id, file_name, file_path, created_at, document_type, uploaded_by, share_with_operator"
        )
        .eq("transport_job_id", params.id)
        .order("created_at", { ascending: false }),
    ]);

  if (jobError || !job) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>Transport job not found.</div>
        </div>
      </ClientShell>
    );
  }

  if (String((job as any).operator_id ?? "") !== String(operator.id)) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>This transport job is not assigned to you.</div>
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

  const vehicle = first((job as any).vehicles);
  const client = first((job as any).clients);

  const visibleDocuments = ((documents ?? []) as any[]).filter((doc: any) => {
    const uploadedByCurrentUser = String(doc.uploaded_by ?? "") === String(user.id);
    const sharedByOffice = doc.share_with_operator === true;
    return uploadedByCurrentUser || sharedByOffice;
  });

  return (
    <ClientShell>
      <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0, marginBottom: 6, fontSize: 32 }}>
            {client?.company_name ?? (job as any).transport_number ?? "Transport Job"}
          </h1>
          <div style={{ opacity: 0.8 }}>
            {(job as any).transport_number ?? "—"} • {fmtDate((job as any).transport_date)}
          </div>

          <div style={sectionBlock}>
            <div style={rowLabel}>Route order</div>
            <div style={rowValue}>
              {typeof (job as any).collection_route_order === "number"
                ? `Pickup #${(job as any).collection_route_order}`
                : "Pickup —"}
              {" • "}
              {typeof (job as any).delivery_route_order === "number"
                ? `Delivery #${(job as any).delivery_route_order}`
                : "Delivery —"}
            </div>
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
              {(job as any).collection_time ?? "—"} → {(job as any).delivery_time ?? "—"}
            </div>
          </div>

          <div style={sectionBlock}>
            <div style={rowLabel}>Pickup</div>
            <div style={rowValue}>{(job as any).collection_address ?? "—"}</div>
          </div>

          <div style={sectionBlock}>
            <div style={rowLabel}>Delivery</div>
            <div style={rowValue}>{(job as any).delivery_address ?? "—"}</div>
          </div>

          <div style={sectionBlock}>
            <div style={rowLabel}>Load</div>
            <div style={rowValue}>{(job as any).load_description ?? "—"}</div>
          </div>

          <div style={sectionBlock}>
            <div style={rowLabel}>Notes</div>
            <div style={rowValue}>{(job as any).notes ?? "—"}</div>
          </div>

          <div style={docSection}>
            <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 22 }}>
              Transport Documents
            </h2>

            <OperatorTransportDocumentUpload transportJobId={(job as any).id} />

            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {visibleDocuments.length === 0 ? (
                <div style={infoBox}>No shared or uploaded documents yet.</div>
              ) : (
                visibleDocuments.map((doc: any) => {
                  const uploadedByCurrentUser =
                    String(doc.uploaded_by ?? "") === String(user.id);

                  return (
                    <a
                      key={doc.id}
                      href={hrefFor(doc.file_path)}
                      target="_blank"
                      rel="noreferrer"
                      style={docCard}
                    >
                      <div style={{ fontWeight: 800 }}>{doc.file_name}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                        {prettyDocumentType(doc.document_type)} • Uploaded:{" "}
                        {fmtDateTime(doc.created_at)}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
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

const docSection: React.CSSProperties = {
  marginTop: 18,
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const docCard: React.CSSProperties = {
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
