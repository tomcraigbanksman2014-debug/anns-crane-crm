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
  const invoiceFilter = String(request.nextUrl.searchParams.get("invoice") ?? "all").toLowerCase();

  let query = supabase
    .from("jobs")
    .select(`
      id,
      job_number,
      job_date,
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
        company_name
      ),
      operators:operator_id (
        full_name
      ),
      equipment:equipment_id (
        name,
        asset_number
      )
    `)
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((job: any) => {
    const client = first(job.clients);
    const operator = first(job.operators);
    const equipment = first(job.equipment);

    return {
      job_number: job.job_number ?? "",
      job_date: job.job_date ?? "",
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
      total_invoice: Number(job.total_invoice ?? 0).toFixed(2),
      amount_paid: Number(job.amount_paid ?? 0).toFixed(2),
      amount_outstanding: Math.max(
        Number(job.total_invoice ?? 0) - Number(job.amount_paid ?? 0),
        0
      ).toFixed(2),
    };
  });

  const csv = makeCsv(rows);
  const filename = `jobs-${view}-${invoiceFilter}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
