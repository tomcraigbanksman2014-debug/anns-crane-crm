import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function prettyStatus(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();

  if (v === "in_progress") return "In Progress";
  if (v === "planned") return "Planned";
  if (v === "confirmed") return "Confirmed";
  if (v === "completed") return "Completed";
  if (v === "cancelled") return "Cancelled";

  return value ?? "—";
}

function statusStyle(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "planned") {
    return {
      background: "rgba(0,120,255,0.10)",
      color: "#0b57d0",
      border: "1px solid rgba(0,120,255,0.18)",
    };
  }

  if (s === "confirmed") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.22)",
    };
  }

  if (s === "in_progress") {
    return {
      background: "rgba(170,0,255,0.10)",
      color: "#6a1b9a",
      border: "1px solid rgba(170,0,255,0.18)",
    };
  }

  if (s === "completed") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (s === "cancelled") {
    return {
      background: "rgba(255,0,0,0.10)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.18)",
    };
  }

  return {
    background: "rgba(255,255,255,0.55)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

export default async function TransportJobsPage() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("transport_jobs")
    .select(`
      id,
      transport_number,
      transport_date,
      collection_time,
      delivery_time,
      collection_address,
      delivery_address,
      load_description,
      status,
      price,
      job_type,
      vehicles:vehicle_id (
        name,
        reg_number
      ),
      operators:operator_id (
        full_name
      ),
      clients:client_id (
        company_name
      ),
      jobs:linked_job_id (
        id,
        job_number,
        site_name
      )
    `)
    .order("transport_date", { ascending: true })
    .order("collection_time", { ascending: true });

  const rows = data ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(1400px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Transport Jobs</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Manage transport work, vehicle movements and linked crane support jobs.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/transport-map" style={secondaryBtn}>
                Open control map
              </a>
              <a href="/transport-planner" style={secondaryBtn}>
                Open transport planner
              </a>
              <a href="/transport-jobs/new" style={primaryBtn}>
                + New transport job
              </a>
            </div>
          </div>

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : rows.length === 0 ? (
            <div style={infoBox}>No transport jobs found.</div>
          ) : (
            <div style={{ ...tableWrap, marginTop: 16 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Ref</th>
                    <th align="left" style={thStyle}>Customer</th>
                    <th align="left" style={thStyle}>Date</th>
                    <th align="left" style={thStyle}>Vehicle</th>
                    <th align="left" style={thStyle}>Driver</th>
                    <th align="left" style={thStyle}>Pickup</th>
                    <th align="left" style={thStyle}>Delivery</th>
                    <th align="left" style={thStyle}>Type</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Price</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item: any) => {
                    const client = first(item.clients);
                    const vehicle = first(item.vehicles);
                    const driver = first(item.operators);

                    return (
                      <tr key={item.id}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 900 }}>
                            {item.transport_number ?? "—"}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            {item.collection_time ?? "—"} → {item.delivery_time ?? "—"}
                          </div>
                        </td>

                        <td style={tdStyle}>{client?.company_name ?? "—"}</td>

                        <td style={tdStyle}>{fmtDate(item.transport_date)}</td>

                        <td style={tdStyle}>
                          {vehicle?.name ?? "—"}
                          {vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}
                        </td>

                        <td style={tdStyle}>{driver?.full_name ?? "—"}</td>

                        <td style={tdStyle}>{item.collection_address ?? "—"}</td>

                        <td style={tdStyle}>{item.delivery_address ?? "—"}</td>

                        <td style={tdStyle}>{item.job_type ?? "—"}</td>

                        <td style={tdStyle}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "6px 10px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 900,
                              ...statusStyle(item.status),
                            }}
                          >
                            {prettyStatus(item.status)}
                          </span>
                        </td>

                        <td style={tdStyle}>{fmtMoney(item.price)}</td>

                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <a href={`/transport-jobs/${item.id}`} style={miniBtn}>
                              Open
                            </a>

                            <a href="/transport-map" style={miniBtn}>
                              Map
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const miniBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 9,
  textDecoration: "none",
  background: "rgba(255,255,255,0.72)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
  borderRadius: 12,
  background: "rgba(255,255,255,0.28)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  padding: "12px 10px",
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

const infoBox: React.CSSProperties = {
  marginTop: 16,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontWeight: 700,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
