import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function statusStyle(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "available") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (s === "on_hire") {
    return {
      background: "rgba(0,120,255,0.10)",
      color: "#0b57d0",
      border: "1px solid rgba(0,120,255,0.20)",
    };
  }

  if (s === "maintenance") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  return {
    background: "rgba(255,255,255,0.40)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

function dueStyle(dateValue: string | null | undefined): React.CSSProperties {
  if (!dateValue) {
    return {
      background: "rgba(255,255,255,0.42)",
      color: "#555",
      border: "1px solid rgba(0,0,0,0.08)",
    };
  }

  const now = new Date();
  const due = new Date(dateValue);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);

  if (diffDays < 0) {
    return {
      background: "rgba(255,0,0,0.10)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.20)",
    };
  }

  if (diffDays <= 30) {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  return {
    background: "rgba(0,180,120,0.12)",
    color: "#0b7a4b",
    border: "1px solid rgba(0,180,120,0.20)",
  };
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

export default async function CranesPage() {
  const supabase = createSupabaseServerClient();

  const { data: cranes, error } = await supabase
    .from("cranes")
    .select("*")
    .eq("archived", false)
    .order("name", { ascending: true });

  return (
    <ClientShell>
      <div style={{ width: "min(1360px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Cranes</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Main hire fleet only. Add service, inspection, LOLER and documents per crane.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/cranes/loler-inspections" style={secondaryBtn}>
                LOLER inspections
              </a>
              <a href="/cranes/new" style={primaryBtn}>
                + Add crane
              </a>
            </div>
          </div>

          {error ? <div style={errorBox}>{error.message}</div> : null}

          {!error && (!cranes || cranes.length === 0) ? (
            <div style={emptyBox}>No cranes added yet.</div>
          ) : null}

          {!error && cranes && cranes.length > 0 ? (
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Name</th>
                    <th align="left" style={thStyle}>Reg</th>
                    <th align="left" style={thStyle}>Fleet</th>
                    <th align="left" style={thStyle}>Make / Model</th>
                    <th align="left" style={thStyle}>Capacity</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Service Due</th>
                    <th align="left" style={thStyle}>Inspection Due</th>
                    <th align="left" style={thStyle}>LOLER Due</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cranes.map((crane: any) => (
                    <tr key={crane.id}>
                      <td style={tdStyle}>{crane.name ?? "—"}</td>
                      <td style={tdStyle}>{crane.reg_number ?? "—"}</td>
                      <td style={tdStyle}>{crane.fleet_number ?? "—"}</td>
                      <td style={tdStyle}>
                        {[crane.make, crane.model].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td style={tdStyle}>{crane.capacity ?? "—"}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            ...statusStyle(crane.status),
                          }}
                        >
                          {crane.status ?? "—"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            ...dueStyle(crane.service_due_on),
                          }}
                        >
                          {fmtDate(crane.service_due_on)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            ...dueStyle(crane.inspection_due_on),
                          }}
                        >
                          {fmtDate(crane.inspection_due_on)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            ...dueStyle(crane.loler_due_on),
                          }}
                        >
                          {fmtDate(crane.loler_due_on)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <a href={`/cranes/${crane.id}`} style={secondaryBtn}>
                            Open
                          </a>
                          <a href={`/cranes/${crane.id}/edit`} style={secondaryBtn}>
                            Edit
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </ClientShell>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.8,
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

const emptyBox: React.CSSProperties = {
  marginTop: 16,
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
