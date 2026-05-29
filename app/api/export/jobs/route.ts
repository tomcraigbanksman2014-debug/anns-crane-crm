import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function makeCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];

  return lines.join("\n");
}

function cleanParam(value: unknown) {
  return String(value ?? "").trim();
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

export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const view = String(request.nextUrl.searchParams.get("view") ?? "active").toLowerCase();
  const invoiceFilter = String(request.nextUrl.searchParams.get("invoice") ?? "all").toLowerCase();
  const q = cleanParam(request.nextUrl.searchParams.get("q"));
  const customerId = cleanParam(request.nextUrl.searchParams.get("customer"));
  const dateFrom = cleanParam(request.nextUrl.searchParams.get("date_from")).slice(0, 10);
  const dateTo = cleanParam(request.nextUrl.searchParams.get("date_to")).slice(0, 10);
  const statusFilter = cleanParam(request.nextUrl.searchParams.get("status"));
  const operatorId = cleanParam(request.nextUrl.searchParams.get("operator"));
  const equipmentId = cleanParam(request.nextUrl.searchParams.get("equipment"));

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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filteredRows = (data ?? []).filter(
    (job: any) => rowMatchesDateWindow(job, dateFrom, dateTo) && rowMatchesSearch(job, q)
  );

  const rows = filteredRows.map((job: any) => {
    const client = first(job.clients);
    const operator = first(job.operators);
    const equipment = first(job.equipment);
    const totalInvoice = netInvoiceValue(job);
    const amountPaid = Number(job.amount_paid ?? 0);

    return {
      job_number: job.job_number ?? "",
      date_from: job.start_date ?? job.job_date ?? "",
      date_to: job.end_date ?? job.job_date ?? "",
      start_time: job.start_time ?? "",
      end_time: job.end_time ?? "",
      customer: client?.company_name ?? "",
      operator: operator?.full_name ?? "",
      equipment: equipment?.name ?? "",
      equipment_asset_number: equipment?.asset_number ?? "",
      site_name: job.site_name ?? "",
      site_address: job.site_address ?? "",
      status: job.status ?? "",
      archived: job.archived ? "Yes" : "No",
      invoice_status: job.invoice_status ?? "",
      invoice_number: job.invoice_number ?? "",
      invoice_date: job.invoice_date ?? "",
      invoice_created_at: job.invoice_created_at ?? "",
      total_invoice_ex_vat: totalInvoice.toFixed(2),
      amount_paid: Number.isFinite(amountPaid) ? amountPaid.toFixed(2) : "0.00",
      amount_outstanding: Math.max(totalInvoice - (Number.isFinite(amountPaid) ? amountPaid : 0), 0).toFixed(2),
    };
  });

  const csv = makeCsv(rows);
  const filenameParts = ["jobs", view, invoiceFilter];
  if (customerId) filenameParts.push("customer");
  if (statusFilter) filenameParts.push(statusFilter);
  const filename = `${filenameParts.filter(Boolean).join("-")}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
