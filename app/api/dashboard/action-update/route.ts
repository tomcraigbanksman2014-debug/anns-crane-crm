import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiUser } from "../../../lib/apiAuth";
import { writeAuditLog } from "../../../lib/audit";

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

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function fromAuthEmail(email: string | null | undefined) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function invoiceBaseTotal(row: any) {
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

async function revalidateDashboardPages(recordType?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/actions");
  revalidatePath("/invoices/outstanding");

  if (recordType === "crane") {
    revalidatePath("/jobs");
  }

  if (recordType === "transport") {
    revalidatePath("/transport-jobs");
  }
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireApiUser();
  if (response) return response;

  let body: any = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = clean(body?.action);

  if (action === "update_invoice") {
    const recordType = clean(body?.record_type);
    const recordId = clean(body?.record_id);
    const nextInvoiceStatus = clean(body?.invoice_status) || "Not Invoiced";
    const nextStatus = clean(body?.status);
    const rawAmountPaid = clean(body?.amount_paid);

    if (!recordId || (recordType !== "crane" && recordType !== "transport")) {
      return NextResponse.json({ error: "Missing invoice record details." }, { status: 400 });
    }

    if (!INVOICE_STATUSES.includes(nextInvoiceStatus)) {
      return NextResponse.json({ error: "Invalid invoice status." }, { status: 400 });
    }

    const table = recordType === "crane" ? "jobs" : "transport_jobs";
    const validStatuses = recordType === "crane" ? CRANE_JOB_STATUSES : TRANSPORT_JOB_STATUSES;

    if (nextStatus && !validStatuses.includes(nextStatus)) {
      return NextResponse.json({ error: "Invalid job status." }, { status: 400 });
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
      return NextResponse.json({ error: lookupError?.message || "Record not found." }, { status: 404 });
    }

    const total = invoiceBaseTotal(existing);
    const currentAmountPaid = num((existing as any).amount_paid);
    let amountPaid = currentAmountPaid;

    if (nextInvoiceStatus === "Paid") {
      amountPaid = total;
    } else if (nextInvoiceStatus === "Part Paid") {
      const parsed = rawAmountPaid === null ? currentAmountPaid : Number(rawAmountPaid || 0);
      amountPaid = clampMoney(parsed, 0, total || Number.MAX_SAFE_INTEGER);
    } else {
      amountPaid = 0;
    }

    const updates: Record<string, any> = {
      invoice_status: nextInvoiceStatus,
      amount_paid: amountPaid,
      updated_at: new Date().toISOString(),
    };

    if (nextStatus) {
      updates.status = nextStatus;
    }

    const { error: updateError } = await supabase
      .from(table)
      .update(updates)
      .eq("id", recordId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email) || null,
      action: recordType === "crane" ? "job_invoice_status_updated" : "transport_invoice_status_updated",
      entity_type: recordType === "crane" ? "job" : "transport_job",
      entity_id: recordId,
      meta: {
        source: "dashboard_quick_action",
        previous_status: (existing as any).status ?? null,
        new_status: nextStatus ?? (existing as any).status ?? null,
        previous_invoice_status: (existing as any).invoice_status ?? null,
        new_invoice_status: nextInvoiceStatus,
        previous_amount_paid: currentAmountPaid,
        new_amount_paid: amountPaid,
        total_invoice: total,
      },
    });

    await revalidateDashboardPages(recordType);

    return NextResponse.json({ ok: true });
  }

  if (action === "assign_transport") {
    const recordId = clean(body?.record_id);
    const vehicleId = clean(body?.vehicle_id);
    const operatorId = clean(body?.operator_id);

    if (!recordId) {
      return NextResponse.json({ error: "Missing transport job." }, { status: 400 });
    }

    if (!vehicleId && !operatorId) {
      return NextResponse.json({ error: "Choose a vehicle or driver to assign." }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "vehicle_id")) updates.vehicle_id = vehicleId;
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "operator_id")) updates.operator_id = operatorId;

    const { error: updateError } = await supabase
      .from("transport_jobs")
      .update(updates)
      .eq("id", recordId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email) || null,
      action: "transport_job_assigned_from_dashboard",
      entity_type: "transport_job",
      entity_id: recordId,
      meta: { source: "dashboard_actions", vehicle_id: vehicleId, operator_id: operatorId },
    });

    await revalidateDashboardPages("transport");

    return NextResponse.json({ ok: true });
  }

  if (action === "assign_crane") {
    const recordId = clean(body?.record_id);
    const craneId = clean(body?.crane_id);
    const operatorId = clean(body?.operator_id);

    if (!recordId) {
      return NextResponse.json({ error: "Missing crane job." }, { status: 400 });
    }

    if (!craneId && !operatorId) {
      return NextResponse.json({ error: "Choose a crane or operator to assign." }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "crane_id")) updates.equipment_id = craneId;
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "operator_id")) {
      updates.operator_id = operatorId;
      updates.main_operator_id = operatorId;
    }

    const { error: updateError } = await supabase
      .from("jobs")
      .update(updates)
      .eq("id", recordId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email) || null,
      action: "crane_job_assigned_from_dashboard",
      entity_type: "job",
      entity_id: recordId,
      meta: { source: "dashboard_actions", equipment_id: craneId, operator_id: operatorId },
    });

    await revalidateDashboardPages("crane");

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown dashboard action." }, { status: 400 });
}
