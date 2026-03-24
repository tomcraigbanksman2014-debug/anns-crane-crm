import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { writeAuditLog } from "../lib/audit";
import StatusBadge from "../components/StatusBadge";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAccessContext, canViewInvoices } from "../lib/access";

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

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function prettyJobType(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "haulage") return "Haulage";
  if (v === "delivery") return "Delivery";
  if (v === "collection") return "Collection";
  if (v === "ballast") return "Ballast";
  if (v === "crane_support") return "Crane Support";
  if (v === "on_site_hiab") return "On-site HIAB";
  return value ?? "—";
}

function clampMoney(value: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

async function updateTransportInvoiceStatus(formData: FormData) {
  "use server";

  const access = await getAccessContext();

  if (!access.user) {
    redirect("/login?next=/transport-jobs");
  }

  if (!canViewInvoices(access)) {
    redirect(
      `/transport-jobs?error=${encodeURIComponent(
        "You do not have permission to update transport invoices."
      )}`
    );
  }

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existingJob, error: existingError } = await supabase
    .from("transport_jobs")
    .select("id, transport_number, invoice_status, total_invoice, agreed_sell_rate, price, amount_paid")
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

  await writeAuditLog({
    actor_user_id: user?.id ?? null,
    actor_username: fromAuthEmail(user?.email ?? null) || null,
    action: "transport_invoice_status_updated",
    entity_type: "transport_job",
    entity_id: transportJobId,
    meta: {
      transport_number: existingJob.transport_number ?? null,
      previous_invoice_status: currentStatus,
      new_invoice_status: invoiceStatus,
      previous_amount_paid: currentAmountPaid,
      new_amount_paid: amountPaid,
      total_invoice: safeTotalInvoice,
    },
  });

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
  const access = await getAccessContext();
  const showInvoices = canViewInvoices(access);

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
      delivery_date,
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
          ...(showInvoices ? [`invoice_status.ilike.%${safe}%`] : []),
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
      <div style={{ width: "min(1500px, 96vw)", margin: "0 auto" }}>
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

          {!showInvoices ? (
            <div style={infoBox}>Invoice visibility is disabled for your staff role.</div>
          ) : null}

          <form method="get" style={searchRow}>
            <input type="hidden" name="view" value={view} />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder={`Search ref, address, load, status${showInvoices ? " or invoice status" : ""}...`}
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
            {showInvoices ? <MiniStat label="Outstanding total" value={fmtMoney(outstandingTotal)} /> : null}
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : rows.length === 0 ? (
            <div style={emptyBox}>No transport jobs found for this view.</div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: showInvoices ? 1180 : 980 }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyleWide}>Ref / Route</th>
                    <th align="left" style={thStyle}>Schedule</th>
                    <th align="left" style={thStyle}>Customer</th>
                    <th align="left" style={thStyle}>Allocation</th>
                    <th align="left" style={thStyle}>Type</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Costs</th>
                    {showInvoices ? <th align="left" style={thStyle}>Invoice</th> : null}
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
                        <td style={tdStyleWide}>
                          <div style={{ fontWeight: 1000, fontSize: 15 }}>
                            {item.transport_number ?? "—"}
                          </div>
                          <div style={{ marginTop: 5, fontSize: 12, opacity: 0.78 }}>
                            {item.collection_address ?? "—"}
                          </div>
                          <div style={{ marginTop: 2, fontSize: 12, opacity: 0.78 }}>
                            → {item.delivery_address ?? "—"}
                          </div>
                          {item.load_description ? (
                            <div style={{ marginTop: 5, fontSize: 12, opacity: 0.84 }}>
                              {item.load_description}
                            </div>
                          ) : null}
                          {linkedJob?.job_number ? (
                            <div style={{ marginTop: 6, fontSize: 12 }}>
                              <a href={`/jobs/${linkedJob.id}`} style={inlineLinkStyle}>
                                Crane job #{linkedJob.job_number}
                                {linkedJob.site_name ? ` • ${linkedJob.site_name}` : ""}
                              </a>
                            </div>
                          ) : null}
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontWeight: 900, fontSize: 13 }}>
                            {fmtDate(item.transport_date)}
                            {item.delivery_date && item.delivery_date !== item.transport_date
                              ? ` → ${fmtDate(item.delivery_date)}`
                              : ""}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                            {item.collection_time ?? "—"}
                            <span style={{ opacity: 0.6 }}> → </span>
                            {item.delivery_time ?? "—"}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          {client?.company_name ?? "—"}
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontSize: 13, fontWeight: 800 }}>
                            {vehicle?.name ?? "Unassigned"}
                            {vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.78 }}>
                            {driver?.full_name ?? "No driver"}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          {prettyJobType(item.job_type)}
                        </td>

                        <td style={tdStyle}>
                          <StatusBadge value={item.status} archived={!!item.archived} />
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontSize: 13, fontWeight: 900 }}>
                            Charge: {fmtMoney(item.agreed_sell_rate ?? item.price)}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>
                            Supplier: {item.supplier_cost != null ? fmtMoney(item.supplier_cost) : "—"}
                          </div>
                          {supplierName ? (
                            <div style={{ marginTop: 3, fontSize: 12, opacity: 0.72 }}>
                              {supplierName}
                            </div>
                          ) : null}
                        </td>

                        {showInvoices ? (
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
                              <div style={{ fontSize: 12, opacity: 0.92, fontWeight: 900 }}>
                                Outstanding: {fmtMoney(amountOutstanding)}
                              </div>

                              <form action={updateTransportInvoiceStatus} style={{ display: "grid", gap: 6 }}>
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
                        ) : null}

                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <a href={`/transport-jobs/${item.id}`} style={actionBtn}>
                              Open
                            </a>
                            {item.archived ? (
                              <a href={`/transport-jobs/archived`} style={ghostBtn}>
                                Archived
                              </a>
                            ) : null}
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

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={statCard}>
      <div style={statLabel}>{label}</div>
      <div style={statValue}>{value}</div>
    </div>
  );
}

