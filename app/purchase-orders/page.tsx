import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function matchesQuery(po: any, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const supplier = first(po.suppliers);
  const job = first(po.jobs);
  const transportJob = first(po.transport_jobs);

  const haystack = [
    po.po_number,
    po.status,
    po.supplier_reference,
    po.notes,
    supplier?.company_name,
    job?.job_number ? `job ${job.job_number}` : "",
    job?.site_name,
    transportJob?.transport_number,
    transportJob?.transport_date,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function orderTypeLabel(po: any) {
  if (po.transport_job_id) return "Transport";
  if (po.job_id) return "Crane Job";
  return "Unlinked";
}

function orderTypeStyle(po: any): React.CSSProperties {
  if (po.transport_job_id) {
    return {
      background: "rgba(59,130,246,0.12)",
      color: "#1d4ed8",
      border: "1px solid rgba(59,130,246,0.22)",
    };
  }

  if (po.job_id) {
    return {
      background: "rgba(16,185,129,0.12)",
      color: "#047857",
      border: "1px solid rgba(16,185,129,0.22)",
    };
  }

  return {
    background: "rgba(148,163,184,0.18)",
    color: "#334155",
    border: "1px solid rgba(148,163,184,0.24)",
  };
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams?: { q?: string; success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const query = String(searchParams?.q ?? "").trim();

  const { data: purchaseOrders, error } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      suppliers:supplier_id (
        id,
        company_name
      ),
      jobs:job_id (
        id,
        job_number,
        site_name
      ),
      transport_jobs:transport_job_id (
        id,
        transport_number,
        transport_date
      )
    `)
    .order("created_at", { ascending: false });

  const list = (purchaseOrders ?? []).filter((po: any) => matchesQuery(po, query));
  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 32 }}>Purchase Orders</h1>
              <p style={{ opacity: 0.8, marginTop: 6 }}>
                Search, open and manage supplier purchase orders.
              </p>
            </div>

            <a href="/purchase-orders/new" style={primaryBtn}>
              + Create purchase order
            </a>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <section style={sectionCard}>
            <form method="get" action="/purchase-orders" style={searchRow}>
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Search PO number, supplier, crane job, transport job, notes..."
                style={searchInput}
              />
              <button type="submit" style={secondaryBtn}>
                Search
              </button>
              {query ? (
                <a href="/purchase-orders" style={clearBtn}>
                  Clear
                </a>
              ) : null}
            </form>
          </section>

          <section style={{ ...sectionCard, marginTop: 16 }}>
            <h2 style={sectionTitle}>Existing purchase orders</h2>

            {error ? (
              <div style={errorBox}>{error.message}</div>
            ) : list.length === 0 ? (
              <p style={{ margin: 0 }}>No purchase orders found.</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {list.map((po: any) => {
                  const supplier = first(po.suppliers);
                  const job = first(po.jobs);
                  const transportJob = first(po.transport_jobs);

                  return (
                    <div key={po.id} style={poCard}>
                      <div style={poRowTop}>
                        <div>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <div style={{ fontSize: 22, fontWeight: 1000 }}>
                              {po.po_number ?? "Purchase Order"}
                            </div>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 900,
                                ...orderTypeStyle(po),
                              }}
                            >
                              {orderTypeLabel(po)}
                            </span>
                          </div>

                          <div style={{ marginTop: 6, opacity: 0.72 }}>
                            Supplier: {supplier?.company_name ?? "—"}
                            {job ? ` • Crane Job: ${job.job_number ?? "—"}${job.site_name ? ` • ${job.site_name}` : ""}` : ""}
                            {transportJob ? ` • Transport Job: ${transportJob.transport_number ?? "—"}${transportJob.transport_date ? ` • ${fmtDate(transportJob.transport_date)}` : ""}` : ""}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <a href={`/purchase-orders/${po.id}`} style={secondaryBtn}>
                            Open
                          </a>
                          <a
                            href={`/purchase-orders/${po.id}/print`}
                            target="_blank"
                            rel="noreferrer"
                            style={secondaryBtn}
                          >
                            Open / Save PDF
                          </a>
                          <form
                            action={`/api/purchase-orders/${po.id}/delete`}
                            method="POST"
                            onSubmit={(e) => {
                              const ok = window.confirm(
                                `Delete purchase order ${po.po_number ?? ""}? This cannot be undone.`
                              );
                              if (!ok) e.preventDefault();
                            }}
                          >
                            <button type="submit" style={deleteBtn}>
                              Delete
                            </button>
                          </form>
                        </div>
                      </div>

                      <div style={metaGrid}>
                        <Meta label="Status" value={po.status ?? "—"} />
                        <Meta label="Order date" value={fmtDate(po.order_date)} />
                        <Meta label="Required date" value={fmtDate(po.required_date)} />
                        <Meta label="Supplier ref" value={po.supplier_reference ?? "—"} />
                        <Meta label="Total" value={`£${Number(po.total_cost ?? 0).toFixed(2)}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </ClientShell>
  );
}

function Meta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={metaBox}>
      <div style={metaLabel}>{label}</div>
      <div style={metaValue}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
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

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const searchRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const searchInput: React.CSSProperties = {
  flex: 1,
  minWidth: 280,
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const poCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 14,
};

const poRowTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const metaGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const metaBox: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const metaLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 800,
};

const metaValue: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 900,
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

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const deleteBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.08)",
  color: "#b00020",
  fontWeight: 800,
  border: "1px solid rgba(255,0,0,0.18)",
  cursor: "pointer",
};

const clearBtn: React.CSSProperties = {
  ...secondaryBtn,
};

const successBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#0b7a4b",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
