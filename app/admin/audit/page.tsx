import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_username: string | null;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  meta: any;
  created_at: string | null;
};

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function prettyMeta(meta: any) {
  if (!meta) return "—";
  try {
    const text = JSON.stringify(meta);
    return text.length > 160 ? text.slice(0, 160) + "…" : text;
  } catch {
    return "—";
  }
}

function actionTone(action: string | null): React.CSSProperties {
  const a = (action ?? "").toLowerCase();

  if (a === "create") {
    return {
      background: "rgba(0,180,120,0.12)",
      border: "1px solid rgba(0,180,120,0.24)",
      color: "#0b7a4b",
    };
  }

  if (a === "update" || a === "reset_password") {
    return {
      background: "rgba(0,120,255,0.12)",
      border: "1px solid rgba(0,120,255,0.24)",
      color: "#0b57d0",
    };
  }

  if (a === "delete") {
    return {
      background: "rgba(255,0,0,0.10)",
      border: "1px solid rgba(255,0,0,0.22)",
      color: "#b00020",
    };
  }

  return {
    background: "rgba(255,255,255,0.35)",
    border: "1px solid rgba(0,0,0,0.10)",
    color: "#111",
  };
}

function Pill({ text }: { text: string | null | undefined }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        ...actionTone(text ?? ""),
      }}
    >
      {text ?? "—"}
    </span>
  );
}

export default async function AuditPage() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = (user?.user_metadata as any)?.role ?? "";

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_user_id, actor_username, action, entity_type, entity_id, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = ((data ?? []) as AuditRow[]) || [];

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Admin: Audit log</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View recent system activity and admin actions.
            </p>
          </div>

          <a href="/dashboard" style={btnStyle}>
            ← Back to dashboard
          </a>
        </div>

        {role !== "admin" ? (
          <div style={errorBox}>Admin access only.</div>
        ) : (
          <div style={panelStyle}>
            {error && <div style={errorBox}>{error.message}</div>}

            {!error && rows.length === 0 ? (
              <p style={{ margin: 0 }}>No audit entries yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left" style={thStyle}>When</th>
                      <th align="left" style={thStyle}>User</th>
                      <th align="left" style={thStyle}>Action</th>
                      <th align="left" style={thStyle}>Entity</th>
                      <th align="left" style={thStyle}>Entity ID</th>
                      <th align="left" style={thStyle}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td style={tdStyle}>{fmtDateTime(row.created_at)}</td>
                        <td style={tdStyle}>{row.actor_username ?? "—"}</td>
                        <td style={tdStyle}>
                          <Pill text={row.action} />
                        </td>
                        <td style={tdStyle}>{row.entity_type ?? "—"}</td>
                        <td
                          style={{
                            ...tdStyle,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontSize: 12,
                          }}
                        >
                          {row.entity_id ?? "—"}
                        </td>
                        <td style={tdStyle}>{prettyMeta(row.meta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </ClientShell>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const thStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.8,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  verticalAlign: "top",
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

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
