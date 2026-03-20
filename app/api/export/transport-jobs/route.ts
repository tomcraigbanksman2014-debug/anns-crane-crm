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

export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const view = String(request.nextUrl.searchParams.get("view") ?? "active").toLowerCase();
  const q = String(request.nextUrl.searchParams.get("q") ?? "").trim();

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
        name,
        reg_number
      ),
      operators:operator_id (
        full_name
      ),
      clients:client_id (
        company_name
      ),
      jobs:linked_job_id (
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

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((item: any) => {
    const vehicle = first(item.vehicles);
    const driver = first(item.operators);
    const client = first(item.clients);
    const linkedJob = first(item.jobs);

    const totalInvoice = Number(item.total_invoice ?? item.agreed_sell_rate ?? item.price ?? 0);
    const amountPaid = Number(item.amount_paid ?? 0);

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
      total_invoice: totalInvoice.toFixed(2),
      amount_paid: amountPaid.toFixed(2),
      amount_outstanding: Math.max(totalInvoice - amountPaid, 0).toFixed(2),
      archived: item.archived ? "Yes" : "No",
    };
  });

  const csv = makeCsv(rows);
  const filename = `transport-jobs-${view}${q ? "-filtered" : ""}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
