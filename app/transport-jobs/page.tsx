import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

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

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function prettyStatus(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "planned") return "Planned";
  if (v === "confirmed") return "Confirmed";
  if (v === "in_progress") return "In Progress";
  if (v === "completed") return "Completed";
  if (v === "cancelled") return "Cancelled";
  return value ?? "—";
}

function prettyJobType(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "haulage") return "Haulage";
  if (v === "delivery") return "Delivery";
  if (v === "collection") return "Collection";
  if (v === "ballast") return "Ballast";
  if (v === "crane_support") return "Crane Support";
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
    background: "rgba(255,255,255,0.35)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

type TransportJobsPageProps = {
  searchParams?: {
    view?: string;
  };
};

export default async function TransportJobsPage({
  searchParams,
}: TransportJobsPageProps) {
  const supabase = createSupabaseServerClient();
  const view = String(searchParams?.view ?? "active").toLowerCase();

  let query = supabase
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
      job_type,
      price,
      archived,
      vehicles:vehicle_id (
        id,
        name,
        reg_number
      ),
      operators:operator_id (
        id,
        full_name
      ),
      clients:client_id (
        id,
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

  if (view === "archived") {
    query = query.eq("archived", true);
  } else if (view === "all") {
    // no archived filter
  } else {
    query = query.eq("archived", false);
  }

  const { data, error } = await query;
  const rows = data ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(1450px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Transport Jobs</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Manage transport allocations, drivers, vehicles and delivery details.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/transport-planner" style={secondaryBtn}>
                Open planner
              </a>
              <a href="/transport-map" style={secondaryBtn}>
                Open transport map
              </a>
              <a href="/transport-jobs/new" style={primaryBtn}>
                + New transport job
              </a>
            </div>
          </div>

          <div style={tabsRow}>
            <a
              href="/transport-jobs?view=active"
              style={view === "active" ? activeTabBtn : tabBtn}
            >
              Active
            </a>
            <a
              href="/transport-jobs?view=archived"
              style={view === "archived" ? activeTabBtn : tabBtn}
            >
              Archived
            </a>
            <a
              href="/transport-jobs?view=all"
              style={view === "all" ? activeTabBtn : tabBtn}
            >
              All
            </a>
          </div>

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : rows.length === 0 ? (
            <div style={emptyBox}>No transport jobs found for this view.</div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Ref</th>
                    <th align="left" style={thStyle}>Date</th>
                    <th align="left" style={thStyle}>Times</th>
                    <th align="left" style={thStyle}>Customer</th>
                    <th align="left" style={thStyle}>Vehicle</th>
                    <th align="left" style={thStyle}>Driver</th>
                    <th align="left" style={thStyle}>Type</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Archived</th>
                    <th align="left" style={thStyle}>Value</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item: any) => {
                    const vehicle = first(item.vehicles);
                    const driver = first(item.operators);
                    const client = first(item.clients);

                    return (
                      <tr key={item.id}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 900 }}>{item.transport_number ?? "—"}</div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            {item.collection_address ?? "—"}
                          </div>
                          <div style={{ marginTop: 2, fontSize: 12, opacity: 0.72 }}>
                            → {item.delivery_address ?? "—"}
                          </div>
                        </td>

                        <td style={tdStyle}>{fmtDate(item.transport_date)}</td>

                        <td style={tdStyle}>
                          {item.collection_time || item.delivery_time
                            ? `${item.collection_time ?? "—"} - ${item.delivery_time ?? "—"}`
                            : "—"}
                        </td>

                        <td style={tdStyle}>{client?.company_name ?? "—"}</td>

                        <td style={tdStyle}>
                          {vehicle?.name ?? "—"}
                          {vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}
                        </td>

                        <td style={tdStyle}>{driver?.full_name ?? "—"}</td>

                        <td style={tdStyle}>{prettyJobType(item.job_type)}</td>

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

                        <td style={tdStyle}>{item.archived ? "Yes" : "No"}</td>

                        <td style={tdStyle}>{fmtMoney(item.price)}</td>

                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <a href={`/transport-jobs/${item.id}`} style={actionBtn}>
                              Open
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