function invoicePill(status: string | null | undefined): React.CSSProperties {
  const value = String(status ?? "Not Invoiced").toLowerCase();

  if (value === "paid") {
    return {
      display: "inline-block",
      padding: "6px 10px",
      borderRadius: 999,
      background: "rgba(16,185,129,0.14)",
      color: "#047857",
      fontWeight: 900,
      fontSize: 12,
      width: "fit-content",
    };
  }

  if (value === "part paid") {
    return {
      display: "inline-block",
      padding: "6px 10px",
      borderRadius: 999,
      background: "rgba(245,158,11,0.14)",
      color: "#b45309",
      fontWeight: 900,
      fontSize: 12,
      width: "fit-content",
    };
  }

  if (value === "invoiced") {
    return {
      display: "inline-block",
      padding: "6px 10px",
      borderRadius: 999,
      background: "rgba(59,130,246,0.14)",
      color: "#1d4ed8",
      fontWeight: 900,
      fontSize: 12,
      width: "fit-content",
    };
  }

  return {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(107,114,128,0.14)",
    color: "#4b5563",
    fontWeight: 900,
    fontSize: 12,
    width: "fit-content",
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

const statsRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const thStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.78,
  whiteSpace: "nowrap",
};

const thStyleWide: React.CSSProperties = {
  ...thStyle,
  minWidth: 260,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  verticalAlign: "top",
};

const tdStyleWide: React.CSSProperties = {
  ...tdStyle,
  minWidth: 260,
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

const ghostBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "transparent",
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
  background: "rgba(255,255,255,0.75)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const searchInput: React.CSSProperties = {
  flex: "1 1 320px",
  minWidth: 260,
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
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
  width: "100%",
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

const statCard: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.36)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const statLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.74,
  fontWeight: 800,
};

const statValue: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 900,
  fontSize: 18,
};

const inlineLinkStyle: React.CSSProperties = {
  color: "#0b57d0",
  textDecoration: "none",
  fontWeight: 800,
};

const infoBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.20)",
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
  border: "1px solid rgba(255,0,0,0.22)",
};

const emptyBox: React.CSSProperties = {
  marginTop: 16,
  padding: "18px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};
