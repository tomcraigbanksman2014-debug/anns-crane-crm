import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

export default async function EquipmentPage() {
  const supabase = createSupabaseServerClient();

  const { data: equipment, error } = await supabase
    .from("equipment")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 95vw)", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Equipment</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Manage equipment, certification dates, and availability.
            </p>
          </div>

          <a
            href="/equipment/new"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "rgba(255,255,255,0.45)",
              textDecoration: "none",
              color: "#111",
              fontWeight: 800,
            }}
          >
            + Add equipment
          </a>
        </div>

        <div
          style={{
            marginTop: 16,
            background: "rgba(255,255,255,0.18)",
            padding: 18,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.4)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          }}
        >
          {error && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,0,0,0.10)",
                border: "1px solid rgba(255,0,0,0.25)",
              }}
            >
              {error.message}
            </div>
          )}

          {!equipment || equipment.length === 0 ? (
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
                    <th align="left" style={thStyle}>Cert Expiry</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((e: any) => (
                    <tr key={e.id}>
                      <td style={tdStyle}>{e.name ?? "-"}</td>
                      <td style={tdStyle}>{e.asset_number ?? "-"}</td>
                      <td style={tdStyle}>{e.type ?? "-"}</td>
                      <td style={tdStyle}>{e.capacity ?? "-"}</td>
                      <td style={tdStyle}>{e.status ?? "-"}</td>
                      <td style={tdStyle}>
                        {e.certification_expires_on
                          ? new Date(e.certification_expires_on).toLocaleDateString()
                          : "-"}
                      </td>
                      <td style={tdStyle}>
                        <a href={`/equipment/${e.id}`} style={{ marginRight: 12, textDecoration: "none" }}>
                          Edit
                        </a>
                        <a href={`/equipment/${e.id}/delete`} style={{ color: "red", textDecoration: "none" }}>
                          Delete
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <a href="/dashboard" style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}>
            ← Back to dashboard
          </a>
        </div>
      </div>
    </ClientShell>
  );
}

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
