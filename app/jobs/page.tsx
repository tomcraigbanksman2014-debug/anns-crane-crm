import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import StatusBadge from "../components/StatusBadge";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "../lib/audit";

import ServerSubmitButton from "../components/ServerSubmitButton";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function money(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function clampMoney(value: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function renderDateRange(startDate: string | null | undefined, endDate: string | null | undefined) {
  const from = fmtDate(startDate);
  const to = fmtDate(endDate);

  if (!startDate && !endDate) return "—";
  if (from === to) return from;
  return `${from} → ${to}`;
}

function netInvoiceValue(row: any) {
  const subtotal = Number(row?.invoice_subtotal ?? 0);
  if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;

  const invoiceAmount = Number(row?.invoice_amount ?? 0);
  if (Number.isFinite(invoiceAmount) && invoiceAmount > 0) return invoiceAmount;

  const invoiceTotal = Number(row?.invoice_total ?? row?.total_invoice ?? 0);
  const vat = Number(row?.invoice_vat ?? 0);
  if (Number.isFinite(invoiceTotal) && invoiceTotal > 0 && Number.isFinite(vat) && vat > 0) {
    return Math.max(invoiceTotal - vat, 0);
  }

  const totalInvoice = Number(row?.total_invoice ?? 0);
  return Number.isFinite(totalInvoice) ? totalInvoice : 0;
}

const JOB_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "provisional", label: "Provisional" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "late_cancelled", label: "Late Cancelled" },
];

function cleanParam(value: unknown) {
  return String(value ?? "").trim();
}

function buildJobsPath(params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();

  const add = (key: string, value: string | null | undefined) => {
    const clean = cleanParam(value);
    if (clean) search.set(key, clean);
  };

  add("view", params.view && params.view !== "active" ? params.view : "");
  add("invoice", params.invoice && params.invoice !== "all" ? params.invoice : "");
  add("q", params.q);
  add("customer", params.customer);
  add("date_from", params.date_from);
  add("date_to", params.date_to);
  add("status", params.status);
  add("operator", params.operator);
  add("equipment", params.equipment);
  add("success", params.success);
  add("error", params.error);

  const qs = search.toString();
  return qs ? `/jobs?${qs}` : "/jobs";
}

function getReturnParams(formData: FormData) {
  return {
    view: cleanParam(formData.get("return_view")) || "active",
    invoice: cleanParam(formData.get("return_invoice")) || "all",
    q: cleanParam(formData.get("return_q")),
    customer: cleanParam(formData.get("return_customer")),
    date_from: cleanParam(formData.get("return_date_from")),
    date_to: cleanParam(formData.get("return_date_to")),
    status: cleanParam(formData.get("return_status")),
    operator: cleanParam(formData.get("return_operator")),
    equipment: cleanParam(formData.get("return_equipment")),
  };
}

function includesText(value: unknown, needle: string) {
  return String(value ?? "").toLowerCase().includes(needle);
}

function rowMatchesSearch(job: any, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;

  const client = first(job.clients);
  const operator = first(job.operators);
  const equipment = first(job.equipment);

  return [
    job.job_number,
    job.site_name,
    job.site_address,
    job.status,
    job.invoice_status,
    client?.company_name,
    operator?.full_name,
    equipment?.name,
    equipment?.asset_number,
  ].some((value) => includesText(value, needle));
}

function rowMatchesDateWindow(job: any, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return true;

  const startDate = String(job.start_date ?? job.job_date ?? "").slice(0, 10);
  const endDate = String(job.end_date ?? job.job_date ?? job.start_date ?? "").slice(0, 10);

  if (!startDate && !endDate) return false;
  if (dateFrom && endDate && endDate < dateFrom) return false;
  if (dateTo && startDate && startDate > dateTo) return false;
  return true;
}

