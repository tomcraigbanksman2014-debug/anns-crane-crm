import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import StatusPill from "../components/StatusPill";

export default async function EquipmentPage() {
  const supabase = createSupabaseServerClient();

  const { data: equipment, error } = await supabase
    .from("equipment")
    .select("*")
    .order("name", { ascending: true });

  return (
    <ClientShell>
      <div style={{ width: "min(1100px,95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Equipment</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Manage cranes and equipment records.
            </p>
          </div>

          <a href="/equipment/new" style={primaryBtn}>
            + New equipment
          </a>
        </div>

        <div style={panelStyle}>
          {error && <div style={errorBox}>{error.message}</div>}

          {!error && (!equipment || equipment.length === 0) ? (
            <p style={{ margin: 0 }}>No equipment yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Name</th>
                    <th align="left" style={thStyle}>Asset #</th>
                    <th align="left" style={thStyle}>Type</th>
                    <th align="left" style={thStyle}>Capacity</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(equipment ?? []).map((eq: any) => (
                    <tr key={eq.id}>
                      <td style={tdStyle}>{eq.name ?? "—"}</td>
                      <td style={tdStyle}>{eq.asset_number ?? "—"}</td>
                      <td style={tdStyle}>{eq.type ?? "—"}</td>
                      <td style={tdStyle}>{eq.capacity ?? "—"}</td>
                      <td style={tdStyle}>
                        <StatusPill text={eq.status} />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <a href={`/equipment/${eq.id}`} style={actionBtn}>
                            View
                          </a>
                          <a href={`/equipment/${eq.id}/edit`} style={actionBtn}>
                            Edit
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <a
            href="/dashboard"
            style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}
          >
            ← Back to dashboard
          </a>
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
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
};

const actionBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 9,
  textDecoration: "none",
  background: "rgba(255,255,255,0.52)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
