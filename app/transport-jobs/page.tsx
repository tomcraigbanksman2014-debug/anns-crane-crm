import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import StatusBadge from "../components/StatusBadge";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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

function prettyJobType(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "haulage") return "Haulage";
  if (v === "delivery") return "Delivery";
  if (v === "collection") return "Collection";
  if (v === "ballast") return "Ballast";
  if (v === "crane_support") return "Crane Support";
  return value ?? "—";
}

function clampMoney(value: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

async function updateTransportInvoiceStatus(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const transportJobId = String(formData.get("transport_job_id") ?? "");
  const invoiceStatus = String(formData.get("invoice_status") ?? "Not Invoiced");
  const rawAmountPaid = String(formData.get("amount_paid") ?? "").trim();
  const view = String(formData.get("return_view") ?? "active");
  const q = String(formData.get("return_q") ?? "");

  if (!transportJobId) {
    const params = new URLSearchParams();
    params.set("view", view);
    if (q) params.set("q", q);
    params.set("error", "Missing transport job id.");
    redirect(`/transport-jobs?${params.toString()}`);
  }

  const { data: existingJob, error: existingError } = await supabase
    .from("transport_jobs")
    .select("id, invoice_status, total_invoice, agreed_sell_rate, price, amount_paid")
    .eq("id", transportJobId)
    .single();

  if (existingError || !existingJob) {
    const params = new URLSearchParams();
    params.set("view", view);
    if (q) params.set("q", q);
    params.set("error", existingError?.message || "Transport job not found.");
    redirect(`/transport-jobs?${params.toString()}`);
  }

  const totalInvoice = Number(
    existingJob.total_invoice ?? existingJob.agreed_sell_rate ?? existingJob.price ?? 0
  );
  const safeTotalInvoice = Number.isFinite(totalInvoice) ? totalInvoice : 0;
  const currentStatus = String(existingJob.invoice_status ?? "Not Invoiced");
  const currentAmountPaid = Number(existingJob.amount_paid ?? 0);

  let amountPaid = currentAmountPaid;

  if (invoiceStatus === "Part Paid") {
    const parsed = Number(rawAmountPaid || 0);
    amountPaid = clampMoney(parsed, 0, safeTotalInvoice);

    if (amountPaid <= 0) {
      const params = new URLSearchParams();
      params.set("view", view);
      if (q) params.set("q", q);
      params.set("error", "Enter the amount paid before saving Part Paid.");
      redirect(`/transport-jobs?${params.toString()}`);
    }
  } else if (invoiceStatus === "Paid") {
    amountPaid = safeTotalInvoice;
  } else {
    amountPaid = 0;
  }

  if (
    currentStatus === invoiceStatus &&
    Number(currentAmountPaid.toFixed(2)) === Number(amountPaid.toFixed(2))
  ) {
    const params = new URLSearchParams();
    params.set("view", view);
    if (q) params.set("q", q);
    params.set("success", "Invoice details already up to date.");
    redirect(`/transport-jobs?${params.toString()}`);
  }

  const { error } = await supabase
    .from("transport_jobs")
    .update({
      invoice_status: invoiceStatus,
      amount_paid: amountPaid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transportJobId);

  revalidatePath("/transport-jobs");
  revalidatePath("/dashboard");

  if (error) {
    const params = new URLSearchParams();
    params.set("view", view);
    if (q) params.set("q", q);
    params.set("error", error.message);
    redirect(`/transport-jobs?${params.toString()}`);
  }

  const successText =
    invoiceStatus === "Part Paid"
      ? `Transport invoice updated to Part Paid (£${amountPaid.toFixed(2)} received)`
      : invoiceStatus === "Paid"
      ? "Transport invoice updated to Paid"
      : `Transport invoice status updated to ${invoiceStatus}`;

  const params = new URLSearchParams();
  params.set("view", view);
  if (q) params.set("q", q);
  params.set("success", successText);
  redirect(`/transport-jobs?${params.toString()}`);
}

type TransportJobsPageProps = {
  searchParams?: {
    view?: string;
    q?: string;
    error?: string;
    success?: string;
  };
};

export default async function TransportJobsPage({
  searchParams,
}: TransportJobsPageProps) {
  const supabase = createSupabaseServerClient();
  const view = String(searchParams?.view ?? "active").toLowerCase();
  const q = String(searchParams?.q ?? "").trim();
  const errorMessage = String(searchParams?.error ?? "");
  const successMessage = String(searchParams?.success ?? "");

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
      agreed_sell_rate,
      supplier_id,
      supplier_cost,
      invoice_status,
      total_invoice,
      amount_paid,
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

  if (q) {
    const safe = q.replace(/[%_]/g, "").trim();
    if (safe) {
      query = query.or(
        [
          `transport_number.ilike.%${safe}%`,
          `collection_address.ilike.%${safe}%`,
          `delivery_address.ilike.%${safe}%`,
          `load_description.ilike.%${safe}%`,
          `job_type.ilike.%${safe}%`,
          `status.ilike.%${safe}%`,
          `invoice_status.ilike.%${safe}%`,
        ].join(",")
      );
    }
  }

  const [{ data, error }, { data: suppliers }] = await Promise.all([
    query,
    supabase.from("suppliers").select("id, company_name"),
  ]);

  const supplierMap = new Map<string, string>();
  (suppliers ?? []).forEach((s: any) => {
    supplierMap.set(s.id, s.company_name ?? "Supplier");
  });

  const rows = data ?? [];

  const activeCount = rows.filter(
    (r: any) => String(r.status ?? "").toLowerCase() !== "cancelled"
  ).length;

  const chargeTotal = rows.reduce((sum: number, item: any) => {
    return sum + Number(item.agreed_sell_rate ?? item.price ?? 0);
  }, 0);

  const supplierTotal = rows.reduce((sum: number, item: any) => {
    return sum + Number(item.supplier_cost ?? 0);
  }, 0);

  const outstandingTotal = rows.reduce((sum: number, item: any) => {
    const totalInvoice = Number(item.total_invoice ?? item.agreed_sell_rate ?? item.price ?? 0);
    const amountPaid = Number(item.amount_paid ?? 0);
    const safeTotal = Number.isFinite(totalInvoice) ? totalInvoice : 0;
    const safePaid = Number.isFinite(amountPaid) ? amountPaid : 0;
    return sum + Math.max(safeTotal - safePaid, 0);
  }, 0);

  function viewHref(nextView: string) {
    const params = new URLSearchParams();
    params.set("view", nextView);
    if (q) params.set("q", q);
    return `/transport-jobs?${params.toString()}`;
  }

  function clearSearchHref() {
    const params = new URLSearchParams();
    params.set("view", view);
    return `/transport-jobs?${params.toString()}`;
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1600px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Transport Jobs</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Manage transport allocations, drivers, vehicles, sell rates, supplier costs and invoice status.
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
            <a href={viewHref("active")} style={view === "active" ? activeTabBtn : tabBtn}>
              Active
            </a>
            <a href={viewHref("archived")} style={view === "archived" ? activeTabBtn : tabBtn}>
              Archived
            </a>
            <a href={viewHref("all")} style={view === "all" ? activeTabBtn : tabBtn}>
              All
            </a>
          </div>

          <form method="get" style={searchRow}>
            <input type="hidden" name="view" value={view} />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search ref, address, load, status or invoice status..."
              style={searchInput}
            />
            <button type="submit" style={primaryBtn}>
              Search
            </button>
            <a href={clearSearchHref()} style={secondaryBtn}>
              Clear
            </a>
          </form>

          <div style={statsRow}>
            <MiniStat label="Visible jobs" value={rows.length} />
            <MiniStat label="Active jobs" value={activeCount} />
            <MiniStat label="Charge total" value={fmtMoney(chargeTotal)} />
            <MiniStat label="Supplier total" value={fmtMoney(supplierTotal)} />
            <MiniStat label="Outstanding total" value={fmtMoney(outstandingTotal)} />
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : rows.length === 0 ? (
            <div style={emptyBox}>No transport jobs found for this view.</div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1700 }}>
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
                    <th align="left" style={thStyle}>Charge</th>
                    <th align="left" style={thStyle}>Supplier Cost</th>
                    <th align="left" style={thStyle}>Invoice</th>
                    <th align="left" style={thStyle}>Linked Job</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item: any) => {
                    const vehicle = first(item.vehicles);
                    const driver = first(item.operators);
                    const client = first(item.clients);
                    const linkedJob = first(item.jobs);
                    const supplierName = item.supplier_id
                      ? supplierMap.get(item.supplier_id) ?? "Supplier"
                      : null;

                    const totalInvoice = Number(
                      item.total_invoice ?? item.agreed_sell_rate ?? item.price ?? 0
                    );
                    const safeTotalInvoice = Number.isFinite(totalInvoice) ? totalInvoice : 0;
                    const amountPaid = clampMoney(
                      Number(item.amount_paid ?? 0),
                      0,
                      safeTotalInvoice
                    );
                    const amountOutstanding = Math.max(safeTotalInvoice - amountPaid, 0);

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
                          {item.load_description ? (
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                              {item.load_description}
                            </div>
                          ) : null}
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
                          <StatusBadge value={item.status} archived={!!item.archived} />
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontWeight: 900 }}>
                            {fmtMoney(item.agreed_sell_rate ?? item.price)}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontWeight: 900 }}>
                            {item.supplier_cost != null ? fmtMoney(item.supplier_cost) : "—"}
                          </div>
                          {supplierName ? (
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                              {supplierName}
                            </div>
                          ) : null}
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "grid", gap: 6 }}>
                            <span style={invoicePill(item.invoice_status)}>
                              {item.invoice_status ?? "Not Invoiced"}
                            </span>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                              Total: {fmtMoney(safeTotalInvoice)}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                              Paid: {fmtMoney(amountPaid)}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 800 }}>
                              Outstanding: {fmtMoney(amountOutstanding)}
                            </div>
                          </div>
                        </td>

                        <td style={tdStyle}>
                          {linkedJob?.job_number ? (
                            <a href={`/jobs/${linkedJob.id}`} style={inlineLinkStyle}>
                              #{linkedJob.job_number}
                              {linkedJob.site_name ? ` • ${linkedJob.site_name}` : ""}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <a href={`/transport-jobs/${item.id}`} style={actionBtn}>
                              Open
                            </a>

                            <form
                              action={updateTransportInvoiceStatus}
                              style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
                            >
                              <input type="hidden" name="transport_job_id" value={item.id} />
                              <input type="hidden" name="return_view" value={view} />
                              <input type="hidden" name="return_q" value={q} />

                              <select
                                name="invoice_status"
                                defaultValue={item.invoice_status ?? "Not Invoiced"}
                                style={miniSelect}
                              >
                                <option value="Not Invoiced">Not Invoiced</option>
                                <option value="Invoiced">Invoiced</option>
                                <option value="Part Paid">Part Paid</option>
                                <option value="Paid">Paid</option>
                              </select>

                              <input
                                name="amount_paid"
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={amountPaid > 0 ? amountPaid.toFixed(2) : ""}
                                placeholder="Amount paid"
                                style={moneyInput}
                              />

                              <button type="submit" style={saveMiniBtn}>
                                Save
                              </button>
                            </form>
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

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div style={miniStatCard}>
      <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

function invoicePill(value: string | null | undefined): React.CSSProperties {
  const v = String(value ?? "").toLowerCase();

  if (v === "paid") {
    return {
      display: "inline-block",
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (v === "part paid") {
    return {
      display: "inline-block",
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  if (v === "invoiced") {
    return {
      display: "inline-block",
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      background: "rgba(0,120,255,0.12)",
      color: "#0b57d0",
      border: "1px solid rgba(0,120,255,0.20)",
    };
  }

  return {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    background: "rgba(120,120,120,0.12)",
    color: "#555",
    border: "1px solid rgba(120,120,120,0.18)",
  };
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

const searchRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  marginTop: 16,
};

const searchInput: React.CSSProperties = {
  flex: "1 1 360px",
  minWidth: 260,
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const statsRow: React.CSSProperties = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const miniStatCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.28)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
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
  border: "none",
  cursor: "pointer",
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

const inlineLinkStyle: React.CSSProperties = {
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
};

const miniSelect: React.CSSProperties = {
  minWidth: 140,
  height: 36,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
};

const moneyInput: React.CSSProperties = {
  width: 120,
  height: 36,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const saveMiniBtn: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const successBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#111",
  fontWeight: 800,
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
