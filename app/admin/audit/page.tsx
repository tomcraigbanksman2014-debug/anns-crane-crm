import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function fmt(ts: string | null | undefined) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const supabase = createSupabaseServerClient();

  const q = (searchParams?.q ?? "").trim();
  const like = `%${q}%`;

  const base = supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const { data, error } =
    q.length > 0
      ? await base.or(
          `action.ilike.${like},entity_type.ilike.${like},meta::text.ilike.${like}`
        )
      : await base;

  const rows = data ?? [];

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
            <h1 style={{ margin: 0, fontSize: 32 }}>Audit log</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Track changes across the CRM.
            </p>
          </div>

          <a href="/dashboard" style={pillStyle}>
            ← Dashboard
          </a>
        </div>

        <div style={panelStyle}>
          <form
            action="/admin/audit"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              name="q"
              defaultValue={q}
              placeholder="Search actions, entities, meta..."
              style={inputStyle}
            />
            <button type="submit" style={buttonStyle}>
              Search
            </button>
            {q && (
              <a href="/admin/audit" style={pillStyle}>
                Clear
              </a>
            )}
          </form>

          {error && <div style={errorStyle}>{error.message}</div>}

          <div style={{ marginTop: 14, overflowX: "auto" }}>
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
                {rows.length === 0 ? (
                  <tr>
                    <td style={tdStyle} colSpan={5}>
                      No audit events yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r: any) => (
                    <tr key={r.id}>
                      <td style={tdStyle}>{fmt(r.created_at)}</td>
                      <td style={tdStyle}>
                        <b>{r.action}</b>
                      </td>
                      <td style={tdStyle}>{r.entity_type}</td>
                      <td style={tdStyle} title={r.entity_id ?? ""}>
                        <code style={{ fontSize: 12 }}>
                          {r.entity_id ?? "-"}
                        </code>
                      </td>
                      <td style={tdStyle}>
                        <code style={{ fontSize: 12 }}>
                          {r.meta ? JSON.stringify(r.meta) : "{}"}
                        </code>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
            Showing up to 200 most recent records.
          </div>
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
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 260,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.14)",
  outline: "none",
  background: "rgba(255,255,255,0.85)",
  fontSize: 15,
};

const buttonStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "none",
  background: "#111",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
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
  verticalAlign: "top",
};

const errorStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
