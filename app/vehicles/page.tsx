import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import VehicleArchiveButton from "./VehicleArchiveButton";

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

  if (s === "maintenance") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  if (s === "inactive") {
    return {
      background: "rgba(120,120,120,0.12)",
      color: "#555",
      border: "1px solid rgba(120,120,120,0.18)",
    };
  }

  return {
    background: "rgba(255,255,255,0.35)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

type VehiclesPageProps = {
  searchParams?: {
    view?: string;
  };
};

export default async function VehiclesPage({
  searchParams,
}: VehiclesPageProps) {
  const supabase = createSupabaseServerClient();
  const view = String(searchParams?.view ?? "active").toLowerCase();

  let query = supabase
    .from("vehicles")
    .select(`
      id,
      name,
      reg_number,
      type,
      notes,
      status,
      archived
    `)
    .order("name", { ascending: true });

  if (view === "archived") {
    query = query.eq("archived", true);
  } else if (view === "all") {
    // no filter
  } else {
    query = query.eq("archived", false);
  }

  const { data, error } = await query;
  const rows = data ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(1400px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Vehicles</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Manage road vehicles and transport fleet records.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/transport-jobs" style={secondaryBtn}>
                Open transport jobs
              </a>
              <a href="/vehicles/new" style={primaryBtn}>
                + Add vehicle
              </a>
            </div>
          </div>

          <div style={tabsRow}>
            <a
              href="/vehicles?view=active"
              style={view === "active" ? activeTabBtn : tabBtn}
            >
              Active
            </a>
            <a
              href="/vehicles?view=archived"
              style={view === "archived" ? activeTabBtn : tabBtn}
            >
              Archived
            </a>
            <a
              href="/vehicles?view=all"
              style={view === "all" ? activeTabBtn : tabBtn}
            >
              All
            </a>
          </div>

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : rows.length === 0 ? (
            <div style={emptyBox}>No vehicles found for this view.</div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Name</th>
                    <th align="left" style={thStyle}>Registration</th>
                    <th align="left" style={thStyle}>Type</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Archived</th>
                    <th align="left" style={thStyle}>Notes</th>
                    <th align="left" style={thStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((vehicle: any) => (
                    <tr key={vehicle.id}>
                      <td style={tdStyle}>{fmtText(vehicle.name)}</td>
                      <td style={tdStyle}>{fmtText(vehicle.reg_number)}</td>
                      <td style={tdStyle}>{fmtText(vehicle.type)}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            ...statusStyle(vehicle.status),
                          }}
                        >
                          {fmtText(vehicle.status)}
                        </span>
                      </td>
                      <td style={tdStyle}>{vehicle.archived ? "Yes" : "No"}</td>
                      <td style={tdStyle}>{fmtText(vehicle.notes)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <a href={`/vehicles/${vehicle.id}`} style={actionBtn}>
                            Open
                          </a>
                          <VehicleArchiveButton
                            vehicleId={vehicle.id}
                            archived={!!vehicle.archived}
                          />
                        </div>
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

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
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

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
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

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const tabBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 14px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const activeTabBtn: React.CSSProperties = {
  ...tabBtn,
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
};

const actionBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const emptyBox: React.CSSProperties = {
  marginTop: 16,
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};
