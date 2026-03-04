import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function AuditPage() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(250);

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Audit Log</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Admin-only activity history.
            </p>
          </div>

          <a href="/dashboard" style={pillStyle}>
            ← Dashboard
          </a>
        </div>

        <div style={panelStyle}>
          {error && <div style={errorStyle}>{error.message}</div>}

          {!data || data.length === 0 ? (
            <p style={{ margin: 0 }}>No audit entries yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>
                      Time
                    </th>
                    <th align="left" style={thStyle}>
                      Action
                    </th>
                    <th align="left" style={thStyle}>
                      Entity
                    </th>
                    <th align="left" style={thStyle}>
                      Entity ID
                    </th>
                    <th align="left" style={thStyle}>
                      Meta
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {data.map((a: any) => (
                    <tr key={a.id}>
                      <td style={tdStyle}>
                        {a.created_at
                          ? new Date(a.created_at).toLocaleString()
                          : "-"}
                      </td>
                      <td style={tdStyle}>
                        <b>{a.action ?? "-"}</b>
                      </td>
                      <td style={tdStyle}>{a.entity_type ?? "-"}</td>

                      {/* ✅ single style prop, merged properly */}
                      <td
                        style={{
                          ...tdStyle,
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                          fontSize: 12,
                        }}
                      >
                        {a.entity_id ?? "-"}
                      </td>

                      <td style={tdStyle}>
                        {a.meta ? JSON.stringify(a.meta).slice(0, 140) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 900,
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
  fontSize: 13,
};

const errorStyle: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
