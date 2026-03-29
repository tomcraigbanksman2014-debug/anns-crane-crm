import { createClient } from "@supabase/supabase-js";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
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

export default async function OperatorDocumentsPage() {
  const supabase = createSupabaseServerClient();
  const admin = getAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/operator/documents");
  }

  const authEmail = String(user.email ?? "").trim().toLowerCase();

  const { data: operators, error: operatorsError } = await admin
    .from("operators")
    .select("id, full_name, email, status")
    .eq("status", "active");

  if (operatorsError) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px,95vw)", margin: "0 auto" }}>
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
        <div style={{ width: "min(900px,95vw)", margin: "0 auto" }}>
          <div style={box}>No operator record linked to this login.</div>
        </div>
      </ClientShell>
    );
  }

  const { data: jobs, error: jobsError } = await admin
    .from("jobs")
    .select("id, operator_id, main_operator_id, status, job_equipment(operator_id)")
    .neq("status", "cancelled")
    .limit(500);

  if (jobsError) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px,95vw)", margin: "0 auto" }}>
          <div style={errorBox}>{jobsError.message}</div>
        </div>
      </ClientShell>
    );
  }

  const assignedJobIds = ((jobs ?? []) as any[])
    .filter((job: any) => {
      if (String(job.operator_id ?? "") === String(operator.id)) return true;
      if (String(job.main_operator_id ?? "") === String(operator.id)) return true;

      const allocations = Array.isArray(job.job_equipment) ? job.job_equipment : [];
      return allocations.some(
        (row: any) => String(row.operator_id ?? "") === String(operator.id)
      );
    })
    .map((job: any) => job.id);

  const { data: craneDocs, error: craneDocsError } = assignedJobIds.length
    ? await admin
        .from("job_documents")
        .select(
          "id, job_id, file_name, file_path, document_type, created_at, share_with_operator"
        )
        .in("job_id", assignedJobIds)
        .eq("share_with_operator", true)
        .order("created_at", { ascending: false })
    : ({ data: [], error: null } as any);

  if (craneDocsError) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px,95vw)", margin: "0 auto" }}>
          <div style={errorBox}>{craneDocsError.message}</div>
        </div>
      </ClientShell>
    );
  }

  const { data: transportJobs, error: transportJobsError } = await admin
    .from("transport_jobs")
    .select("id")
    .eq("operator_id", operator.id)
    .neq("status", "cancelled");

  if (transportJobsError) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px,95vw)", margin: "0 auto" }}>
          <div style={errorBox}>{transportJobsError.message}</div>
        </div>
      </ClientShell>
    );
  }

  const transportIds = ((transportJobs ?? []) as any[]).map((x: any) => x.id);

  const { data: transportDocs, error: transportDocsError } = transportIds.length
    ? await admin
        .from("transport_job_documents")
        .select(
          "id, transport_job_id, file_name, file_path, document_type, created_at, share_with_operator"
        )
        .in("transport_job_id", transportIds)
        .eq("share_with_operator", true)
        .order("created_at", { ascending: false })
    : ({ data: [], error: null } as any);

  if (transportDocsError) {
    return (
      <ClientShell>
        <div style={{ width: "min(900px,95vw)", margin: "0 auto" }}>
          <div style={errorBox}>{transportDocsError.message}</div>
        </div>
      </ClientShell>
    );
  }

  const items = [
    ...((craneDocs ?? []) as any[]).map((doc: any) => ({ ...doc, scope: "Crane" })),
    ...((transportDocs ?? []) as any[]).map((doc: any) => ({
      ...doc,
      scope: "Transport",
    })),
  ];

  return (
    <ClientShell>
      <div style={{ width: "min(900px,95vw)", margin: "0 auto" }}>
        <div style={card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Documents</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Documents shared with <strong>{operator.full_name}</strong>
              </p>
            </div>
            <a href="/operator/jobs" style={btn}>
              ← Back
            </a>
          </div>

          {!items.length ? (
            <div style={box}>No shared documents available.</div>
          ) : (
            <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
              {items.map((doc: any) => (
                <div key={`${doc.scope}-${doc.id}`} style={box}>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {doc.file_name ?? "Document"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, opacity: 0.76 }}>
                    {doc.scope} • {doc.document_type ?? "other"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, opacity: 0.76 }}>
                    Added:{" "}
                    {doc.created_at
                      ? new Date(doc.created_at).toLocaleString("en-GB")
                      : "—"}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <a
                      href={hrefFor(doc.file_path)}
                      target="_blank"
                      rel="noreferrer"
                      style={primaryBtn}
                    >
                      Open
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const box: React.CSSProperties = {
  marginTop: 18,
  padding: "14px 16px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.58)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const btn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 18,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.18)",
  fontWeight: 800,
};
