import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { requireAdminApi } from "../../../../lib/routeGuards";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

type ExportDefinition = {
  title: string;
  filename: string;
  headers: string[];
  loadRows: (request: NextRequest) => Promise<Row[]>;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return clean(value).toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function formatMoney(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return text.includes('"') || text.includes(",") || text.includes("\n") || text.includes("\r")
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function makeCsv(headers: string[], rows: Row[]) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function csvResponse(definition: ExportDefinition, rows: Row[]) {
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(makeCsv(definition.headers, rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${definition.filename}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function withinText(row: Row, needle: string, keys: string[]) {
  const q = lower(needle);
  if (!q) return true;
  return keys.some((key) => lower(row[key]).includes(q));
}

function applyDateRange(query: any, request: NextRequest, column: string) {
  const from = clean(request.nextUrl.searchParams.get("date_from"));
  const to = clean(request.nextUrl.searchParams.get("date_to"));
  if (from) query = query.gte(column, from);
  if (to) query = query.lte(column, to);
  return query;
}

function applyEquals(query: any, request: NextRequest, paramName: string, column: string) {
  const value = clean(request.nextUrl.searchParams.get(paramName));
  if (!value || lower(value) === "all") return query;
  return query.eq(column, value);
}

function applyArchiveFilter(query: any, request: NextRequest) {
  const view = lower(request.nextUrl.searchParams.get("view") ?? "active");
  if (view === "archived") return query.eq("archived", true);
  if (view === "all") return query;
  return query.eq("archived", false);
}

function customerMatches(row: Row, request: NextRequest) {
  const customer = clean(request.nextUrl.searchParams.get("customer"));
  if (!customer || lower(customer) === "all") return true;
  return withinText(row, customer, ["customer", "company_name"]);
}

async function loadCustomers(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const q = clean(request.nextUrl.searchParams.get("q"));

  let query = admin
    .from("clients")
    .select("id, company_name, contact_name, phone, email, address, notes, archived, created_at")
    .order("company_name", { ascending: true })
    .limit(5000);

  query = applyArchiveFilter(query, request);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row: any) => ({
      company_name: row.company_name ?? "",
      contact_name: row.contact_name ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
      notes: row.notes ?? "",
      archived: row.archived ? "Yes" : "No",
      created_at: row.created_at ?? "",
    }))
    .filter((row) => withinText(row, q, ["company_name", "contact_name", "phone", "email", "address", "notes"]));
}

async function loadCraneJobs(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const customer = clean(request.nextUrl.searchParams.get("customer"));

  let query = admin
    .from("jobs")
    .select(`id, job_number, job_date, start_time, end_time, site_name, site_address, status, archived, invoice_status, invoice_number, invoice_date, total_invoice, amount_paid, clients:client_id ( company_name ), operators:operator_id ( full_name ), equipment:equipment_id ( name, asset_number )`)
    .order("job_date", { ascending: false })
    .limit(5000);

  query = applyArchiveFilter(query, request);
  query = applyDateRange(query, request, "job_date");
  query = applyEquals(query, request, "status", "status");
  query = applyEquals(query, request, "invoice_status", "invoice_status");
  if (isUuid(customer)) query = query.eq("client_id", customer);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((job: any) => {
      const client = first(job.clients);
      const operator = first(job.operators);
      const equipment = first(job.equipment);
      const total = Number(job.total_invoice ?? 0);
      const paid = Number(job.amount_paid ?? 0);

      return {
        job_number: job.job_number ?? "",
        job_date: job.job_date ?? "",
        start_time: job.start_time ?? "",
        end_time: job.end_time ?? "",
        customer: client?.company_name ?? "",
        site_name: job.site_name ?? "",
        site_address: job.site_address ?? "",
        crane: equipment?.name ?? "",
        asset_number: equipment?.asset_number ?? "",
        operator: operator?.full_name ?? "",
        status: job.status ?? "",
        invoice_status: job.invoice_status ?? "",
        invoice_number: job.invoice_number ?? "",
        invoice_date: job.invoice_date ?? "",
        total_invoice: formatMoney(total),
        amount_paid: formatMoney(paid),
        amount_outstanding: formatMoney(Math.max(total - paid, 0)),
        archived: job.archived ? "Yes" : "No",
      };
    })
    .filter((row) => customerMatches(row, request));
}

async function loadTransportJobs(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const customer = clean(request.nextUrl.searchParams.get("customer"));

  let query = admin
    .from("transport_jobs")
    .select(`id, transport_number, transport_date, collection_time, delivery_date, delivery_time, collection_address, delivery_address, load_description, status, job_type, price, agreed_sell_rate, supplier_cost, invoice_status, total_invoice, amount_paid, archived, vehicles:vehicle_id ( name, reg_number ), operators:operator_id ( full_name ), clients:client_id ( company_name )`)
    .order("transport_date", { ascending: false })
    .limit(5000);

  query = applyArchiveFilter(query, request);
  query = applyDateRange(query, request, "transport_date");
  query = applyEquals(query, request, "status", "status");
  query = applyEquals(query, request, "invoice_status", "invoice_status");
  query = applyEquals(query, request, "job_type", "job_type");
  if (isUuid(customer)) query = query.eq("client_id", customer);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((item: any) => {
      const vehicle = first(item.vehicles);
      const driver = first(item.operators);
      const client = first(item.clients);
      const total = Number(item.total_invoice ?? item.agreed_sell_rate ?? item.price ?? 0);
      const paid = Number(item.amount_paid ?? 0);

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
        job_type: item.job_type ?? "",
        status: item.status ?? "",
        pickup_address: item.collection_address ?? "",
        delivery_address: item.delivery_address ?? "",
        load_description: item.load_description ?? "",
        charge_rate: formatMoney(item.agreed_sell_rate ?? item.price ?? 0),
        supplier_cost: formatMoney(item.supplier_cost ?? 0),
        invoice_status: item.invoice_status ?? "",
        total_invoice: formatMoney(total),
        amount_paid: formatMoney(paid),
        amount_outstanding: formatMoney(Math.max(total - paid, 0)),
        archived: item.archived ? "Yes" : "No",
      };
    })
    .filter((row) => customerMatches(row, request));
}

async function loadQuotes(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const customer = clean(request.nextUrl.searchParams.get("customer"));

  let query = admin
    .from("quotes")
    .select("id, status, archived, quote_date, valid_until, amount, subject, notes, created_at, clients:client_id ( company_name )")
    .order("created_at", { ascending: false })
    .limit(5000);

  query = applyArchiveFilter(query, request);
  query = applyDateRange(query, request, "quote_date");
  query = applyEquals(query, request, "status", "status");
  if (isUuid(customer)) query = query.eq("client_id", customer);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((quote: any) => {
      const client = first(quote.clients);
      return {
        quote_date: quote.quote_date ?? "",
        valid_until: quote.valid_until ?? "",
        customer: client?.company_name ?? "",
        subject: quote.subject ?? "",
        status: quote.status ?? "",
        amount: formatMoney(quote.amount),
        notes: quote.notes ?? "",
        archived: quote.archived ? "Yes" : "No",
        created_at: quote.created_at ?? "",
      };
    })
    .filter((row) => customerMatches(row, request));
}

async function loadPurchaseOrders(request: NextRequest) {
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("purchase_orders")
    .select(`id, po_number, status, order_date, required_date, supplier_reference, total_cost, notes, created_at, suppliers:supplier_id ( company_name ), jobs:job_id ( job_number, site_name ), transport_jobs:transport_job_id ( transport_number )`)
    .order("created_at", { ascending: false })
    .limit(5000);

  query = applyDateRange(query, request, "order_date");
  query = applyEquals(query, request, "status", "status");

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((po: any) => {
    const supplier = first(po.suppliers);
    const job = first(po.jobs);
    const transportJob = first(po.transport_jobs);

    return {
      po_number: po.po_number ?? "",
      status: po.status ?? "",
      supplier: supplier?.company_name ?? "",
      crane_job: job?.job_number ?? "",
      crane_site: job?.site_name ?? "",
      transport_job: transportJob?.transport_number ?? "",
      order_date: po.order_date ?? "",
      required_date: po.required_date ?? "",
      supplier_reference: po.supplier_reference ?? "",
      total_cost: formatMoney(po.total_cost),
      notes: po.notes ?? "",
      created_at: po.created_at ?? "",
    };
  });
}

async function loadSuppliers(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const q = clean(request.nextUrl.searchParams.get("q"));

  let query = admin
    .from("suppliers")
    .select("id, company_name, contact_name, phone, email, address, category, status, notes, archived, created_at")
    .order("company_name", { ascending: true })
    .limit(5000);

  query = applyArchiveFilter(query, request);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((supplier: any) => ({
      company_name: supplier.company_name ?? "",
      contact_name: supplier.contact_name ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      category: supplier.category ?? "",
      status: supplier.status ?? "",
      notes: supplier.notes ?? "",
      archived: supplier.archived ? "Yes" : "No",
      created_at: supplier.created_at ?? "",
    }))
    .filter((row) => withinText(row, q, ["company_name", "contact_name", "phone", "email", "address", "category", "status", "notes"]));
}

async function loadOperators(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const q = clean(request.nextUrl.searchParams.get("q"));

  let query = admin
    .from("operators")
    .select("id, full_name, email, phone, status, employment_type, company_name, notes, archived, created_at")
    .order("full_name", { ascending: true })
    .limit(5000);

  query = applyArchiveFilter(query, request);
  query = applyEquals(query, request, "status", "status");

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((operator: any) => ({
      full_name: operator.full_name ?? "",
      email: operator.email ?? "",
      phone: operator.phone ?? "",
      status: operator.status ?? "",
      employment_type: operator.employment_type ?? "",
      company_name: operator.company_name ?? "",
      notes: operator.notes ?? "",
      archived: operator.archived ? "Yes" : "No",
      created_at: operator.created_at ?? "",
    }))
    .filter((row) => withinText(row, q, ["full_name", "email", "phone", "status", "employment_type", "company_name", "notes"]));
}

async function loadOperatorQualifications(request: NextRequest) {
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("operator_qualifications")
    .select("id, operator_id, qualification_name, issuer, certificate_number, issue_date, expiry_date, notes, created_at, operators:operator_id ( full_name )")
    .order("expiry_date", { ascending: true })
    .limit(5000);

  query = applyDateRange(query, request, "expiry_date");

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((q: any) => {
    const operator = first(q.operators);

    return {
      operator: operator?.full_name ?? "",
      qualification_name: q.qualification_name ?? "",
      issuer: q.issuer ?? "",
      certificate_number: q.certificate_number ?? "",
      issue_date: q.issue_date ?? "",
      expiry_date: q.expiry_date ?? "",
      notes: q.notes ?? "",
      created_at: q.created_at ?? "",
    };
  });
}

async function loadCampaignRecipients(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const q = clean(request.nextUrl.searchParams.get("q"));

  const { data, error } = await admin
    .from("sales_leads")
    .select("id, company_name, contact_name, email, phone, area, industry, status, do_not_contact, last_contacted_at, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((lead: any) => ({
      company_name: lead.company_name ?? "",
      contact_name: lead.contact_name ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      area: lead.area ?? "",
      industry: lead.industry ?? "",
      status: lead.status ?? "",
      do_not_contact: lead.do_not_contact ? "Yes" : "No",
      last_contacted_at: lead.last_contacted_at ?? "",
      created_at: lead.created_at ?? "",
    }))
    .filter((row) => withinText(row, q, ["company_name", "contact_name", "email", "phone", "area", "industry", "status"]));
}

