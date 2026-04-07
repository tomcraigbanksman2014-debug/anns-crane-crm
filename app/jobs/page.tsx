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

async function updateInvoiceStatus(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const jobId = String(formData.get("job_id") ?? "");
  const invoiceStatus = String(formData.get("invoice_status") ?? "Not Invoiced");
  const rawAmountPaid = String(formData.get("amount_paid") ?? "").trim();
  const view = String(formData.get("return_view") ?? "active");
  const invoice = String(formData.get("return_invoice") ?? "all");

  if (!jobId) {
    redirect(
      `/jobs?view=${encodeURIComponent(view)}&invoice=${encodeURIComponent(invoice)}&error=${encodeURIComponent("Missing job id.")}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existingJob, error: existingError } = await supabase
    .from("jobs")
    .select("id, job_number, invoice_status, total_invoice, amount_paid")
    .eq("id", jobId)
    .single();

  if (existingError || !existingJob) {
    redirect(
      `/jobs?view=${encodeURIComponent(view)}&invoice=${encodeURIComponent(invoice)}&error=${encodeURIComponent(existingError?.message || "Job not found.")}`
    );
  }

  const totalInvoice = Number(existingJob.total_invoice ?? 0);
  const currentStatus = String(existingJob.invoice_status ?? "Not Invoiced");
  const currentAmountPaid = Number(existingJob.amount_paid ?? 0);

  let amountPaid = currentAmountPaid;

  if (invoiceStatus === "Part Paid") {
    const parsed = Number(rawAmountPaid || 0);
    amountPaid = clampMoney(parsed, 0, totalInvoice);

    if (amountPaid <= 0) {
      redirect(
        `/jobs?view=${encodeURIComponent(view)}&invoice=${encodeURIComponent(invoice)}&error=${encodeURIComponent(
          "Enter the amount paid before saving Part Paid."
        )}`
      );
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
    redirect(
      `/jobs?view=${encodeURIComponent(view)}&invoice=${encodeURIComponent(invoice)}&success=${encodeURIComponent(
        "Invoice details already up to date."
      )}`
    );
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
    redirect(
      `/jobs?view=${encodeURIComponent(view)}&invoice=${encodeURIComponent(invoice)}&error=${encodeURIComponent(error.message)}`
    );
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

  redirect(
    `/jobs?view=${encodeURIComponent(view)}&invoice=${encodeURIComponent(invoice)}&success=${encodeURIComponent(successText)}`
  );
}

type JobsPageProps = {
  searchParams?: {
    view?: string;
    invoice?: string;
    error?: string;
    success?: string;
  };
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const supabase = createSupabaseServerClient();
  const view = String(searchParams?.view ?? "active").toLowerCase();
  const invoiceFilter = String(searchParams?.invoice ?? "all").toLowerCase();
  const errorMessage = String(searchParams?.error ?? "");
  const successMessage = String(searchParams?.success ?? "");

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
  }

  const { data, error } = await query;
  const rows = data ?? [];

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
              <a href={`/api/export/jobs?view=${view}&invoice=${invoiceFilter}`} style={secondaryBtn}>
                Export CSV
              </a>
              <a href="/jobs/new" style={primaryBtn}>
                + New job
              </a>
            </div>
          </div>

          <div style={tabsRow}>
            <a href={`/jobs?view=active&invoice=${invoiceFilter}`} style={view === "active" ? activeTabBtn : tabBtn}>
              Active
            </a>
            <a href={`/jobs?view=archived&invoice=${invoiceFilter}`} style={view === "archived" ? activeTabBtn : tabBtn}>
              Archived
            </a>
            <a href={`/jobs?view=all&invoice=${invoiceFilter}`} style={view === "all" ? activeTabBtn : tabBtn}>
              All
            </a>
          </div>

          <div style={tabsRow}>
            <a href={`/jobs?view=${view}&invoice=all`} style={invoiceFilter === "all" ? activeTabBtn : tabBtn}>
              All invoices
            </a>
            <a
              href={`/jobs?view=${view}&invoice=outstanding`}
              style={invoiceFilter === "outstanding" ? activeTabBtn : tabBtn}
            >
              Outstanding invoices
            </a>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : rows.length === 0 ? (
            <div style={emptyBox}>No jobs found for this view.</div>
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
                    <th align="left" style={thStyle}>Invoice</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((job: any) => {
                    const client = first(job.clients);
                    const operator = first(job.operators);
                    const equipment = first(job.equipment);
                    const totalInvoice = Number(job.total_invoice ?? 0);
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
                            Total: {money(totalInvoice)}
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
