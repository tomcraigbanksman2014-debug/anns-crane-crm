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

function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("en-GB");
}

function issueLabel(value: string | null | undefined) {
  const s = String(value ?? "");
  if (s === "no_issues") return "No issues";
  if (s === "delay") return "Delay";
  if (s === "safety_issue") return "Safety issue";
  if (s === "damage") return "Damage";
  if (s === "other") return "Other";
  return s || "—";
}

export default async function OperatorShiftsPage() {
  const supabase = createSupabaseServerClient();
  const admin = getAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/operator/shifts");
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

  const { data: rows, error } = await admin
    .from("operator_shift_sessions")
    .select("*")
    .eq("operator_id", operator.id)
    .order("started_at", { ascending: false })
    .limit(60);

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
              <h1 style={{ margin: 0, fontSize: 32 }}>Shifts</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Shift history for <strong>{operator.full_name}</strong>
              </p>
            </div>
            <a href="/operator/jobs" style={btn}>
              ← Back
            </a>
          </div>

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : !(rows ?? []).length ? (
            <div style={box}>No shifts recorded yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
              {(rows ?? []).map((row: any) => (
                <div key={row.id} style={box}>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {row.status === "started" ? "Active shift" : "Shift complete"}
                  </div>
                  <div style={line}>
                    <strong>Start:</strong> {fmtDateTime(row.started_at)}
                  </div>
                  <div style={line}>
                    <strong>End:</strong> {fmtDateTime(row.ended_at)}
                  </div>
                  <div style={line}>
                    <strong>Start site:</strong> {row.start_site_text ?? "—"}
                  </div>
                  <div style={line}>
                    <strong>End site:</strong> {row.end_site_text ?? "—"}
                  </div>
                  <div style={line}>
                    <strong>Issue:</strong> {issueLabel(row.end_issue_type)}
                  </div>
                  {row.end_issue_notes ? (
                    <div style={line}>
                      <strong>Notes:</strong> {row.end_issue_notes}
                    </div>
                  ) : null}
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

const errorBox: React.CSSProperties = {
  marginTop: 18,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.18)",
  fontWeight: 800,
};

const line: React.CSSProperties = {
  marginTop: 8,
  fontSize: 14,
};
