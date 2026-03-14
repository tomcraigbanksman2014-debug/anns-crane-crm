import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function fmtText(value: string | null | undefined) {
  return value && String(value).trim().length ? value : "—";
}

function statusStyle(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "active") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  return {
    background: "rgba(255,170,0,0.14)",
    color: "#8a5200",
    border: "1px solid rgba(255,170,0,0.24)",
  };
}

export default async function OperatorsPage() {
  const supabase = createSupabaseServerClient();

  const { data: operators, error } = await supabase
    .from("operators")
    .select("id, full_name, email, phone, status, notes")
    .order("full_name", { ascending: true });

  const rows = operators ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Operators</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Operator accounts are now created from <strong>Admin: Staff Accounts</strong>. Use this page to view and edit operator records only.
            </p>
          </div>

          <a href="/admin/users" style={primaryBtn}>
            Create operator account
          </a>
        </div>

        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : rows.length === 0 ? (
          <div style={cardStyle}>
            <p style={{ margin: 0 }}>No operators added yet.</p>
          </div>
        ) : (
          <div style={{ ...cardStyle, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left" style={thStyle}>Name</th>
                  <th align="left" style={thStyle}>Email</th>
                  <th align="left" style={thStyle}>Phone</th>
                  <th align="left" style={thStyle}>Status</th>
                  <th align="left" style={thStyle}>Notes</th>
                  <th align="left" style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((op: any) => (
                  <tr key={op.id}>
                    <td style={tdStyle}>{fmtText(op.full_name)}</td>
                    <td style={tdStyle}>{fmtText(op.email)}</td>
                    <td style={tdStyle}>{fmtText(op.phone)}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 900,
                          ...statusStyle(op.status),
                        }}
                      >
                        {fmtText(op.status)}
                      </span>
                    </td>
                    <td style={tdStyle}>{fmtText(op.notes)}</td>
                    <td style={tdStyle}>
                      <a href={`/operators/${op.id}/edit`} style={secondaryBtn}>
                        Edit
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ClientShell>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
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

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const thStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.78,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  verticalAlign: "top",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
