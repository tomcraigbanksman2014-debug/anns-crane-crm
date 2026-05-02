import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";

const CRANE_JOB_STATUSES = [
  "draft",
  "provisional",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "late_cancelled",
];

const TRANSPORT_JOB_STATUSES = [
  "draft",
  "planned",
  "provisional",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "late_cancelled",
];

const INVOICE_STATUSES = ["Not Invoiced", "Invoiced", "Part Paid", "Paid"];

function money(value: unknown) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

function fmtDate(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  if (!text) return "—";
  const d = new Date(`${text}T00:00:00`);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleDateString("en-GB");
}

function invoiceStatus(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "Not Invoiced";
}

function clampMoney(value: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function outstandingAmount(row: any) {
  const total =
    Number(row?.invoice_total ?? 0) ||
    Number(row?.total_invoice ?? 0) ||
    Number(row?.invoice_amount ?? 0) ||
    Number(row?.invoice_subtotal ?? 0) ||
    Number(row?.agreed_sell_rate ?? 0) ||
    Number(row?.price ?? 0) ||
    0;

  const paid = Number(row?.amount_paid ?? 0) || 0;
  return Math.max(total - paid, 0);
}

function invoiceBaseTotal(row: any) {
  return (
    Number(row?.invoice_total ?? 0) ||
    Number(row?.total_invoice ?? 0) ||
    Number(row?.invoice_amount ?? 0) ||
    Number(row?.invoice_subtotal ?? 0) ||
    Number(row?.agreed_sell_rate ?? 0) ||
    Number(row?.price ?? 0) ||
    0
  );
}

function activeOutstanding(row: any) {
  const status = String(row?.status ?? "").trim().toLowerCase();
  const invoice = invoiceStatus(row?.invoice_status).toLowerCase();

  if (status === "cancelled") return false;
  return invoice !== "paid";
}

async function updateOutstandingRecord(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const recordType = String(formData.get("record_type") ?? "").trim().toLowerCase();
  const recordId = String(formData.get("record_id") ?? "").trim();
  const nextStatus = String(formData.get("status") ?? "").trim();
  const nextInvoiceStatus = String(formData.get("invoice_status") ?? "Not Invoiced").trim() || "Not Invoiced";
  const rawAmountPaid = String(formData.get("amount_paid") ?? "").trim();

  if (!recordId || (recordType !== "crane" && recordType !== "transport")) {
    redirect(`/invoices/outstanding?error=${encodeURIComponent("Missing invoice record details.")}`);
  }

  if (!INVOICE_STATUSES.includes(nextInvoiceStatus)) {
    redirect(`/invoices/outstanding?error=${encodeURIComponent("Invalid invoice status.")}`);
  }

  const table = recordType === "crane" ? "jobs" : "transport_jobs";
  const validStatuses = recordType === "crane" ? CRANE_JOB_STATUSES : TRANSPORT_JOB_STATUSES;

  if (!validStatuses.includes(nextStatus)) {
    redirect(`/invoices/outstanding?error=${encodeURIComponent("Invalid job status.")}`);
  }

  const selectColumns =
    recordType === "crane"
      ? "id, job_number, status, invoice_status, total_invoice, invoice_total, invoice_amount, invoice_subtotal, amount_paid"
      : "id, transport_number, status, invoice_status, total_invoice, invoice_total, invoice_subtotal, agreed_sell_rate, price, amount_paid";

  const { data: existing, error: lookupError } = await supabase
    .from(table)
    .select(selectColumns)
    .eq("id", recordId)
    .single();

  if (lookupError || !existing) {
    redirect(`/invoices/outstanding?error=${encodeURIComponent(lookupError?.message || "Record not found.")}`);
  }

  const total = invoiceBaseTotal(existing);
  const currentAmountPaid = Number((existing as any).amount_paid ?? 0) || 0;
  let amountPaid = currentAmountPaid;

  if (nextInvoiceStatus === "Paid") {
    amountPaid = total;
  } else if (nextInvoiceStatus === "Part Paid") {
    const parsed = rawAmountPaid === "" ? currentAmountPaid : Number(rawAmountPaid || 0);
    amountPaid = clampMoney(parsed, 0, total || Number.MAX_SAFE_INTEGER);
  } else {
    amountPaid = 0;
  }

  const { error: updateError } = await supabase
    .from(table)
    .update({
      status: nextStatus,
      invoice_status: nextInvoiceStatus,
      amount_paid: amountPaid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId);

  if (updateError) {
    redirect(`/invoices/outstanding?error=${encodeURIComponent(updateError.message)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await writeAuditLog({
    actor_user_id: user?.id ?? null,
    actor_username: fromAuthEmail(user?.email ?? null) || null,
    action: recordType === "crane" ? "job_invoice_status_updated" : "transport_invoice_status_updated",
    entity_type: recordType === "crane" ? "job" : "transport_job",
    entity_id: recordId,
    meta: {
      source: "outstanding_invoices_page",
      previous_status: (existing as any).status ?? null,
      new_status: nextStatus,
      previous_invoice_status: (existing as any).invoice_status ?? null,
      new_invoice_status: nextInvoiceStatus,
      previous_amount_paid: currentAmountPaid,
      new_amount_paid: amountPaid,
      total_invoice: total,
    },
  });

  revalidatePath("/invoices/outstanding");
  revalidatePath("/dashboard");
  revalidatePath(recordType === "crane" ? "/jobs" : "/transport-jobs");

  redirect(`/invoices/outstanding?success=${encodeURIComponent("Invoice/job status updated.")}`);
}

type Props = {
  searchParams?: {
    error?: string;
    success?: string;
  };
};

export default async function OutstandingInvoicesPage({ searchParams }: Props) {
  const supabase = createSupabaseServerClient();
  const errorMessage = String(searchParams?.error ?? "");
  const successMessage = String(searchParams?.success ?? "");

  const [craneRes, transportRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, site_name, start_date, end_date, status, invoice_status, invoice_total, total_invoice, invoice_amount, invoice_subtotal, amount_paid, clients:client_id(company_name)")
      .or("archived.is.null,archived.eq.false")
      .order("start_date", { ascending: false })
      .limit(250),
    supabase
      .from("transport_jobs")
      .select("id, transport_number, collection_address, delivery_address, transport_date, delivery_date, status, invoice_status, invoice_total, total_invoice, invoice_subtotal, agreed_sell_rate, price, amount_paid, clients:client_id(company_name)")
      .or("archived.is.null,archived.eq.false")
      .order("transport_date", { ascending: false })
      .limit(250),
  ]);

  const craneRows = (craneRes.data ?? [])
    .filter(activeOutstanding)
    .map((row: any) => {
      const client = first(row.clients);
      return {
        type: "Crane",
        recordType: "crane",
        id: row.id,
        ref: row.job_number ? `#${row.job_number}` : row.id,
        customer: client?.company_name ?? "—",
        detail: row.site_name ?? "—",
        date: row.start_date ?? row.end_date,
        status: row.status ?? "draft",
        invoice_status: invoiceStatus(row.invoice_status),
        amountPaid: Number(row.amount_paid ?? 0) || 0,
        amount: outstandingAmount(row),
        href: `/jobs/${row.id}`,
        statusOptions: CRANE_JOB_STATUSES,
      };
    });

  const transportRows = (transportRes.data ?? [])
    .filter(activeOutstanding)
    .map((row: any) => {
      const client = first(row.clients);
      return {
        type: "Transport",
        recordType: "transport",
        id: row.id,
        ref: row.transport_number || row.id,
        customer: client?.company_name ?? "—",
        detail: [row.collection_address, row.delivery_address].filter(Boolean).join(" → ") || "—",
        date: row.transport_date ?? row.delivery_date,
        status: row.status ?? "planned",
        invoice_status: invoiceStatus(row.invoice_status),
        amountPaid: Number(row.amount_paid ?? 0) || 0,
        amount: outstandingAmount(row),
        href: `/transport-jobs/${row.id}`,
        statusOptions: TRANSPORT_JOB_STATUSES,
      };
    });

  const rows = [...craneRows, ...transportRows].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  const totalOutstanding = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return (
    <ClientShell>
      <main style={pageWrap}>
        <div style={headerRow}>
          <div>
            <h1 style={title}>Outstanding invoices</h1>
            <p style={subtitle}>
              Combined crane and transport invoice list. Update invoice status or job status here without opening every job.
            </p>
          </div>
          <Link href="/dashboard" style={secondaryBtn}>Back to dashboard</Link>
        </div>

        <section style={summaryGrid}>
          <div style={summaryCard}>
            <div style={summaryLabel}>Outstanding records</div>
            <div style={summaryValue}>{rows.length}</div>
          </div>
          <div style={summaryCard}>
            <div style={summaryLabel}>Estimated outstanding value</div>
            <div style={summaryValue}>{money(totalOutstanding)}</div>
          </div>
          <div style={summaryCard}>
            <div style={summaryLabel}>Transport included</div>
            <div style={summaryValue}>{transportRows.length}</div>
          </div>
        </section>

        {successMessage ? <div style={successBox}>{successMessage}</div> : null}
        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
        {craneRes.error ? <div style={errorBox}>Crane invoice lookup: {craneRes.error.message}</div> : null}
        {transportRes.error ? <div style={errorBox}>Transport invoice lookup: {transportRes.error.message}</div> : null}

        <section style={card}>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Type</th>
                  <th style={th}>Reference</th>
                  <th style={th}>Customer</th>
                  <th style={th}>Job / movement</th>
                  <th style={th}>Date</th>
                  <th style={th}>Current status</th>
                  <th style={th}>Current invoice</th>
                  <th style={th}>Amount</th>
                  <th style={th}>Update</th>
                  <th style={th}>Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={emptyCell}>No outstanding crane or transport invoices found.</td>
                  </tr>
                ) : rows.map((row) => (
                  <tr key={`${row.type}-${row.id}`}>
                    <td style={td}>{row.type}</td>
                    <td style={td}>{row.ref}</td>
                    <td style={td}>{row.customer}</td>
                    <td style={td}>{row.detail}</td>
                    <td style={td}>{fmtDate(row.date)}</td>
                    <td style={td}><span style={statusPill}>{row.status || "—"}</span></td>
                    <td style={td}><span style={pill}>{row.invoice_status}</span></td>
                    <td style={td}>{money(row.amount)}</td>
                    <td style={td}>
                      <form action={updateOutstandingRecord} style={updateForm}>
                        <input type="hidden" name="record_type" value={row.recordType} />
                        <input type="hidden" name="record_id" value={row.id} />
                        <label style={miniLabel}>
                          Job status
                          <select name="status" defaultValue={row.status} style={selectStyle}>
                            {row.statusOptions.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </label>
                        <label style={miniLabel}>
                          Invoice status
                          <select name="invoice_status" defaultValue={row.invoice_status} style={selectStyle}>
                            {INVOICE_STATUSES.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </label>
                        <label style={miniLabel}>
                          Amount paid
                          <input name="amount_paid" type="number" step="0.01" min="0" defaultValue={row.amountPaid ? String(row.amountPaid) : ""} style={inputStyle} />
                        </label>
                        <button type="submit" style={saveBtn}>Save</button>
                      </form>
                    </td>
                    <td style={td}><Link href={row.href} style={linkStyle}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </ClientShell>
  );
}

const pageWrap: CSSProperties = {
  display: "grid",
  gap: 18,
  padding: 20,
};

const headerRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  flexWrap: "wrap",
};

const title: CSSProperties = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.15,
};

const subtitle: CSSProperties = {
  margin: "8px 0 0",
  color: "#5f6368",
  maxWidth: 760,
};

const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const summaryCard: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  background: "#fff",
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
};

const summaryLabel: CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#6b7280",
  fontWeight: 800,
};