async function loadSuppressionList() {
  const admin = createSupabaseAdminClient();

  const [{ data: unsubscribes, error: unsubscribeError }, { data: suppressions, error: suppressionError }] = await Promise.all([
    admin
      .from("marketing_unsubscribes")
      .select("id, email_normalized, source, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    admin
      .from("marketing_suppression_entries")
      .select("id, match_type, match_value, reason, active, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  if (unsubscribeError) throw new Error(unsubscribeError.message);
  if (suppressionError) throw new Error(suppressionError.message);

  return [
    ...(unsubscribes ?? []).map((row: any) => ({
      list: "unsubscribe",
      match_type: "email",
      match_value: row.email_normalized ?? "",
      reason: row.source ?? "unsubscribe",
      active: "Yes",
      created_at: row.created_at ?? "",
    })),
    ...(suppressions ?? []).map((row: any) => ({
      list: "suppression",
      match_type: row.match_type ?? "",
      match_value: row.match_value ?? "",
      reason: row.reason ?? "",
      active: row.active ? "Yes" : "No",
      created_at: row.created_at ?? "",
    })),
  ];
}

async function loadStatusInvoiceAudit(request: NextRequest) {
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("job_status_audit_log")
    .select("id, record_type, record_id, record_reference, field_changed, old_value, new_value, actor_username, source, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  query = applyDateRange(query, request, "created_at");

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    created_at: row.created_at ?? "",
    record_type: row.record_type ?? "",
    record_reference: row.record_reference ?? "",
    record_id: row.record_id ?? "",
    field_changed: row.field_changed ?? "",
    old_value: row.old_value ?? "",
    new_value: row.new_value ?? "",
    changed_by: row.actor_username ?? "",
    source: row.source ?? "",
  }));
}

async function loadOutstandingInvoices(request: NextRequest) {
  const [craneRows, transportRows] = await Promise.all([
    loadCraneJobs(request),
    loadTransportJobs(request),
  ]);

  return [
    ...craneRows
      .filter((row) => ["not invoiced", "invoiced", "part paid"].includes(lower(row.invoice_status)))
      .map((row) => ({
        job_type: "Crane",
        reference: row.job_number,
        job_date: row.job_date,
        customer: row.customer,
        status: row.status,
        invoice_status: row.invoice_status,
        invoice_number: row.invoice_number,
        total_invoice: row.total_invoice,
        amount_paid: row.amount_paid,
        amount_outstanding: row.amount_outstanding,
      })),
    ...transportRows
      .filter((row) => ["not invoiced", "invoiced", "part paid"].includes(lower(row.invoice_status)))
      .map((row) => ({
        job_type: "Transport",
        reference: row.transport_number,
        job_date: row.collection_date,
        customer: row.customer,
        status: row.status,
        invoice_status: row.invoice_status,
        invoice_number: "",
        total_invoice: row.total_invoice,
        amount_paid: row.amount_paid,
        amount_outstanding: row.amount_outstanding,
      })),
  ];
}

const EXPORTS: Record<string, ExportDefinition> = {
  customers: {
    title: "Customers",
    filename: "customers",
    headers: ["company_name", "contact_name", "phone", "email", "address", "notes", "archived", "created_at"],
    loadRows: loadCustomers,
  },
  "crane-jobs": {
    title: "Crane jobs",
    filename: "crane-jobs",
    headers: ["job_number", "job_date", "start_time", "end_time", "customer", "site_name", "site_address", "crane", "asset_number", "operator", "status", "invoice_status", "invoice_number", "invoice_date", "total_invoice", "amount_paid", "amount_outstanding", "archived"],
    loadRows: loadCraneJobs,
  },
  "transport-jobs": {
    title: "Transport jobs",
    filename: "transport-jobs",
    headers: ["transport_number", "collection_date", "collection_time", "delivery_date", "delivery_time", "customer", "vehicle", "vehicle_reg", "driver", "job_type", "status", "pickup_address", "delivery_address", "load_description", "charge_rate", "supplier_cost", "invoice_status", "total_invoice", "amount_paid", "amount_outstanding", "archived"],
    loadRows: loadTransportJobs,
  },
  quotes: {
    title: "Quotes",
    filename: "quotes",
    headers: ["quote_date", "valid_until", "customer", "subject", "status", "amount", "notes", "archived", "created_at"],
    loadRows: loadQuotes,
  },
  "purchase-orders": {
    title: "Purchase orders",
    filename: "purchase-orders",
    headers: ["po_number", "status", "supplier", "crane_job", "crane_site", "transport_job", "order_date", "required_date", "supplier_reference", "total_cost", "notes", "created_at"],
    loadRows: loadPurchaseOrders,
  },
  "outstanding-invoices": {
    title: "Outstanding invoices",
    filename: "outstanding-invoices",
    headers: ["job_type", "reference", "job_date", "customer", "status", "invoice_status", "invoice_number", "total_invoice", "amount_paid", "amount_outstanding"],
    loadRows: loadOutstandingInvoices,
  },
  suppliers: {
    title: "Suppliers/subcontractors",
    filename: "suppliers-subcontractors",
    headers: ["company_name", "contact_name", "phone", "email", "address", "category", "status", "notes", "archived", "created_at"],
    loadRows: loadSuppliers,
  },
  operators: {
    title: "Operators/staff",
    filename: "operators-staff",
    headers: ["full_name", "email", "phone", "status", "employment_type", "company_name", "notes", "archived", "created_at"],
    loadRows: loadOperators,
  },
  "operator-qualifications": {
    title: "Operator qualifications",
    filename: "operator-qualifications",
    headers: ["operator", "qualification_name", "issuer", "certificate_number", "issue_date", "expiry_date", "notes", "created_at"],
    loadRows: loadOperatorQualifications,
  },
  "campaign-recipients": {
    title: "Campaign recipients",
    filename: "campaign-recipients",
    headers: ["company_name", "contact_name", "email", "phone", "area", "industry", "status", "do_not_contact", "last_contacted_at", "created_at"],
    loadRows: loadCampaignRecipients,
  },
  suppression: {
    title: "Suppression/unsubscribe list",
    filename: "suppression-unsubscribes",
    headers: ["list", "match_type", "match_value", "reason", "active", "created_at"],
    loadRows: loadSuppressionList,
  },
  "status-invoice-audit": {
    title: "Status/invoice audit",
    filename: "status-invoice-audit",
    headers: ["created_at", "record_type", "record_reference", "record_id", "field_changed", "old_value", "new_value", "changed_by", "source"],
    loadRows: loadStatusInvoiceAudit,
  },
};

export async function GET(request: NextRequest, { params }: { params: { exportType: string } }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  const definition = EXPORTS[clean(params.exportType).toLowerCase()];

  if (!definition) {
    return NextResponse.json({ error: "Unknown export type." }, { status: 404 });
  }

  try {
    const rows = await definition.loadRows(request);
    return csvResponse(definition, rows);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || `Could not create ${definition.title} export.` },
      { status: 500 },
    );
  }
}
