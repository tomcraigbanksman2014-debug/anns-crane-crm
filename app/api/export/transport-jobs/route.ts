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
  const driverId = cleanParam(request.nextUrl.searchParams.get("driver"));
  const vehicleId = cleanParam(request.nextUrl.searchParams.get("vehicle"));
  const jobTypeFilter = cleanParam(request.nextUrl.searchParams.get("job_type"));

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
  if (driverId) query = query.eq("operator_id", driverId);
  if (vehicleId) query = query.eq("vehicle_id", vehicleId);
  if (jobTypeFilter) query = query.eq("job_type", jobTypeFilter);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filteredRows = (data ?? []).filter(
    (item: any) => rowMatchesDateWindow(item, dateFrom, dateTo) && rowMatchesSearch(item, q)
  );

  const rows = filteredRows.map((item: any) => {
    const vehicle = first(item.vehicles);
    const driver = first(item.operators);
    const client = first(item.clients);
    const linkedJob = first(item.jobs);

    const totalInvoice = Number(item.total_invoice ?? item.agreed_sell_rate ?? item.price ?? 0);
    const amountPaid = Number(item.amount_paid ?? 0);
    const safeTotalInvoice = Number.isFinite(totalInvoice) ? totalInvoice : 0;
    const safePaid = Number.isFinite(amountPaid) ? amountPaid : 0;

    return {
      transport_number: item.transport_number ?? "",
      collection_date: item.transport_date ?? "",
      collection_time: item.collection_time ?? "",
      delivery_date: item.delivery_date ?? "",
      delivery_time: item.delivery_time ?? "",
      customer: client?.company_name ?? "",
      vehicle: vehicle?.name ?? "",
      vehicle_reg: vehicle?.reg_number ?? "",
      driver: driver?.full_name ?? "",
      linked_crane_job: linkedJob?.job_number ?? "",
      linked_crane_site: linkedJob?.site_name ?? "",
      job_type: item.job_type ?? "",
      status: item.status ?? "",
      pickup_address: item.collection_address ?? "",
      delivery_address: item.delivery_address ?? "",
      load_description: item.load_description ?? "",
      charge_rate: Number(item.agreed_sell_rate ?? item.price ?? 0).toFixed(2),
      supplier_cost: Number(item.supplier_cost ?? 0).toFixed(2),
      invoice_status: item.invoice_status ?? "",
      total_invoice: safeTotalInvoice.toFixed(2),
      amount_paid: safePaid.toFixed(2),
      amount_outstanding: Math.max(safeTotalInvoice - safePaid, 0).toFixed(2),
      archived: item.archived ? "Yes" : "No",
    };
  });

  const csv = makeCsv(rows);
  const filenameParts = ["transport-jobs", view, invoiceFilter];
  if (customerId) filenameParts.push("customer");
  if (statusFilter) filenameParts.push(statusFilter);
  if (vehicleId) filenameParts.push("vehicle");
  if (driverId) filenameParts.push("driver");
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
