import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";

const INVOICE_STATUSES = ["Not Invoiced", "Invoiced", "Part Paid", "Paid"];
const CRANE_JOB_STATUSES = ["draft", "provisional", "confirmed", "in_progress", "completed", "cancelled", "late_cancelled"];
const TRANSPORT_JOB_STATUSES = ["draft", "planned", "provisional", "confirmed", "in_progress", "completed", "cancelled", "late_cancelled"];

function lower(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: unknown) {
  return num(value).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

function fmtDate(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  if (!text) return "—";
  const d = new Date(`${text}T00:00:00`);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleDateString("en-GB");
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fromAuthEmail(email: string | null | undefined) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function invoiceStatus(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "Not Invoiced";
}


function actionsUrl(focus: string, key?: "error" | "success", message?: string) {
  const params: string[] = [];
  if (focus) params.push(`focus=${encodeURIComponent(focus)}`);
  if (key && message) params.push(`${key}=${encodeURIComponent(message)}`);
  return `/dashboard/actions${params.length ? `?${params.join("&")}` : ""}`;
}

function invoiceTotal(row: any) {
  return (
    num(row?.invoice_total) ||
    num(row?.total_invoice) ||
    num(row?.invoice_amount) ||
    num(row?.invoice_subtotal) ||
    num(row?.agreed_sell_rate) ||
    num(row?.price) ||
    0
  );
}

function clampMoney(value: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

async function updateInvoiceAction(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const recordType = String(formData.get("record_type") ?? "").trim().toLowerCase();
  const recordId = String(formData.get("record_id") ?? "").trim();
  const focus = String(formData.get("focus") ?? "").trim();
  const nextInvoiceStatus = String(formData.get("invoice_status") ?? "Not Invoiced").trim() || "Not Invoiced";
  const rawAmountPaid = String(formData.get("amount_paid") ?? "").trim();

  if (!recordId || (recordType !== "crane" && recordType !== "transport")) {
    redirect(actionsUrl(focus, "error", "Missing record details."));
  }

  if (!INVOICE_STATUSES.includes(nextInvoiceStatus)) {
    redirect(actionsUrl(focus, "error", "Invalid invoice status."));
  }

  const table = recordType === "crane" ? "jobs" : "transport_jobs";
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
    redirect(actionsUrl(focus, "error", lookupError?.message || "Record not found."));
  }

  const total = invoiceTotal(existing);
  const currentAmountPaid = num((existing as any).amount_paid);
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
    .update({ invoice_status: nextInvoiceStatus, amount_paid: amountPaid, updated_at: new Date().toISOString() })
    .eq("id", recordId);

  if (updateError) {
    redirect(actionsUrl(focus, "error", updateError.message));
  }

  const { data: authData } = await supabase.auth.getUser();
  await writeAuditLog({
    actor_user_id: authData.user?.id ?? null,
    actor_username: fromAuthEmail(authData.user?.email) || null,
    action: recordType === "crane" ? "job_invoice_status_updated" : "transport_invoice_status_updated",
    entity_type: recordType === "crane" ? "job" : "transport_job",
    entity_id: recordId,
    meta: {
      source: "dashboard_actions_page",
      previous_invoice_status: (existing as any).invoice_status ?? null,
      new_invoice_status: nextInvoiceStatus,
      previous_amount_paid: currentAmountPaid,
      new_amount_paid: amountPaid,
      total_invoice: total,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/actions");
  revalidatePath("/invoices/outstanding");
  redirect(actionsUrl(focus, "success", "Invoice status updated."));
}

async function assignTransportAction(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const recordId = String(formData.get("record_id") ?? "").trim();
  const focus = String(formData.get("focus") ?? "unassigned-transport").trim();
  const vehicleId = clean(formData.get("vehicle_id"));
  const operatorId = clean(formData.get("operator_id"));

  if (!recordId) {
    redirect(actionsUrl(focus, "error", "Missing transport job."));
  }

  if (!vehicleId && !operatorId) {
    redirect(actionsUrl(focus, "error", "Choose a vehicle or driver."));
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (vehicleId) updates.vehicle_id = vehicleId;
  if (operatorId) updates.operator_id = operatorId;

  const { error: updateError } = await supabase
    .from("transport_jobs")
    .update(updates)
    .eq("id", recordId);

  if (updateError) {
    redirect(actionsUrl(focus, "error", updateError.message));
  }

  const { data: authData } = await supabase.auth.getUser();
  await writeAuditLog({
    actor_user_id: authData.user?.id ?? null,
    actor_username: fromAuthEmail(authData.user?.email) || null,
    action: "transport_job_assigned_from_dashboard",
    entity_type: "transport_job",
    entity_id: recordId,
    meta: { source: "dashboard_actions_page", vehicle_id: vehicleId, operator_id: operatorId },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/actions");
  revalidatePath("/transport-jobs");
  redirect(actionsUrl(focus, "success", "Transport allocation saved."));
}

async function assignCraneAction(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const recordId = String(formData.get("record_id") ?? "").trim();
  const focus = String(formData.get("focus") ?? "unassigned-crane").trim();
  const craneId = clean(formData.get("crane_id"));
  const operatorId = clean(formData.get("operator_id"));

  if (!recordId) {
    redirect(actionsUrl(focus, "error", "Missing crane job."));
  }

  if (!craneId && !operatorId) {
    redirect(actionsUrl(focus, "error", "Choose a crane or operator."));
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (craneId) updates.equipment_id = craneId;
  if (operatorId) {
    updates.operator_id = operatorId;
    updates.main_operator_id = operatorId;
  }

  const { error: updateError } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", recordId);

  if (updateError) {
    redirect(actionsUrl(focus, "error", updateError.message));
  }

  const { data: authData } = await supabase.auth.getUser();
  await writeAuditLog({
    actor_user_id: authData.user?.id ?? null,
    actor_username: fromAuthEmail(authData.user?.email) || null,
    action: "crane_job_assigned_from_dashboard",
    entity_type: "job",
    entity_id: recordId,
    meta: { source: "dashboard_actions_page", equipment_id: craneId, operator_id: operatorId },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/actions");
  revalidatePath("/jobs");
  redirect(actionsUrl(focus, "success", "Crane job allocation saved."));
}

type SelectOption = {
  id: string;
  label: string;
};

type ActionItem = {
  id: string;
  type: "Crane" | "Transport";
  recordType: "crane" | "transport";
  reference: string;
  customer: string;
  detail: string;
  date: string | null;
  status: string;
  invoiceStatus: string;
  amount?: number;
  amountPaid?: number;
  href: string;
  missingCrane?: boolean;
  missingVehicle?: boolean;
  missingDriver?: boolean;
  missingOperator?: boolean;
};

type Props = {
  searchParams?: {
    focus?: string;
    error?: string;
    success?: string;
  };
};

export default async function DashboardActionsPage({ searchParams }: Props) {
  const supabase = createSupabaseServerClient();
  const focus = String(searchParams?.focus ?? "").trim();
  const errorMessage = String(searchParams?.error ?? "").trim();
  const successMessage = String(searchParams?.success ?? "").trim();

  const [jobsRes, transportRes, allocationsRes, operatorsRes, vehiclesRes, cranesRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, site_name, site_address, start_date, end_date, job_date, status, invoice_status, invoice_total, total_invoice, invoice_amount, invoice_subtotal, amount_paid, equipment_id, operator_id, main_operator_id, archived, clients:client_id(company_name)")
      .or("archived.is.null,archived.eq.false")
      .limit(750),
    supabase
      .from("transport_jobs")
      .select("id, transport_number, collection_address, delivery_address, transport_date, delivery_date, status, invoice_status, invoice_total, total_invoice, invoice_subtotal, agreed_sell_rate, price, amount_paid, vehicle_id, operator_id, archived, clients:client_id(company_name)")
      .or("archived.is.null,archived.eq.false")
      .limit(750),
    supabase
      .from("job_allocations")
      .select("id, job_id, crane_id, equipment_id, operator_id"),
    supabase
      .from("operators")
      .select("id, full_name, status, archived")
      .or("archived.is.null,archived.eq.false")
      .order("full_name", { ascending: true }),
    supabase
      .from("vehicles")
      .select("id, name, reg_number, vehicle_type, status, archived")
      .or("archived.is.null,archived.eq.false")
      .order("name", { ascending: true }),
    supabase
      .from("cranes")
      .select("id, name, reg_number, fleet_number, status, archived")
      .or("archived.is.null,archived.eq.false")
      .order("name", { ascending: true }),
  ]);

  const jobs = jobsRes.data ?? [];
  const transportJobs = transportRes.data ?? [];
  const allocations = allocationsRes.data ?? [];

  const operators: SelectOption[] = (operatorsRes.data ?? [])
    .filter((row: any) => lower(row.status) !== "inactive")
    .map((row: any) => ({ id: row.id, label: row.full_name ?? row.id }));

  const vehicles: SelectOption[] = (vehiclesRes.data ?? [])
    .filter((row: any) => lower(row.status) !== "inactive")
    .map((row: any) => ({
      id: row.id,
      label: [row.name, row.reg_number, row.vehicle_type].filter(Boolean).join(" • ") || row.id,
    }));

  const cranes: SelectOption[] = (cranesRes.data ?? [])
    .filter((row: any) => lower(row.status) !== "inactive")
    .map((row: any) => ({
      id: row.id,
      label: [row.name, row.reg_number ?? row.fleet_number].filter(Boolean).join(" • ") || row.id,
    }));

  const allocationMap = new Map<string, { hasCrane: boolean; hasOperator: boolean }>();
  (allocations ?? []).forEach((row: any) => {
    const jobId = String(row?.job_id ?? "").trim();
    if (!jobId) return;
    const current = allocationMap.get(jobId) ?? { hasCrane: false, hasOperator: false };
    if (row?.crane_id || row?.equipment_id) current.hasCrane = true;
    if (row?.operator_id) current.hasOperator = true;
    allocationMap.set(jobId, current);
  });

  const unassignedCrane: ActionItem[] = jobs
    .filter((row: any) => lower(row.status) !== "cancelled")
    .filter((row: any) => {
      const allocationsForJob = allocationMap.get(String(row.id));
      const hasCrane = !!row.equipment_id || !!allocationsForJob?.hasCrane;
      const hasOperator = !!row.operator_id || !!row.main_operator_id || !!allocationsForJob?.hasOperator;
      return !hasCrane || !hasOperator;
    })
    .map((row: any) => {
      const client = first(row.clients);
      const allocationsForJob = allocationMap.get(String(row.id));
      const hasCrane = !!row.equipment_id || !!allocationsForJob?.hasCrane;
      const hasOperator = !!row.operator_id || !!row.main_operator_id || !!allocationsForJob?.hasOperator;
      return {
        id: row.id,
        type: "Crane" as const,
        recordType: "crane" as const,
        reference: row.job_number ? `#${row.job_number}` : row.id,
        customer: client?.company_name ?? "—",
        detail: row.site_name ?? row.site_address ?? "—",
        date: row.start_date ?? row.job_date ?? row.end_date ?? null,
        status: row.status ?? "—",
        invoiceStatus: invoiceStatus(row.invoice_status),
        amount: invoiceTotal(row) - num(row.amount_paid),
        amountPaid: num(row.amount_paid),
        href: `/jobs/${row.id}`,
        missingCrane: !hasCrane,
        missingOperator: !hasOperator,
      };
    })
    .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));

  const unassignedTransport: ActionItem[] = transportJobs
    .filter((row: any) => lower(row.status) !== "cancelled")
    .filter((row: any) => !row.vehicle_id || !row.operator_id)
    .map((row: any) => {
      const client = first(row.clients);
      return {
        id: row.id,
        type: "Transport" as const,
        recordType: "transport" as const,
        reference: row.transport_number ?? row.id,
        customer: client?.company_name ?? "—",
        detail: [row.collection_address, row.delivery_address].filter(Boolean).join(" → ") || "—",
        date: row.transport_date ?? row.delivery_date ?? null,
        status: row.status ?? "—",
        invoiceStatus: invoiceStatus(row.invoice_status),
        amount: invoiceTotal(row) - num(row.amount_paid),
        amountPaid: num(row.amount_paid),
        href: `/transport-jobs/${row.id}`,
        missingVehicle: !row.vehicle_id,
        missingDriver: !row.operator_id,
      };
    })
    .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));

  const completedCraneNotInvoiced: ActionItem[] = jobs
    .filter((row: any) => lower(row.status) === "completed")
    .filter((row: any) => lower(row.invoice_status || "Not Invoiced") === "not invoiced")
    .map((row: any) => {
      const client = first(row.clients);
      return {
        id: row.id,
        type: "Crane" as const,
        recordType: "crane" as const,
        reference: row.job_number ? `#${row.job_number}` : row.id,
        customer: client?.company_name ?? "—",
        detail: row.site_name ?? row.site_address ?? "—",
        date: row.start_date ?? row.job_date ?? row.end_date ?? null,
        status: row.status ?? "—",
        invoiceStatus: invoiceStatus(row.invoice_status),
        amount: invoiceTotal(row) - num(row.amount_paid),
        amountPaid: num(row.amount_paid),
        href: `/jobs/${row.id}`,
      };
    })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  const completedTransportNotInvoiced: ActionItem[] = transportJobs
    .filter((row: any) => lower(row.status) === "completed")
    .filter((row: any) => lower(row.invoice_status || "Not Invoiced") === "not invoiced")
    .map((row: any) => {
      const client = first(row.clients);
      return {
        id: row.id,
        type: "Transport" as const,
        recordType: "transport" as const,
        reference: row.transport_number ?? row.id,
        customer: client?.company_name ?? "—",
        detail: [row.collection_address, row.delivery_address].filter(Boolean).join(" → ") || "—",
        date: row.transport_date ?? row.delivery_date ?? null,
        status: row.status ?? "—",
        invoiceStatus: invoiceStatus(row.invoice_status),
        amount: invoiceTotal(row) - num(row.amount_paid),
        amountPaid: num(row.amount_paid),
        href: `/transport-jobs/${row.id}`,
      };
    })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  const sections = [
    {
      id: "unassigned-crane",
      title: "Unassigned crane jobs",
      subtitle: "Crane jobs missing a crane or operator allocation.",
      actionHint: "Assign the missing crane and/or operator, or open the job if the allocation needs more detail.",
      rows: unassignedCrane,
      mode: "assign-crane" as const,
    },
    {
      id: "unassigned-transport",
      title: "Unassigned transport jobs",
      subtitle: "Transport jobs missing a vehicle or driver allocation.",
      actionHint: "Assign the missing truck and/or driver, or open the transport job if the allocation needs more detail.",
      rows: unassignedTransport,
      mode: "assign-transport" as const,
    },
    {
      id: "completed-crane-not-invoiced",
      title: "Completed crane jobs not invoiced",
      subtitle: "Completed crane jobs still marked Not Invoiced.",
      actionHint: "Set the invoice status once the invoice has been raised, part paid or paid.",
      rows: completedCraneNotInvoiced,
      mode: "invoice" as const,
    },
    {
      id: "completed-transport-not-invoiced",
      title: "Completed transport jobs not invoiced",
      subtitle: "Completed transport jobs still marked Not Invoiced.",
      actionHint: "Set the invoice status once the invoice has been raised, part paid or paid.",
      rows: completedTransportNotInvoiced,
      mode: "invoice" as const,
    },
  ];

  const visibleSections = focus ? sections.filter((section) => section.id === focus) : sections;
  const urgentCount = unassignedCrane.length + unassignedTransport.length + completedCraneNotInvoiced.length + completedTransportNotInvoiced.length;
  const focusedSection = focus ? sections.find((section) => section.id === focus) : null;

  return (
    <ClientShell>
      <main style={pageWrap}>
        <div style={headerRow}>
          <div>
            <h1 style={title}>{focusedSection ? focusedSection.title : "Urgent actions"}</h1>
            <p style={subtitle}>{focusedSection ? focusedSection.actionHint : "Exact records behind the dashboard action queue, with quick actions where safe."}</p>
          </div>
          <Link href="/dashboard" style={secondaryBtn}>Back to dashboard</Link>
        </div>

        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
        {successMessage ? <div style={successBox}>{successMessage}</div> : null}
        {jobsRes.error ? <div style={errorBox}>Crane job lookup: {jobsRes.error.message}</div> : null}
        {transportRes.error ? <div style={errorBox}>Transport job lookup: {transportRes.error.message}</div> : null}
        {allocationsRes.error ? <div style={errorBox}>Allocation lookup: {allocationsRes.error.message}</div> : null}

        {focusedSection ? (
          <section style={summaryGridFocused}>
            <SummaryCard label={focusedSection.title} value={focusedSection.rows.length} />
          </section>
        ) : (
          <section style={summaryGrid}>
            <SummaryCard label="Total urgent actions" value={urgentCount} />
            <SummaryCard label="Unassigned crane" value={unassignedCrane.length} />
            <SummaryCard label="Unassigned transport" value={unassignedTransport.length} />
            <SummaryCard label="Completed crane not invoiced" value={completedCraneNotInvoiced.length} />
            <SummaryCard label="Completed transport not invoiced" value={completedTransportNotInvoiced.length} />
          </section>
        )}

        {visibleSections.map((section) => (
          <ActionSection
            key={section.id}
            id={section.id}
            title={section.title}
            subtitle={section.subtitle}
            actionHint={section.actionHint}
            rows={section.rows}
            highlighted={focus === section.id}
            mode={section.mode}
            focus={section.id}
            operators={operators}
            vehicles={vehicles}
            cranes={cranes}
          />
        ))}
      </main>
    </ClientShell>
  );
}

function ActionSection({
  id,
  title,
  subtitle,
  actionHint,
  rows,
  highlighted,
  mode,
  focus,
  operators,
  vehicles,
  cranes,
}: {
  id: string;
  title: string;
  subtitle: string;
  actionHint: string;
  rows: ActionItem[];
  highlighted: boolean;
  mode: "assign-crane" | "assign-transport" | "invoice";
  focus: string;
  operators: SelectOption[];
  vehicles: SelectOption[];
  cranes: SelectOption[];
}) {
  return (
    <section id={id} style={highlighted ? highlightedCard : card}>
      <div style={sectionHeader}>
        <div>
          <h2 style={sectionTitle}>{title}</h2>
          <p style={sectionSubtitle}>{subtitle}</p>
          <p style={actionHintStyle}>{actionHint}</p>
        </div>
        <div style={countBubble}>{rows.length}</div>
      </div>
      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Action needed</th>
              <th style={th}>Reference</th>
              <th style={th}>Customer</th>
              <th style={th}>Job / movement</th>
              <th style={th}>Date</th>
              <th style={th}>Status</th>
              <th style={th}>Quick action</th>
              <th style={th}>Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={emptyCell}>No records found.</td></tr>
            ) : rows.map((row) => (
              <tr key={`${row.type}-${row.id}`}>
                <td style={td}>
                  <strong>{actionNeededText(row, mode)}</strong>
                  {row.amount && mode === "invoice" ? <div style={mutedSmall}>Outstanding: {money(row.amount)}</div> : null}
                </td>
                <td style={td}>{row.reference}</td>
                <td style={td}>{row.customer}</td>
                <td style={td}>{row.detail}</td>
                <td style={td}>{fmtDate(row.date)}</td>
                <td style={td}>
                  <div style={{ display: "grid", gap: 5 }}>
                    <span style={pill}>{row.status}</span>
                    <span style={invoicePill}>{row.invoiceStatus}</span>
                  </div>
                </td>
                <td style={td}>
                  {mode === "assign-transport" ? (
                    <TransportAssignForm row={row} focus={focus} operators={operators} vehicles={vehicles} />
                  ) : mode === "assign-crane" ? (
                    <CraneAssignForm row={row} focus={focus} operators={operators} cranes={cranes} />
                  ) : (
                    <InvoiceActionForm row={row} focus={focus} />
                  )}
                </td>
                <td style={td}><Link href={row.href} style={linkStyle}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function actionNeededText(row: ActionItem, mode: "assign-crane" | "assign-transport" | "invoice") {
  if (mode === "invoice") return "Raise/update invoice status";

  if (mode === "assign-transport") {
    if (row.missingVehicle && row.missingDriver) return "Assign vehicle and driver";
    if (row.missingVehicle) return "Assign vehicle";
    return "Assign driver";
  }

  if (row.missingCrane && row.missingOperator) return "Assign crane and operator";
  if (row.missingCrane) return "Assign crane";
  return "Assign operator";
}

function TransportAssignForm({ row, focus, operators, vehicles }: { row: ActionItem; focus: string; operators: SelectOption[]; vehicles: SelectOption[] }) {
  return (
    <form action={assignTransportAction} style={formGrid}>
      <input type="hidden" name="record_id" value={row.id} />
      <input type="hidden" name="focus" value={focus} />
      {row.missingVehicle ? <SelectField name="vehicle_id" label="Vehicle" options={vehicles} placeholder="Choose vehicle" /> : null}
      {row.missingDriver ? <SelectField name="operator_id" label="Driver" options={operators} placeholder="Choose driver" /> : null}
      <button type="submit" style={miniPrimaryBtn}>Save allocation</button>
    </form>
  );
}

function CraneAssignForm({ row, focus, operators, cranes }: { row: ActionItem; focus: string; operators: SelectOption[]; cranes: SelectOption[] }) {
  return (
    <form action={assignCraneAction} style={formGrid}>
      <input type="hidden" name="record_id" value={row.id} />
      <input type="hidden" name="focus" value={focus} />
      {row.missingCrane ? <SelectField name="crane_id" label="Crane" options={cranes} placeholder="Choose crane" /> : null}
      {row.missingOperator ? <SelectField name="operator_id" label="Operator" options={operators} placeholder="Choose operator" /> : null}
      <button type="submit" style={miniPrimaryBtn}>Save allocation</button>
    </form>
  );
}

function InvoiceActionForm({ row, focus }: { row: ActionItem; focus: string }) {
  return (
    <form action={updateInvoiceAction} style={formGrid}>
      <input type="hidden" name="record_id" value={row.id} />
      <input type="hidden" name="record_type" value={row.recordType} />
      <input type="hidden" name="focus" value={focus} />
      <label style={fieldLabel}>
        Invoice status
        <select name="invoice_status" defaultValue={row.invoiceStatus} style={selectStyle}>
          {INVOICE_STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </label>
      <label style={fieldLabel}>
        Amount paid
        <input name="amount_paid" type="number" min="0" step="0.01" defaultValue={row.amountPaid ?? 0} style={inputStyle} />
      </label>
      <button type="submit" style={miniPrimaryBtn}>Save invoice</button>
    </form>
  );
}

function SelectField({ name, label, options, placeholder }: { name: string; label: string; options: SelectOption[]; placeholder: string }) {
  return (
    <label style={fieldLabel}>
      {label}
      <select name={name} defaultValue="" style={selectStyle}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={summaryCard}>
      <div style={summaryLabel}>{label}</div>
      <div style={summaryValue}>{value}</div>
    </div>
  );
}

const pageWrap: CSSProperties = { display: "grid", gap: 18, padding: 20 };
const headerRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" };
const title: CSSProperties = { margin: 0, fontSize: 28, lineHeight: 1.15 };
const subtitle: CSSProperties = { margin: "8px 0 0", color: "#5f6368", maxWidth: 820 };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };
const summaryGridFocused: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px, 340px)", gap: 12 };
const summaryCard: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fff", boxShadow: "0 8px 24px rgba(15,23,42,0.06)" };
const summaryLabel: CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", fontWeight: 800 };
const summaryValue: CSSProperties = { marginTop: 6, fontSize: 24, fontWeight: 900 };
const card: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 18, background: "#fff", overflow: "hidden", boxShadow: "0 8px 24px rgba(15,23,42,0.06)" };
const highlightedCard: CSSProperties = { ...card, border: "2px solid #f59e0b" };
const sectionHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: 16, borderBottom: "1px solid #e5e7eb", background: "#f9fafb" };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 20 };
const sectionSubtitle: CSSProperties = { margin: "6px 0 0", color: "#6b7280" };
const actionHintStyle: CSSProperties = { margin: "8px 0 0", color: "#111827", fontWeight: 800, fontSize: 13 };
const countBubble: CSSProperties = { borderRadius: 999, padding: "8px 12px", background: "#111827", color: "#fff", fontWeight: 900 };
const tableWrap: CSSProperties = { overflowX: "auto" };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 1180 };
const th: CSSProperties = { textAlign: "left", padding: "12px 14px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", verticalAlign: "top" };
const td: CSSProperties = { padding: "12px 14px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top", fontSize: 14 };
const emptyCell: CSSProperties = { padding: 18, textAlign: "center", color: "#6b7280" };
const pill: CSSProperties = { display: "inline-flex", borderRadius: 999, padding: "4px 9px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#0f172a", fontWeight: 800, fontSize: 12 };
const invoicePill: CSSProperties = { display: "inline-flex", borderRadius: 999, padding: "4px 9px", background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontWeight: 800, fontSize: 12 };
const linkStyle: CSSProperties = { fontWeight: 900, color: "#0f172a", textDecoration: "underline" };
const secondaryBtn: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 12, padding: "10px 14px", textDecoration: "none", color: "#111827", fontWeight: 800, background: "#fff" };
const errorBox: CSSProperties = { border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 14, padding: 14, fontWeight: 700 };
const successBox: CSSProperties = { border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", borderRadius: 14, padding: 14, fontWeight: 700 };
const formGrid: CSSProperties = { display: "grid", gap: 8, minWidth: 220 };
const fieldLabel: CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 900, color: "#374151" };
const selectStyle: CSSProperties = { minHeight: 36, borderRadius: 10, border: "1px solid #d1d5db", padding: "7px 9px", background: "#fff", color: "#111827", fontWeight: 700 };
const inputStyle: CSSProperties = { minHeight: 34, borderRadius: 10, border: "1px solid #d1d5db", padding: "7px 9px", background: "#fff", color: "#111827", fontWeight: 700 };
const miniPrimaryBtn: CSSProperties = { border: 0, borderRadius: 10, padding: "9px 11px", background: "#0f172a", color: "#fff", fontWeight: 900, cursor: "pointer" };
const mutedSmall: CSSProperties = { marginTop: 5, color: "#64748b", fontSize: 12, fontWeight: 700 };
