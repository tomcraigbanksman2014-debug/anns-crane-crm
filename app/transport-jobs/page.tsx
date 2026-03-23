import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function transportTypeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "—";
  if (raw === "on_site_hiab") return "On-site HIAB";
  if (raw === "crane_support") return "Crane support";
  return raw.replaceAll("_", " ");
}

function statusPillStyle(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "confirmed") {
    return {
      background: "rgba(0,120,255,0.12)",
      color: "#0b57d0",
      border: "1px solid rgba(0,120,255,0.20)",
    };
  }

  if (s === "in_progress") {
    return {
      background: "rgba(255,140,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,140,0,0.22)",
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
    background: "rgba(120,120,120,0.12)",
    color: "#555",
    border: "1px solid rgba(120,120,120,0.18)",
  };
}

export default async function TransportJobsPage() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("transport_jobs")
    .select(`
      *,
      clients:client_id (
        id,
        company_name
      ),
      vehicles:vehicle_id (
        id,
        name,
        reg_number
      ),
      operators:operator_id (
        id,
        full_name
      ),
      suppliers:supplier_id (
        id,
        company_name
      )
    `)
    .eq("archived", false)
    .order("transport_date", { ascending: false })
    .order("collection_time", { ascending: false });

  const rows = data ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(1500px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={topRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Transport Jobs</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Manage haulage, on-site HIAB work and linked transport activity.
              </p>
            </div>

            <a href="/transport-jobs/new" style={primaryBtn}>
              + New transport job
            </a>
          </div>

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : rows.length === 0 ? (
            <div style={emptyBox}>No transport jobs found.</div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Number</th>
                    <th align="left" style={thStyle}>Customer</th>
                    <th align="left" style={thStyle}>Type</th>
                    <th align="left" style={thStyle}>Dates / Times</th>
                    <th align="left" style={thStyle}>Locations</th>
                    <th align="left" style={thStyle}>Vehicle / Operator</th>
                    <th align="left" style={thStyle}>Invoice</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item: any) => {
                    const client = first(item.clients);
                    const vehicle = first(item.vehicles);
                    const operator = first(item.operators);

                    const isOnSiteHiab =
                      String(item.job_type ?? "").toLowerCase() === "on_site_hiab";

                    return (
                      <tr key={item.id}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 900 }}>{item.transport_number ?? "—"}</div>
                        </td>

                        <td style={tdStyle}>{client?.company_name ?? "—"}</td>

                        <td style={tdStyle}>
                          <div style={{ fontWeight: 800 }}>
                            {transportTypeLabel(item.job_type)}
                          </div>
                          {isOnSiteHiab ? (
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.76 }}>
                              On-site support / contract lift work
                            </div>
                          ) : null}
                        </td>

                        <td style={tdStyle}>
                          <div>{fmtDate(item.transport_date)}</div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.76 }}>
                            {item.collection_time ?? "—"} → {item.delivery_time ?? "—"}
                          </div>
                          {item.delivery_date && item.delivery_date !== item.transport_date ? (
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.76 }}>
                              to {fmtDate(item.delivery_date)}
                            </div>
                          ) : null}
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontWeight: 800 }}>
                            {isOnSiteHiab ? "Site address" : "Pickup"}
                          </div>
                          <div>{item.collection_address ?? "—"}</div>
                          <div style={{ marginTop: 8, fontWeight: 800 }}>
                            {isOnSiteHiab ? "Work area / secondary location" : "Delivery"}
                          </div>
                          <div>{item.delivery_address ?? "—"}</div>
                        </td>

                        <td style={tdStyle}>
                          <div>
                            {vehicle?.name ?? "—"}
                            {vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.76 }}>
                            {operator?.full_name ?? "—"}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontWeight: 800 }}>
                            {item.invoice_status ?? "Not Invoiced"}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.76 }}>
                            {money(item.total_invoice)}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "6px 10px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 900,
                              ...statusPillStyle(item.status),
                            }}
                          >
                            {item.status ?? "—"}
                          </span>
                        </td>

                        <td style={tdStyle}>
                          <a href={`/transport-jobs/${item.id}`} style={actionBtn}>
                            Open
                          </a>
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

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const topRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
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

const actionBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.75)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.22)",
};

const emptyBox: React.CSSProperties = {
  marginTop: 16,
  padding: "18px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};
