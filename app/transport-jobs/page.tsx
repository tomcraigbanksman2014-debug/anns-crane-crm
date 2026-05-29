import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { writeAuditLog } from "../lib/audit";
import StatusBadge from "../components/StatusBadge";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAccessContext, canViewInvoices } from "../lib/access";

import ServerSubmitButton from "../components/ServerSubmitButton";

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

function cleanParam(value: unknown) {
  return String(value ?? "").trim();
}

const TRANSPORT_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "provisional", label: "Provisional" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "late_cancelled", label: "Late Cancelled" },
];

const TRANSPORT_JOB_TYPE_OPTIONS = [
  { value: "haulage", label: "Haulage" },
  { value: "delivery", label: "Delivery" },
  { value: "collection", label: "Collection" },
  { value: "ballast", label: "Ballast" },
  { value: "crane_support", label: "Crane Support" },
  { value: "on_site_hiab", label: "On-site HIAB" },
];

function buildTransportJobsPath(params: Record<string, string | null | undefined>) {
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
  add("driver", params.driver);
  add("vehicle", params.vehicle);
  add("job_type", params.job_type);
  add("success", params.success);
  add("error", params.error);

  const qs = search.toString();
  return qs ? `/transport-jobs?${qs}` : "/transport-jobs";
}

function buildTransportExportPath(params: Record<string, string | null | undefined>) {
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
  add("driver", params.driver);
  add("vehicle", params.vehicle);
  add("job_type", params.job_type);

  const qs = search.toString();
  return qs ? `/api/export/transport-jobs?${qs}` : "/api/export/transport-jobs";
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
    driver: cleanParam(formData.get("return_driver")),
    vehicle: cleanParam(formData.get("return_vehicle")),
    job_type: cleanParam(formData.get("return_job_type")),
  };
}

function includesText(value: unknown, needle: string) {
  return String(value ?? "").toLowerCase().includes(needle);
}

function rowMatchesSearch(item: any, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;

  const vehicle = first(item.vehicles);
  const driver = first(item.operators);
  const client = first(item.clients);
  const linkedJob = first(item.jobs);

  return [
    item.transport_number,
    item.collection_address,
    item.delivery_address,
    item.load_description,
    item.job_type,
    item.status,
    item.invoice_status,
    client?.company_name,
    vehicle?.name,
    vehicle?.reg_number,
    driver?.full_name,
    linkedJob?.job_number,
    linkedJob?.site_name,
  ].some((value) => includesText(value, needle));
}

function rowMatchesDateWindow(item: any, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return true;

  const startDate = String(item.transport_date ?? "").slice(0, 10);
  const endDate = String(item.delivery_date ?? item.transport_date ?? "").slice(0, 10);

  if (!startDate && !endDate) return false;
  if (dateFrom && endDate && endDate < dateFrom) return false;
  if (dateTo && startDate && startDate > dateTo) return false;
  return true;
}