const summaryValue: CSSProperties = {
  marginTop: 6,
  fontSize: 24,
  fontWeight: 900,
};

const card: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  background: "#fff",
  overflow: "hidden",
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
};

const tableWrap: CSSProperties = {
  overflowX: "auto",
};

const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1320,
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 12,
  color: "#6b7280",
  borderBottom: "1px solid #e5e7eb",
  background: "#f9fafb",
};

const td: CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
  fontSize: 14,
};

const emptyCell: CSSProperties = {
  padding: 18,
  textAlign: "center",
  color: "#6b7280",
};

const pill: CSSProperties = {
  display: "inline-flex",
  borderRadius: 999,
  padding: "4px 9px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  fontWeight: 800,
  fontSize: 12,
};

const statusPill: CSSProperties = {
  display: "inline-flex",
  borderRadius: 999,
  padding: "4px 9px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: "#0f172a",
  fontWeight: 800,
  fontSize: 12,
};

const linkStyle: CSSProperties = {
  fontWeight: 900,
  color: "#0f172a",
  textDecoration: "underline",
};

const secondaryBtn: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: "10px 14px",
  textDecoration: "none",
  color: "#111827",
  fontWeight: 800,
  background: "#fff",
};

const updateForm: CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 220,
};

const miniLabel: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 11,
  color: "#475569",
  fontWeight: 800,
};

const selectStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "8px 9px",
  background: "#fff",
  color: "#111827",
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "8px 9px",
  background: "#fff",
  color: "#111827",
  fontWeight: 700,
};

const saveBtn: CSSProperties = {
  border: "1px solid #0f766e",
  borderRadius: 10,
  padding: "9px 11px",
  background: "#ccfbf1",
  color: "#0f172a",
  fontWeight: 900,
  cursor: "pointer",
};

const errorBox: CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 14,
  padding: 14,
  fontWeight: 700,
};

const successBox: CSSProperties = {
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  borderRadius: 14,
  padding: 14,
  fontWeight: 700,
};