async function updateInvoiceStatus(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const returnParams = getReturnParams(formData);

  const jobId = String(formData.get("job_id") ?? "");
  const invoiceStatus = String(formData.get("invoice_status") ?? "Not Invoiced");
  const rawAmountPaid = String(formData.get("amount_paid") ?? "").trim();

  if (!jobId) {
    redirect(buildJobsPath({ ...returnParams, error: "Missing job id." }));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existingJob, error: existingError } = await supabase
    .from("jobs")
    .select("id, job_number, invoice_status, total_invoice, invoice_total, invoice_amount, invoice_subtotal, invoice_vat, amount_paid")
    .eq("id", jobId)
    .single();

  if (existingError || !existingJob) {
    redirect(buildJobsPath({ ...returnParams, error: existingError?.message || "Job not found." }));
  }

  const totalInvoice = netInvoiceValue(existingJob);
  const currentStatus = String(existingJob.invoice_status ?? "Not Invoiced");
  const currentAmountPaid = Number(existingJob.amount_paid ?? 0);

  let amountPaid = currentAmountPaid;

  if (invoiceStatus === "Part Paid") {
    const parsed = Number(rawAmountPaid || 0);
    amountPaid = clampMoney(parsed, 0, totalInvoice);

    if (amountPaid <= 0) {
      redirect(buildJobsPath({ ...returnParams, error: "Enter the amount paid before saving Part Paid." }));
    }
  } else if (invoiceStatus === "Paid") {
    amountPaid = totalInvoice;
  } else {
    amountPaid = 0;
  }

  if (
    currentStatus === invoiceStatus &&
    Number(currentAmountPaid.toFixed(2)) === Number(amountPaid.toFixed(2))
  ) {
    redirect(buildJobsPath({ ...returnParams, success: "Invoice details already up to date." }));
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      invoice_status: invoiceStatus,
      amount_paid: amountPaid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  revalidatePath("/jobs");
  revalidatePath("/dashboard");

  if (error) {
    redirect(buildJobsPath({ ...returnParams, error: error.message }));
  }

  await writeAuditLog({
    actor_user_id: user?.id ?? null,
    actor_username: fromAuthEmail(user?.email ?? null) || null,
    action: "job_invoice_status_updated",
    entity_type: "job",
    entity_id: jobId,
    meta: {
      job_number: existingJob.job_number ?? null,
      previous_invoice_status: currentStatus,
      new_invoice_status: invoiceStatus,
      previous_amount_paid: currentAmountPaid,
      new_amount_paid: amountPaid,
      total_invoice: totalInvoice,
    },
  });

  const successText =
    invoiceStatus === "Part Paid"
      ? `Invoice updated to Part Paid (£${amountPaid.toFixed(2)} received)`
      : invoiceStatus === "Paid"
      ? "Invoice updated to Paid"
      : `Invoice status updated to ${invoiceStatus}`;

  redirect(buildJobsPath({ ...returnParams, success: successText }));
}

type JobsPageProps = {
  searchParams?: {
    view?: string;
    invoice?: string;
    q?: string;
    customer?: string;
    date_from?: string;
    date_to?: string;
    status?: string;
    operator?: string;
    equipment?: string;
    error?: string;
    success?: string;
  };
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const supabase = createSupabaseServerClient();
  const view = String(searchParams?.view ?? "active").toLowerCase();
  const invoiceFilter = String(searchParams?.invoice ?? "all").toLowerCase();
  const q = cleanParam(searchParams?.q);
  const customerId = cleanParam(searchParams?.customer);
  const dateFrom = cleanParam(searchParams?.date_from).slice(0, 10);
  const dateTo = cleanParam(searchParams?.date_to).slice(0, 10);
  const statusFilter = cleanParam(searchParams?.status);
  const operatorId = cleanParam(searchParams?.operator);
  const equipmentId = cleanParam(searchParams?.equipment);
  const errorMessage = String(searchParams?.error ?? "");
  const successMessage = String(searchParams?.success ?? "");

  const baseParams = {
    view,
    invoice: invoiceFilter,
    q,
    customer: customerId,
    date_from: dateFrom,
    date_to: dateTo,
    status: statusFilter,
    operator: operatorId,
    equipment: equipmentId,
  };

  const jobsHref = (overrides: Partial<typeof baseParams>) => buildJobsPath({ ...baseParams, ...overrides });
  const exportSearch = new URLSearchParams();
  Object.entries(baseParams).forEach(([key, value]) => {
    const clean = cleanParam(value);
    if (clean && !(key === "view" && clean === "active") && !(key === "invoice" && clean === "all")) {
      exportSearch.set(key, clean);
    }
  });
  const exportUrl = `/api/export/jobs${exportSearch.toString() ? `?${exportSearch.toString()}` : ""}`;

  const [customersResult, operatorsResult, equipmentResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name")
      .or("archived.is.null,archived.eq.false")
      .order("company_name", { ascending: true })
      .limit(1000),
    supabase
      .from("operators")
      .select("id, full_name")
      .order("full_name", { ascending: true })
      .limit(1000),
    supabase
      .from("equipment")
      .select("id, name, asset_number")
      .order("name", { ascending: true })
      .limit(1000),
  ]);

  const customerOptions = customersResult.data ?? [];
  const operatorOptions = operatorsResult.data ?? [];
  const equipmentOptions = equipmentResult.data ?? [];

  let query = supabase
    .from("jobs")
    .select(`
      id,
      job_number,
      job_date,
      start_date,
      end_date,
      start_time,
      end_time,
      site_name,
      site_address,
      status,
      archived,
      invoice_status,
      invoice_number,
      invoice_date,
      invoice_created_at,
      invoice_subtotal,
      invoice_amount,
      invoice_vat,
      invoice_total,
      total_invoice,
      amount_paid,
      clients:client_id (
        id,
        company_name
      ),
      operators:operator_id (
        id,
        full_name
      ),
      equipment:equipment_id (
        id,
        name,
        asset_number
      )
    `)
    .order("start_date", { ascending: true })
    .order("job_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (view === "archived") {
    query = query.eq("archived", true);
  } else if (view === "all") {
    // no archived filter
  } else {
    query = query.eq("archived", false);
  }

  if (invoiceFilter === "outstanding") {
    query = query.in("invoice_status", ["Not Invoiced", "Invoiced", "Part Paid"]);
  } else if (["not_invoiced", "invoiced", "part_paid", "paid"].includes(invoiceFilter)) {
    const invoiceMap: Record<string, string> = {
      not_invoiced: "Not Invoiced",
      invoiced: "Invoiced",
      part_paid: "Part Paid",
      paid: "Paid",
    };
    query = query.eq("invoice_status", invoiceMap[invoiceFilter]);
  }

  if (customerId) query = query.eq("client_id", customerId);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (operatorId) query = query.eq("operator_id", operatorId);
  if (equipmentId) query = query.eq("equipment_id", equipmentId);

  const { data, error } = await query;
  const rows = (data ?? []).filter((job: any) => rowMatchesDateWindow(job, dateFrom, dateTo) && rowMatchesSearch(job, q));
  const hasExtraFilters = Boolean(q || customerId || dateFrom || dateTo || statusFilter || operatorId || equipmentId);

  return (
    <ClientShell>
      <div style={{ width: "min(1600px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Jobs</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Manage crane jobs, operators, invoices and site details.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href={exportUrl} style={secondaryBtn}>
                Export CSV
              </a>
              <a href="/jobs/new" style={primaryBtn}>
                + New job
              </a>
            </div>
          </div>

          <div style={tabsRow}>
            <a href={jobsHref({ view: "active" })} style={view === "active" ? activeTabBtn : tabBtn}>
              Active
            </a>
            <a href={jobsHref({ view: "archived" })} style={view === "archived" ? activeTabBtn : tabBtn}>
              Archived
            </a>
            <a href={jobsHref({ view: "all" })} style={view === "all" ? activeTabBtn : tabBtn}>
              All
            </a>
          </div>

          <div style={tabsRow}>
            <a href={jobsHref({ invoice: "all" })} style={invoiceFilter === "all" ? activeTabBtn : tabBtn}>
              All invoices
            </a>
            <a href={jobsHref({ invoice: "outstanding" })} style={invoiceFilter === "outstanding" ? activeTabBtn : tabBtn}>
              Outstanding invoices
            </a>
            <a href={jobsHref({ invoice: "not_invoiced" })} style={invoiceFilter === "not_invoiced" ? activeTabBtn : tabBtn}>
              Not invoiced
            </a>
            <a href={jobsHref({ invoice: "invoiced" })} style={invoiceFilter === "invoiced" ? activeTabBtn : tabBtn}>
              Invoiced
            </a>
            <a href={jobsHref({ invoice: "part_paid" })} style={invoiceFilter === "part_paid" ? activeTabBtn : tabBtn}>
              Part paid
            </a>
            <a href={jobsHref({ invoice: "paid" })} style={invoiceFilter === "paid" ? activeTabBtn : tabBtn}>
              Paid
            </a>
          </div>

          <form action="/jobs" method="get" style={filterCard}>
            {view && view !== "active" ? <input type="hidden" name="view" value={view} /> : null}
            {invoiceFilter && invoiceFilter !== "all" ? <input type="hidden" name="invoice" value={invoiceFilter} /> : null}

            <div style={filterGrid}>
              <label style={filterLabel}>
                Search
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Job #, site, customer, operator..."
                  style={filterInput}
                />
              </label>

              <label style={filterLabel}>
                Customer
                <select name="customer" defaultValue={customerId} style={filterInput}>
                  <option value="">All customers</option>
                  {customerOptions.map((customer: any) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company_name ?? "Unnamed customer"}
                    </option>
                  ))}
                </select>
              </label>

              <label style={filterLabel}>
                From date
                <input name="date_from" type="date" defaultValue={dateFrom} style={filterInput} />
              </label>

              <label style={filterLabel}>
                To date
                <input name="date_to" type="date" defaultValue={dateTo} style={filterInput} />
              </label>

              <label style={filterLabel}>
                Status
                <select name="status" defaultValue={statusFilter} style={filterInput}>
                  <option value="">All statuses</option>
                  {JOB_STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={filterLabel}>
                Operator
                <select name="operator" defaultValue={operatorId} style={filterInput}>
                  <option value="">All operators</option>
                  {operatorOptions.map((operator: any) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.full_name ?? "Unnamed operator"}
                    </option>
                  ))}
                </select>
              </label>

              <label style={filterLabel}>
                Crane / equipment
                <select name="equipment" defaultValue={equipmentId} style={filterInput}>
                  <option value="">All equipment</option>
                  {equipmentOptions.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name ?? "Unnamed equipment"}
                      {item.asset_number ? ` (${item.asset_number})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              <button type="submit" style={primaryButtonLike}>Apply filters</button>
              {hasExtraFilters ? (
                <a href={jobsHref({ q: "", customer: "", date_from: "", date_to: "", status: "", operator: "", equipment: "" })} style={secondaryBtn}>
                  Clear filters
                </a>
              ) : null}
              <span style={{ fontSize: 13, opacity: 0.72, fontWeight: 800 }}>
                Showing {rows.length} job{rows.length === 1 ? "" : "s"}
              </span>
            </div>
          </form>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : rows.length === 0 ? (
            <div style={emptyBox}>No jobs found for the selected filters.</div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Job #</th>
                    <th align="left" style={thStyle}>Dates</th>
                    <th align="left" style={thStyle}>Time</th>
                    <th align="left" style={thStyle}>Customer</th>
                    <th align="left" style={thStyle}>Operator</th>
                    <th align="left" style={thStyle}>Equipment</th>
                    <th align="left" style={thStyle}>Site</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Invoice / value ex VAT</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((job: any) => {
                    const client = first(job.clients);
                    const operator = first(job.operators);
                    const equipment = first(job.equipment);
                    const totalInvoice = netInvoiceValue(job);
                    const amountPaid = clampMoney(Number(job.amount_paid ?? 0), 0, totalInvoice);
                    const amountOutstanding = Math.max(totalInvoice - amountPaid, 0);

                    const startDate = job.start_date ?? job.job_date ?? null;
                    const endDate = job.end_date ?? job.job_date ?? null;

                    return (
                      <tr key={job.id}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 900 }}>
                            #{job.job_number ?? "—"}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontWeight: 800 }}>
                            {renderDateRange(startDate, endDate)}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          {job.start_time || job.end_time
                            ? `${job.start_time ?? "—"} - ${job.end_time ?? "—"}`
                            : "—"}
                        </td>

                        <td style={tdStyle}>{client?.company_name ?? "—"}</td>

                        <td style={tdStyle}>{operator?.full_name ?? "—"}</td>

                        <td style={tdStyle}>
                          {equipment?.name ?? "—"}
                          {equipment?.asset_number ? ` (${equipment.asset_number})` : ""}
                        </td>

                        <td style={tdStyle}>
                          <div>{job.site_name ?? "—"}</div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            {job.site_address ?? "—"}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <StatusBadge value={job.status} archived={!!job.archived} />
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontWeight: 800 }}>
                            {job.invoice_status ?? "Not Invoiced"}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            #{job.invoice_number ?? "—"}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            Value ex VAT: {money(totalInvoice)}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            Paid: {money(amountPaid)}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.88, fontWeight: 800 }}>
                            Outstanding: {money(amountOutstanding)}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <a href={`/jobs/${job.id}`} style={actionBtn}>
                              Open
                            </a>

                            <form action={updateInvoiceStatus} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <input type="hidden" name="job_id" value={job.id} />
                              <input type="hidden" name="return_view" value={view} />
                              <input type="hidden" name="return_invoice" value={invoiceFilter} />
                              <input type="hidden" name="return_q" value={q} />
                              <input type="hidden" name="return_customer" value={customerId} />
                              <input type="hidden" name="return_date_from" value={dateFrom} />
                              <input type="hidden" name="return_date_to" value={dateTo} />
                              <input type="hidden" name="return_status" value={statusFilter} />
                              <input type="hidden" name="return_operator" value={operatorId} />
                              <input type="hidden" name="return_equipment" value={equipmentId} />

                              <select
                                name="invoice_status"
                                defaultValue={job.invoice_status ?? "Not Invoiced"}
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

                              <ServerSubmitButton style={saveMiniBtn} pendingText="Working…">
                                Save
                              </ServerSubmitButton>
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

const filterCard: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.48)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const filterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const filterLabel: React.CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 12,
  fontWeight: 900,
};

const filterInput: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(255,255,255,0.95)",
  boxSizing: "border-box",
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

const primaryButtonLike: React.CSSProperties = {
  ...primaryBtn,
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
  background: "rgba(255,255,255,0.75)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
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
  border: "1px solid rgba(255,0,0,0.22)",
};

const emptyBox: React.CSSProperties = {
  marginTop: 16,
  padding: "18px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};