async function updateTransportInvoiceStatus(formData: FormData) {
  "use server";

  const access = await getAccessContext();

  if (!access.user) {
    redirect("/login?next=/transport-jobs");
  }

  if (!canViewInvoices(access)) {
    redirect(
      buildTransportJobsPath({
        ...getReturnParams(formData),
        error: "You do not have permission to update transport invoices.",
      })
    );
  }

  const supabase = createSupabaseServerClient();
  const returnParams = getReturnParams(formData);

  const transportJobId = String(formData.get("transport_job_id") ?? "");
  const invoiceStatus = String(formData.get("invoice_status") ?? "Not Invoiced");
  const rawAmountPaid = String(formData.get("amount_paid") ?? "").trim();

  if (!transportJobId) {
    redirect(buildTransportJobsPath({ ...returnParams, error: "Missing transport job id." }));
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
    redirect(buildTransportJobsPath({ ...returnParams, error: existingError?.message || "Transport job not found." }));
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
      redirect(buildTransportJobsPath({ ...returnParams, error: "Enter the amount paid before saving Part Paid." }));
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
    redirect(buildTransportJobsPath({ ...returnParams, success: "Invoice details already up to date." }));
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
    redirect(buildTransportJobsPath({ ...returnParams, error: error.message }));
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

  redirect(buildTransportJobsPath({ ...returnParams, success: successText }));
}

type TransportJobsPageProps = {
  searchParams?: {
    view?: string;
    invoice?: string;
    q?: string;
    customer?: string;
    date_from?: string;
    date_to?: string;
    status?: string;
    driver?: string;
    vehicle?: string;
    job_type?: string;
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
  const invoiceFilter = String(searchParams?.invoice ?? "all").toLowerCase();
  const q = cleanParam(searchParams?.q);
  const customerId = cleanParam(searchParams?.customer);
  const dateFrom = cleanParam(searchParams?.date_from).slice(0, 10);
  const dateTo = cleanParam(searchParams?.date_to).slice(0, 10);
  const statusFilter = cleanParam(searchParams?.status);
  const driverId = cleanParam(searchParams?.driver);
  const vehicleId = cleanParam(searchParams?.vehicle);
  const jobTypeFilter = cleanParam(searchParams?.job_type);
  const errorMessage = String(searchParams?.error ?? "");
  const successMessage = String(searchParams?.success ?? "");

  const currentFilters = {
    view,
    invoice: invoiceFilter,
    q,
    customer: customerId,
    date_from: dateFrom,
    date_to: dateTo,
    status: statusFilter,
    driver: driverId,
    vehicle: vehicleId,
    job_type: jobTypeFilter,
  };

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
    // no archived filter
  } else {
    query = query.eq("archived", false);
  }

  if (showInvoices) {
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
  }

  if (customerId) query = query.eq("client_id", customerId);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (driverId) query = query.eq("operator_id", driverId);
  if (vehicleId) query = query.eq("vehicle_id", vehicleId);
  if (jobTypeFilter) query = query.eq("job_type", jobTypeFilter);

  const [
    { data, error },
    { data: suppliers },
    { data: clients },
    { data: drivers },
    { data: vehicles },
  ] = await Promise.all([
    query,
    supabase.from("suppliers").select("id, company_name").order("company_name", { ascending: true }),
    supabase.from("clients").select("id, company_name").order("company_name", { ascending: true }),
    supabase.from("operators").select("id, full_name").order("full_name", { ascending: true }),
    supabase.from("vehicles").select("id, name, reg_number").order("name", { ascending: true }),
  ]);

  const supplierMap = new Map<string, string>();
  (suppliers ?? []).forEach((s: any) => {
    supplierMap.set(s.id, s.company_name ?? "Supplier");
  });

  const rows = (data ?? []).filter(
    (item: any) => rowMatchesDateWindow(item, dateFrom, dateTo) && rowMatchesSearch(item, q)
  );

  const activeCount = rows.filter(
    (r: any) => !["cancelled", "late_cancelled"].includes(String(r.status ?? "").toLowerCase())
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
    return buildTransportJobsPath({ ...currentFilters, view: nextView });
  }

  function invoiceHref(nextInvoice: string) {
    return buildTransportJobsPath({ ...currentFilters, invoice: nextInvoice });
  }

  const clearFiltersHref = buildTransportJobsPath({ view });
  const exportHref = buildTransportExportPath(currentFilters);

  const filterSummary = [
    q ? `Search: ${q}` : "",
    customerId ? "Customer" : "",
    dateFrom || dateTo ? `Date: ${dateFrom || "start"} to ${dateTo || "end"}` : "",
    statusFilter ? `Status: ${statusFilter}` : "",
    driverId ? "Driver" : "",
    vehicleId ? "Vehicle" : "",
    jobTypeFilter ? `Type: ${prettyJobType(jobTypeFilter)}` : "",
    showInvoices && invoiceFilter !== "all" ? `Invoice: ${invoiceFilter.replace("_", " ")}` : "",
  ].filter(Boolean);

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
              <a href={exportHref} style={secondaryBtn}>
                Export filtered CSV
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

          {showInvoices ? (
            <div style={tabsRow}>
              <a href={invoiceHref("all")} style={invoiceFilter === "all" ? activeTabBtn : tabBtn}>
                All invoices
              </a>
              <a href={invoiceHref("outstanding")} style={invoiceFilter === "outstanding" ? activeTabBtn : tabBtn}>
                Outstanding
              </a>
              <a href={invoiceHref("not_invoiced")} style={invoiceFilter === "not_invoiced" ? activeTabBtn : tabBtn}>
                Not invoiced
              </a>
              <a href={invoiceHref("invoiced")} style={invoiceFilter === "invoiced" ? activeTabBtn : tabBtn}>
                Invoiced
              </a>
              <a href={invoiceHref("part_paid")} style={invoiceFilter === "part_paid" ? activeTabBtn : tabBtn}>
                Part paid
              </a>
              <a href={invoiceHref("paid")} style={invoiceFilter === "paid" ? activeTabBtn : tabBtn}>
                Paid
              </a>
            </div>
          ) : null}

          {!showInvoices ? (
            <div style={infoBox}>Invoice visibility is disabled for your staff role.</div>
          ) : null}

          <form method="get" style={filterPanel}>
            <input type="hidden" name="view" value={view} />
            {showInvoices ? <input type="hidden" name="invoice" value={invoiceFilter} /> : null}

            <div style={filterGrid}>
              <label style={fieldLabelWide}>
                Search
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Ref, customer, address, load, driver, vehicle, linked job..."
                  style={filterInput}
                />
              </label>

              <label style={fieldLabel}>
                Customer
                <select name="customer" defaultValue={customerId} style={filterInput}>
                  <option value="">All customers</option>
                  {(clients ?? []).map((client: any) => (
                    <option key={client.id} value={client.id}>
                      {client.company_name ?? "Unnamed customer"}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                From date
                <input type="date" name="date_from" defaultValue={dateFrom} style={filterInput} />
              </label>

              <label style={fieldLabel}>
                To date
                <input type="date" name="date_to" defaultValue={dateTo} style={filterInput} />
              </label>

              <label style={fieldLabel}>
                Status
                <select name="status" defaultValue={statusFilter} style={filterInput}>
                  <option value="">All statuses</option>
                  {TRANSPORT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                Driver
                <select name="driver" defaultValue={driverId} style={filterInput}>
                  <option value="">All drivers</option>
                  {(drivers ?? []).map((driver: any) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.full_name ?? "Unnamed driver"}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                Vehicle
                <select name="vehicle" defaultValue={vehicleId} style={filterInput}>
                  <option value="">All vehicles</option>
                  {(vehicles ?? []).map((vehicle: any) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.name ?? "Unnamed vehicle"}{vehicle.reg_number ? ` (${vehicle.reg_number})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                Job type
                <select name="job_type" defaultValue={jobTypeFilter} style={filterInput}>
                  <option value="">All types</option>
                  {TRANSPORT_JOB_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              <ServerSubmitButton style={primaryBtn} pendingText="Filtering…">
                Apply filters
              </ServerSubmitButton>
              <a href={clearFiltersHref} style={secondaryBtn}>
                Clear filters
              </a>
              <a href={exportHref} style={secondaryBtn}>
                Export filtered CSV
              </a>
              {filterSummary.length ? (
                <span style={{ fontSize: 12, opacity: 0.72 }}>
                  {filterSummary.join(" • ")}
                </span>
              ) : null}
            </div>
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
            <div style={emptyBox}>No transport jobs found for these filters.</div>
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
                                <input type="hidden" name="return_invoice" value={invoiceFilter} />
                                <input type="hidden" name="return_q" value={q} />
                                <input type="hidden" name="return_customer" value={customerId} />
                                <input type="hidden" name="return_date_from" value={dateFrom} />
                                <input type="hidden" name="return_date_to" value={dateTo} />
                                <input type="hidden" name="return_status" value={statusFilter} />
                                <input type="hidden" name="return_driver" value={driverId} />
                                <input type="hidden" name="return_vehicle" value={vehicleId} />
                                <input type="hidden" name="return_job_type" value={jobTypeFilter} />

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

                                <ServerSubmitButton style={saveMiniBtn} pendingText="Working…">
                                  Save
                                </ServerSubmitButton>
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

const filterPanel: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.36)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const filterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const fieldLabel: React.CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(0,0,0,0.78)",
};

const fieldLabelWide: React.CSSProperties = {
  ...fieldLabel,
  gridColumn: "span 2",
};

const filterInput: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
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
