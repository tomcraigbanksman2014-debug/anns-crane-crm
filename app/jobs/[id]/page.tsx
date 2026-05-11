import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import JobEquipmentManager from "./JobEquipmentManager";
import DocumentUploadForm from "./DocumentUploadForm";
import DocumentDeleteButton from "./DocumentDeleteButton";
import DuplicateJobButton from "./DuplicateJobButton";
import MultiSupplierFields from "../../components/MultiSupplierFields";
import {
  buildFallbackSupplierLink,
  normaliseSupplierLinks,
  parseSupplierLinksFromFormData,
  replaceJobSupplierLinks,
} from "../../lib/jobSupplierLinks";
import { redirect } from "next/navigation";

import ServerSubmitButton from "../../components/ServerSubmitButton";
import PreviousPageBackButton from "../../components/PreviousPageBackButton";
function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB");
}

function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}


type CommercialBreakdownLine = {
  id: string;
  line_type: "sell" | "cost";
  item: string;
  description: string;
  date_from: string;
  date_to: string;
  quantity: string;
  rate: string;
  amount: number;
  notes: string;
};

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function numberFromText(value: unknown) {
  const raw = String(value ?? "").replace(/£/g, "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function normaliseCommercialLine(raw: any, index: number): CommercialBreakdownLine | null {
  if (!raw || typeof raw !== "object") return null;

  const item = String(raw.item ?? raw.title ?? raw.name ?? "").trim();
  const description = String(raw.description ?? raw.notes ?? "").trim();
  const amount = numberFromText(raw.amount ?? raw.total ?? raw.value);
  const hasContent = item || description || amount !== 0;

  if (!hasContent) return null;

  const lineTypeRaw = String(raw.line_type ?? raw.type ?? "sell").trim().toLowerCase();

  return {
    id: String(raw.id ?? `line-${index + 1}`),
    line_type: lineTypeRaw === "cost" ? "cost" : "sell",
    item,
    description,
    date_from: String(raw.date_from ?? raw.from ?? "").slice(0, 10),
    date_to: String(raw.date_to ?? raw.to ?? "").slice(0, 10),
    quantity: String(raw.quantity ?? raw.qty ?? "").trim(),
    rate: String(raw.rate ?? "").trim(),
    amount,
    notes: String(raw.notes ?? "").trim(),
  };
}

function normaliseCommercialBreakdownLines(raw: any, fallback: CommercialBreakdownLine[]) {
  const source = Array.isArray(raw) ? raw : Array.isArray(raw?.lines) ? raw.lines : [];
  const lines = source
    .map((line: any, index: number) => normaliseCommercialLine(line, index))
    .filter(Boolean) as CommercialBreakdownLine[];

  return lines.length > 0 ? lines : fallback;
}

function parseCommercialBreakdownFromFormData(formData: FormData) {
  const lines: CommercialBreakdownLine[] = [];

  for (let index = 0; index < 16; index += 1) {
    const item = cleanText(formData.get(`commercial_item_${index}`));
    const description = cleanText(formData.get(`commercial_description_${index}`));
    const amount = numberFromText(formData.get(`commercial_amount_${index}`));
    const notes = cleanText(formData.get(`commercial_notes_${index}`));

    if (!item && !description && !notes && amount === 0) {
      continue;
    }

    const rawLineType = cleanText(formData.get(`commercial_line_type_${index}`)).toLowerCase();

    lines.push({
      id: cleanText(formData.get(`commercial_id_${index}`)) || `line-${index + 1}`,
      line_type: rawLineType === "cost" ? "cost" : "sell",
      item,
      description,
      date_from: cleanText(formData.get(`commercial_date_from_${index}`)),
      date_to: cleanText(formData.get(`commercial_date_to_${index}`)),
      quantity: cleanText(formData.get(`commercial_quantity_${index}`)),
      rate: cleanText(formData.get(`commercial_rate_${index}`)),
      amount,
      notes,
    });
  }

  return lines;
}

function commercialLineTotal(lines: CommercialBreakdownLine[], lineType: "sell" | "cost") {
  return lines
    .filter((line) => line.line_type === lineType)
    .reduce((sum, line) => sum + numberFromText(line.amount), 0);
}

function makeEditableCommercialRows(lines: CommercialBreakdownLine[]) {
  const existingRows = lines.filter((line) => {
    return Boolean(
      cleanText(line.item) ||
        cleanText(line.description) ||
        cleanText(line.date_from) ||
        cleanText(line.date_to) ||
        cleanText(line.quantity) ||
        cleanText(line.rate) ||
        cleanText(line.notes) ||
        numberFromText(line.amount) > 0
    );
  });

  return [
    ...existingRows.slice(0, 15),
    {
      id: `new-line-${existingRows.length + 1}`,
      line_type: "sell" as const,
      item: "",
      description: "",
      date_from: "",
      date_to: "",
      quantity: "",
      rate: "",
      amount: 0,
      notes: "",
    },
  ];
}

function buildDefaultCraneCommercialLines(job: any, allocations: any[]) {
  const lines: CommercialBreakdownLine[] = [];
  const defaultFrom = String(job?.start_date ?? job?.job_date ?? "").slice(0, 10);
  const defaultTo = String(job?.end_date ?? job?.job_date ?? "").slice(0, 10);

  allocations.forEach((allocation, index) => {
    const name = allocatedAssetName(allocation);
    const from = String(allocation?.start_date ?? defaultFrom ?? "").slice(0, 10);
    const to = String(allocation?.end_date ?? defaultTo ?? "").slice(0, 10);
    const sell = numberFromText(allocation?.agreed_sell_rate);
    const cost = numberFromText(allocation?.supplier_cost ?? allocation?.agreed_cost);

    if (sell > 0) {
      lines.push({
        id: `allocation-sell-${allocation?.id ?? index}`,
        line_type: "sell",
        item: name,
        description: `${name} customer charge`,
        date_from: from,
        date_to: to,
        quantity: "",
        rate: "",
        amount: sell,
        notes: allocation?.notes ? String(allocation.notes) : "",
      });
    }

    if (cost > 0) {
      lines.push({
        id: `allocation-cost-${allocation?.id ?? index}`,
        line_type: "cost",
        item: name,
        description: `${name} supplier/cross-hire cost`,
        date_from: from,
        date_to: to,
        quantity: "",
        rate: "",
        amount: cost,
        notes: allocation?.supplier_reference ? `Supplier ref: ${allocation.supplier_reference}` : "",
      });
    }
  });

  if (lines.length === 0) {
    const sell = numberFromText(job?.invoice_subtotal ?? job?.price ?? job?.total_invoice);
    if (sell > 0) {
      lines.push({
        id: "job-sell-price",
        line_type: "sell",
        item: job?.site_name ? String(job.site_name) : "Job charge",
        description: "Customer agreed job charge",
        date_from: defaultFrom,
        date_to: defaultTo,
        quantity: "",
        rate: "",
        amount: sell,
        notes: "",
      });
    }
  }

  return lines;
}

function dateRangeText(from: string | null | undefined, to: string | null | undefined) {
  const fromText = fmtDate(from);
  const toText = fmtDate(to);
  if (fromText === "—" && toText === "—") return "—";
  if (fromText !== "—" && toText !== "—" && fromText !== toText) return `${fromText} → ${toText}`;
  return fromText !== "—" ? fromText : toText;
}

function statusPillStyle(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "confirmed") {
    return {
      background: "rgba(0,120,255,0.12)",
      color: "#0b57d0",
      border: "1px solid rgba(0,120,255,0.20)",
    };
  }

  if (s === "in_progress") {
    return {
      background: "rgba(255,140,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,140,0,0.22)",
    };
  }

  if (s === "completed") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (s === "provisional") {
    return {
      background: "rgba(120,120,120,0.12)",
      color: "#555",
      border: "1px solid rgba(120,120,120,0.18)",
    };
  }

  if (s === "late_cancelled") {
    return {
      background: "rgba(255,0,0,0.10)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.18)",
    };
  }

  if (s === "cancelled") {
    return {
      background: "rgba(160,160,160,0.12)",
      color: "#666",
      border: "1px solid rgba(160,160,160,0.18)",
    };
  }

  return {
    background: "rgba(120,120,120,0.12)",
    color: "#555",
    border: "1px solid rgba(120,120,120,0.18)",
  };
}

function allocatedAssetName(item: any) {
  if (item.asset_type === "crane") {
    const crane = first(item.cranes);
    return crane?.name ?? "Crane";
  }

  if (item.asset_type === "vehicle") {
    const vehicle = first(item.vehicles);
    return vehicle?.name ?? "Vehicle";
  }

  if (item.asset_type === "equipment") {
    const equipment = first(item.equipment);
    return equipment?.name ?? "Equipment";
  }

  return item.item_name ?? "Other";
}

function allocationMeta(item: any, label: string) {
  const operator = first(item.operators);
  const supplier = first(item.suppliers);

  return [
    label,
    item.start_date ? `From ${fmtDate(item.start_date)}` : null,
    item.end_date ? `To ${fmtDate(item.end_date)}` : null,
    item.start_time ? `Start ${item.start_time}` : null,
    item.end_time ? `End ${item.end_time}` : null,
    operator?.full_name ? `Operator: ${operator.full_name}` : null,
    supplier?.company_name ? `Supplier: ${supplier.company_name}` : null,
    item.agreed_sell_rate ? `Sell: ${money(item.agreed_sell_rate)}` : null,
    item.supplier_cost ? `Cost: ${money(item.supplier_cost)}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
}

function documentTypeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "Other";
  return raw
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function documentHref(filePath: string | null | undefined) {
  if (!filePath || !process.env.NEXT_PUBLIC_SUPABASE_URL) return "#";
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-documents/${filePath}`;
}

async function updateJobSuppliers(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const jobId = String(formData.get("job_id") ?? "").trim();

  if (!jobId) {
    redirect(`/jobs?error=${encodeURIComponent("Job id missing.")}`);
  }

  const supplierLinks = parseSupplierLinksFromFormData(formData);

  try {
    await replaceJobSupplierLinks(supabase, jobId, supplierLinks);
  } catch (error: any) {
    redirect(`/jobs/${jobId}?error=${encodeURIComponent(error?.message || "Could not save job suppliers.")}`);
  }

  redirect(`/jobs/${jobId}?success=${encodeURIComponent("Job suppliers updated.")}`);
}

async function createPurchaseOrderFromJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const jobId = String(formData.get("job_id") ?? "").trim();
  if (!jobId) {
    redirect(`/jobs?error=${encodeURIComponent("Job id missing.")}`);
  }

  const supplierId = String(formData.get("supplier_id") ?? "").trim() || null;
  const orderDate = String(formData.get("order_date") ?? "").trim() || null;
  const requiredDate = String(formData.get("required_date") ?? "").trim() || null;
  const supplierReference = String(formData.get("supplier_reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "").trim() || "draft";

  const { data: jobRow } = await supabase
    .from("jobs")
    .select("id, job_number, site_name")
    .eq("id", jobId)
    .maybeSingle();

  const d = new Date();
  const poNumber = `PO-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(
    d.getMinutes()
  ).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;

  const { data: created, error } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: poNumber,
      supplier_id: supplierId,
      job_id: jobId,
      status,
      order_date: orderDate,
      required_date: requiredDate,
      supplier_reference: supplierReference,
      total_cost: 0,
      notes,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    redirect(
      `/jobs/${jobId}?error=${encodeURIComponent(error?.message ?? "Could not create purchase order.")}`
    );
  }

  if (supplierId) {
    await supabase.from("supplier_correspondence").insert({
      supplier_id: supplierId,
      type: status === "sent" ? "email" : "note",
      subject: status === "sent" ? "Purchase Order Sent" : "Purchase Order Created",
      message: [
        `Purchase order ${poNumber} created from crane job ${jobRow?.job_number ? `#${jobRow.job_number}` : ""}.`,
        jobRow?.site_name ? `Site: ${jobRow.site_name}.` : "",
        supplierReference ? `Supplier ref: ${supplierReference}.` : "",
        requiredDate ? `Required date: ${requiredDate}.` : "",
        notes ? `Notes: ${notes}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      created_by: "system",
    });
  }

  redirect(`/purchase-orders/${created.id}?success=${encodeURIComponent(`Purchase order ${poNumber} saved.`)}`);
}


async function updateJobCommercialBreakdown(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const jobId = cleanText(formData.get("job_id"));

  if (!jobId) {
    redirect(`/jobs?error=${encodeURIComponent("Job id missing.")}`);
  }

  const lines = parseCommercialBreakdownFromFormData(formData);

  if (lines.length === 0) {
    redirect(`/jobs/${jobId}?error=${encodeURIComponent("Add at least one commercial breakdown line before saving.")}`);
  }

  const sellSubtotal = Math.round(commercialLineTotal(lines, "sell") * 100) / 100;
  const costSubtotal = Math.round(commercialLineTotal(lines, "cost") * 100) / 100;
  const vat = Math.round(sellSubtotal * 0.2 * 100) / 100;
  const invoiceTotal = Math.round((sellSubtotal + vat) * 100) / 100;

  const { error } = await supabase
    .from("jobs")
    .update({
      commercial_breakdown: lines,
      price: sellSubtotal,
      invoice_subtotal: sellSubtotal,
      invoice_vat: vat,
      total_invoice: invoiceTotal,
      cross_hire_cost_total: costSubtotal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    redirect(`/jobs/${jobId}?error=${encodeURIComponent(error.message || "Could not save commercial breakdown.")}`);
  }

  redirect(`/jobs/${jobId}?success=${encodeURIComponent("Commercial breakdown updated.")}`);
}

async function updateJobRequirementFlags(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const jobId = cleanText(formData.get("job_id"));
  const noOperatorRequired = formData.get("no_operator_required") === "on";

  if (!jobId) {
    redirect(`/jobs?error=${encodeURIComponent("Job id missing.")}`);
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      no_operator_required: noOperatorRequired,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    redirect(`/jobs/${jobId}?error=${encodeURIComponent(error.message || "Could not save allocation requirements.")}`);
  }

  redirect(`/jobs/${jobId}?success=${encodeURIComponent("Allocation requirements updated.")}`);
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; success?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: job, error: jobError },
    { data: craneList },
    { data: vehicleList },
    { data: equipmentList },
    { data: operatorList },
    { data: supplierList },
    { data: poList },
    { data: jobDocuments },
    { data: jobSupplierLinks },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        *,
        clients:client_id (
          id,
          company_name,
          contact_name,
          phone,
          email
        ),
        suppliers:supplier_id (
          id,
          company_name,
          phone,
          email,
          category
        ),
        operators:operator_id (
          id,
          full_name,
          phone,
          email,
          status
        ),
        job_equipment (
          id,
          asset_type,
          crane_id,
          vehicle_id,
          equipment_id,
          operator_id,
          source_type,
          supplier_id,
          purchase_order_id,
          item_name,
          start_date,
          end_date,
          start_time,
          end_time,
          agreed_cost,
          agreed_sell_rate,
          supplier_cost,
          supplier_reference,
          notes,
          cranes:crane_id (
            id,
            name,
            reg_number,
            capacity
          ),
          vehicles:vehicle_id (
            id,
            name,
            reg_number
          ),
          equipment:equipment_id (
            id,
            name,
            asset_number
          ),
          operators:operator_id (
            id,
            full_name
          ),
          suppliers:supplier_id (
            id,
            company_name,
            category
          ),
          purchase_orders:purchase_order_id (
            id,
            po_number,
            status
          )
        )
      `)
      .eq("id", params.id)
      .single(),

    supabase
      .from("cranes")
      .select("id, name, reg_number, capacity, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("vehicles")
      .select("id, name, reg_number, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("equipment")
      .select("id, name, asset_number, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("operators")
      .select("id, full_name, archived, status")
      .eq("archived", false)
      .order("full_name", { ascending: true }),

    supabase
      .from("suppliers")
      .select("id, company_name, phone, email, category, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),

    supabase
      .from("purchase_orders")
      .select(`
        id,
        po_number,
        status,
        job_id,
        supplier_id,
        order_date,
        required_date,
        supplier_reference,
        total_cost,
        notes,
        suppliers:supplier_id (
          id,
          company_name
        )
      `)
      .order("created_at", { ascending: false }),

    supabase
      .from("job_documents")
      .select("id, file_name, file_path, file_type, document_type, created_at, share_with_operator")
      .eq("job_id", params.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("job_supplier_links")
      .select(`
        id,
        supplier_id,
        supplier_display_name,
        supplier_category,
        supplier_reference,
        service_description,
        supplier_cost,
        notes,
        is_primary,
        sort_order,
        suppliers:supplier_id (
          id,
          company_name,
          category
        )
      `)
      .eq("job_id", params.id)
      .order("sort_order", { ascending: true }),
  ]);

  const client = first((job as any)?.clients);
  const linkedSupplier = first((job as any)?.suppliers);
  const linkedOperator = first((job as any)?.operators);
  const allocationList = ((job as any)?.job_equipment ?? []) as any[];

  const cranesAllocated = allocationList.filter((item) => item.asset_type === "crane");
  const vehiclesAllocated = allocationList.filter((item) => item.asset_type === "vehicle");
  const equipmentAllocated = allocationList.filter((item) => item.asset_type === "equipment");
  const otherAllocated = allocationList.filter((item) => item.asset_type === "other");

  const primarySupplierCost = Number((job as any)?.cross_hire_cost_total ?? 0);
  const primarySupplierReference =
    allocationList.find((item) => item?.supplier_reference)?.supplier_reference ?? null;
  const supplierLinks = normaliseSupplierLinks(
    jobSupplierLinks as any[] | null | undefined,
    buildFallbackSupplierLink({
      supplier_id: (job as any)?.supplier_id ?? null,
      supplier_display_name: linkedSupplier?.company_name ?? null,
      supplier_category: linkedSupplier?.category ?? null,
      supplier_reference: primarySupplierReference,
      service_description: "Legacy / primary supplier",
      supplier_cost: primarySupplierCost || null,
    })
  );

  const allocatedSellSubtotal = allocationList.reduce(
    (sum, item) => sum + Number(item?.agreed_sell_rate ?? 0),
    0
  );

  const allocatedCostSubtotal = allocationList.reduce(
    (sum, item) => sum + Number(item?.supplier_cost ?? item?.agreed_cost ?? 0),
    0
  );

  const liveVat = Number((job as any)?.invoice_vat ?? 0);
  const allocatedTotal = allocatedSellSubtotal + liveVat;
  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const searchErrorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";
  const linkedPurchaseOrders = ((poList as any[]) ?? []).filter((item: any) => item.job_id === params.id);
  const documents = (jobDocuments as any[]) ?? [];
  const commercialLines = normaliseCommercialBreakdownLines(
    (job as any)?.commercial_breakdown,
    buildDefaultCraneCommercialLines(job as any, allocationList)
  );
  const commercialSellSubtotal = Math.round(commercialLineTotal(commercialLines, "sell") * 100) / 100;
  const commercialCostSubtotal = Math.round(commercialLineTotal(commercialLines, "cost") * 100) / 100;
  const commercialVat = Math.round((Number((job as any)?.invoice_vat ?? 0) || commercialSellSubtotal * 0.2) * 100) / 100;
  const commercialInvoiceTotal = Math.round(
    (Number((job as any)?.total_invoice ?? 0) || commercialSellSubtotal + commercialVat) * 100
  ) / 100;
  const amountPaid = numberFromText((job as any)?.amount_paid ?? (job as any)?.part_paid_amount);
  const outstandingBalance = Math.max(0, commercialInvoiceTotal - amountPaid);
  const estimatedGrossProfit = commercialSellSubtotal - commercialCostSubtotal;
  const estimatedMargin = commercialSellSubtotal > 0 ? (estimatedGrossProfit / commercialSellSubtotal) * 100 : 0;
  const noOperatorRequired = Boolean((job as any)?.no_operator_required);
  const operatorAllocated = Boolean(
    (job as any)?.operator_id ||
      (job as any)?.operator_name ||
      linkedOperator?.full_name ||
      allocationList.some((allocation) => allocation?.operator_id || first(allocation?.operators)?.full_name)
  );
  const supplierCostExpected = supplierLinks.some((supplier) =>
    Boolean(
      supplier.supplier_id ||
        supplier.supplier_display_name ||
        supplier.supplier_reference ||
        supplier.service_description ||
        supplier.notes
    )
  );
  const supplierCostRecorded = Boolean(
    commercialCostSubtotal > 0 ||
      allocatedCostSubtotal > 0 ||
      primarySupplierCost > 0 ||
      supplierLinks.some((supplier) => numberFromText(supplier.supplier_cost) > 0)
  );
  const chargeLines = commercialLines.filter((line) => line.line_type !== "cost");
  const costLines = commercialLines.filter((line) => line.line_type === "cost");
  const operatorActivityValues = [
    (job as any).operator_sign_in_time,
    (job as any).operator_signed_in_at,
    (job as any).operator_signed_out_at,
    (job as any).job_started_at,
    (job as any).job_completed_at,
  ].filter(Boolean);
  const needsAttention = [
    !(job as any)?.invoice_status || String((job as any)?.invoice_status).toLowerCase() === "not invoiced" ? "Not invoiced" : null,
    commercialLines.length === 0 ? "Commercial breakdown missing" : null,
    supplierCostExpected && !supplierCostRecorded ? "Supplier/cost amount missing for linked supplier" : null,
    cranesAllocated.length === 0 ? "No crane allocated" : null,
    !noOperatorRequired && !operatorAllocated ? "No operator allocated" : null,
  ].filter(Boolean) as string[];

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 100%)", maxWidth: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={pageHeader}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>
              Job {(job as any)?.job_number ? `#${(job as any).job_number}` : ""}
            </h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Manage live job details, allocations and supplier costs.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <PreviousPageBackButton fallbackHref="/jobs" label="← Back" style={secondaryBtn} />
            <a href={`/jobs/${params.id}/edit`} style={secondaryBtn}>
              Edit job
            </a>
            <a href={`/jobs/${params.id}/lift-plan`} style={secondaryBtn}>
              Lift plan / RAMS
            </a>
            <DuplicateJobButton jobId={params.id} />
            {![("cancelled"), ("late_cancelled"), ("provisional")].includes(
              String((job as any)?.status ?? "").toLowerCase()
            ) ? (
              <>
                <form action={`/api/jobs/${params.id}/cancel`} method="POST">
                  <input type="hidden" name="cancel_mode" value="provisional" />
                  <ServerSubmitButton style={secondaryBtn} pendingText="Working…">
                    Mark provisional
                  </ServerSubmitButton>
                </form>

                <form action={`/api/jobs/${params.id}/cancel`} method="POST">
                  <input type="hidden" name="cancel_mode" value="late_cancelled" />
                  <ServerSubmitButton style={cancelBtn} pendingText="Working…">
                    Late cancel
                  </ServerSubmitButton>
                </form>
              </>
            ) : null}
          </div>
        </div>

        {jobError ? <div style={errorBox}>{jobError.message}</div> : null}
        {searchErrorMessage ? <div style={errorBox}>{searchErrorMessage}</div> : null}
        {successMessage ? <div style={successBox}>{successMessage}</div> : null}
        {!job ? <div style={errorBox}>Job not found.</div> : null}

        {job ? (
          <div style={layoutGrid}>
            <div style={{ display: "grid", gap: 18 }}>
              <section style={cardStyle}>
                <h2 style={sectionTitle}>Job Summary</h2>

                <div style={summaryGrid}>
                  <Row label="Job #" value={(job as any).job_number ?? "—"} />
                  <Row
                    label="Status"
                    value={
                      <span
                        style={{
                          display: "inline-block",
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 900,
                          ...statusPillStyle((job as any).status),
                        }}
                      >
                        {(job as any).status ?? "—"}
                      </span>
                    }
                  />
                  <Row label="Job start date" value={fmtDate((job as any).start_date ?? (job as any).job_date)} />
                  <Row label="Job end date" value={fmtDate((job as any).end_date ?? (job as any).job_date)} />
                  <Row label="Start time" value={(job as any).start_time ?? "—"} />
                  <Row label="End time" value={(job as any).end_time ?? "—"} />
                  <Row label="Site" value={(job as any).site_name ?? "—"} />
                  <Row label="Address" value={(job as any).site_address ?? "—"} />
                  <Row label="Created" value={fmtDateTime((job as any).created_at)} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Allocated Assets Summary</h2>

                <div style={summaryGrid}>
                  <Row label="Cranes" value={cranesAllocated.length} />
                  <Row label="Vehicles" value={vehiclesAllocated.length} />
                  <Row label="Lifting equipment" value={equipmentAllocated.length} />
                  <Row label="Labour / Other" value={otherAllocated.length} />
                  <Row label="Allocated sell" value={money(allocatedSellSubtotal)} />
                  <Row label="Allocated cost" value={money(allocatedCostSubtotal)} />
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                  <AssetListBlock
                    title="Cranes"
                    items={cranesAllocated.map((item) => ({
                      name: allocatedAssetName(item),
                      meta: allocationMeta(item, "crane"),
                    }))}
                  />

                  <AssetListBlock
                    title="Vehicles"
                    items={vehiclesAllocated.map((item) => ({
                      name: allocatedAssetName(item),
                      meta: allocationMeta(item, "vehicle"),
                    }))}
                  />

                  <AssetListBlock
                    title="Lifting Equipment"
                    items={equipmentAllocated.map((item) => ({
                      name: allocatedAssetName(item),
                      meta: allocationMeta(item, "equipment"),
                    }))}
                  />

                  <AssetListBlock
                    title="Labour / Other"
                    items={otherAllocated.map((item) => ({
                      name: allocatedAssetName(item),
                      meta: allocationMeta(item, "other"),
                    }))}
                  />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Customer</h2>

                <div style={summaryGrid}>
                  <Row label="Company" value={client?.company_name ?? "—"} />
                  <Row label="Contact" value={client?.contact_name ?? "—"} />
                  <Row label="Phone" value={client?.phone ?? "—"} />
                  <Row label="Email" value={client?.email ?? "—"} />
                </div>
              </section>

              <section style={cardStyle}>
                <form action={updateJobSuppliers} style={{ display: "grid", gap: 12 }}>
                  <input type="hidden" name="job_id" value={(job as any).id} />
                  <MultiSupplierFields
                    title="Suppliers / subcontractors"
                    help="Add all crane suppliers, cross-hires, subcontractors, labour, mats or transport support linked to this job. The main supplier keeps legacy PO/planner logic working."
                    initialLinks={supplierLinks}
                    supplierOptions={((supplierList as any[]) ?? []).map((supplier: any) => ({
                      value: supplier.id,
                      label: supplier.company_name ?? "Supplier",
                      category: supplier.category ?? "",
                    }))}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <ServerSubmitButton style={primaryBtn} pendingText="Saving suppliers…">
                      Save suppliers
                    </ServerSubmitButton>
                  </div>
                </form>
              </section>

              <JobEquipmentManager
                jobId={(job as any).id}
                initialAllocations={allocationList}
                craneOptions={((craneList as any[]) ?? []).map((c: any) => ({
                  value: c.id,
                  label: `${c.name ?? "Crane"}${c.reg_number ? ` (${c.reg_number})` : ""}${c.capacity ? ` • ${c.capacity}` : ""}`,
                }))}
                vehicleOptions={((vehicleList as any[]) ?? []).map((v: any) => ({
                  value: v.id,
                  label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
                }))}
                equipmentOptions={((equipmentList as any[]) ?? []).map((e: any) => ({
                  value: e.id,
                  label: `${e.name ?? "Equipment"}${e.asset_number ? ` (${e.asset_number})` : ""}`,
                }))}
                operatorOptions={((operatorList as any[]) ?? []).map((o: any) => ({
                  value: o.id,
                  label: o.full_name ?? "Operator",
                }))}
                supplierOptions={((supplierList as any[]) ?? []).map((s: any) => ({
                  value: s.id,
                  label: s.company_name ?? "Supplier",
                  category: s.category ?? "",
                }))}
                purchaseOrderOptions={((poList as any[]) ?? []).map((p: any) => ({
                  value: p.id,
                  label: `${p.po_number ?? "PO"}${p.status ? ` • ${p.status}` : ""}`,
                }))}
                defaultDate={(job as any).start_date ?? (job as any).job_date}
                defaultStartTime={(job as any).start_time}
                defaultEndTime={(job as any).end_time}
              />

              <section style={cardStyle}>
                <div style={sectionHeaderRow}>
                  <h2 style={sectionTitle}>Job Documents</h2>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  <DocumentUploadForm jobId={(job as any).id} />

                  {documents.length === 0 ? (
                    <div style={listEmptyStyle}>No documents uploaded yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {documents.map((doc: any) => (
                        <div key={doc.id} style={listItemStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 900, wordBreak: "break-word" }}>{doc.file_name ?? "Document"}</div>
                              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                                {documentTypeLabel(doc.document_type)} • {fmtDateTime(doc.created_at)}
                                {doc.share_with_operator ? " • Shared with operator" : ""}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <a
                                href={documentHref(doc.file_path)}
                                target="_blank"
                                rel="noreferrer"
                                style={secondaryBtn}
                              >
                                Open
                              </a>
                              <DocumentDeleteButton jobId={(job as any).id} documentId={doc.id} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section style={cardStyle}>
                <div style={sectionHeaderRow}>
                  <h2 style={sectionTitle}>Purchase Orders</h2>
                  <a
                    href={`/purchase-orders/new?job_id=${params.id}${(job as any)?.supplier_id ? `&supplier_id=${(job as any).supplier_id}` : ""}`}
                    style={secondaryBtn}
                  >
                    Open full PO editor
                  </a>
                </div>

                <form action={createPurchaseOrderFromJob} style={{ display: "grid", gap: 12 }}>
                  <input type="hidden" name="job_id" value={params.id} />

                  <div style={summaryGrid}>
                    <div>
                      <label style={rowLabel}>Supplier</label>
                      <select name="supplier_id" defaultValue={(job as any)?.supplier_id ?? ""} style={inputStyle}>
                        <option value="">No supplier selected</option>
                        {((supplierList as any[]) ?? []).map((supplier: any) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.company_name ?? "Supplier"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={rowLabel}>Status</label>
                      <select name="status" defaultValue="draft" style={inputStyle}>
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="approved">Approved</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div>
                      <label style={rowLabel}>Order date</label>
                      <input
                        name="order_date"
                        type="date"
                        defaultValue={new Date().toISOString().slice(0, 10)}
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={rowLabel}>Required date</label>
                      <input name="required_date" type="date" style={inputStyle} />
                    </div>

                    <div>
                      <label style={rowLabel}>Supplier reference</label>
                      <input
                        name="supplier_reference"
                        defaultValue={primarySupplierReference ?? ""}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={rowLabel}>Notes</label>
                    <textarea
                      name="notes"
                      rows={3}
                      defaultValue={`Created from job ${(job as any)?.job_number ? `#${(job as any).job_number}` : ""}${(job as any)?.site_name ? ` • ${(job as any).site_name}` : ""}`}
                      style={textareaStyle}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <ServerSubmitButton style={primaryBtn} pendingText="Working…">
                      Create purchase order
                    </ServerSubmitButton>
                  </div>
                </form>

                <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                  {linkedPurchaseOrders.length === 0 ? (
                    <div style={listEmptyStyle}>No purchase orders linked to this job yet.</div>
                  ) : (
                    linkedPurchaseOrders.map((po: any) => {
                      const poSupplier = first(po.suppliers);
                      return (
                        <div key={po.id} style={listItemStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontWeight: 900 }}>{po.po_number ?? "Purchase order"}</div>
                              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                                {po.status ?? "draft"}
                                {poSupplier?.company_name ? ` • ${poSupplier.company_name}` : ""}
                                {po.order_date ? ` • Ordered ${fmtDate(po.order_date)}` : ""}
                                {po.required_date ? ` • Required ${fmtDate(po.required_date)}` : ""}
                              </div>
                              {po.supplier_reference || po.notes ? (
                                <div style={{ marginTop: 8, fontSize: 13, opacity: 0.82 }}>
                                  {[po.supplier_reference ? `Ref: ${po.supplier_reference}` : "", po.notes ?? ""]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                              ) : null}
                            </div>

                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 900 }}>{money(po.total_cost ?? 0)}</div>
                              <a href={`/purchase-orders/${po.id}`} style={secondaryBtn}>
                                Open PO
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>

            <div style={{ display: "grid", gap: 18 }}>
              <section style={{ ...cardStyle, border: needsAttention.length > 0 ? "1px solid rgba(245,158,11,0.45)" : cardStyle.border }}>
                <h2 style={sectionTitle}>Needs attention</h2>
                {needsAttention.length === 0 ? (
                  <div style={listEmptyStyle}>No obvious commercial, supplier or allocation issues found.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {needsAttention.map((item) => (
                      <div key={item} style={warningLineStyle}>• {item}</div>
                    ))}
                  </div>
                )}
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Commercial breakdown</h2>

                <div style={commercialTotalsGrid}>
                  <Row label="Customer charge subtotal" value={money(commercialSellSubtotal)} />
                  <Row label="Supplier / cost total" value={money(commercialCostSubtotal)} />
                  <Row label="Estimated gross profit" value={money(estimatedGrossProfit)} />
                  <Row label="Estimated margin" value={`${estimatedMargin.toFixed(1)}%`} />
                  <Row label="VAT" value={money(commercialVat)} />
                  <Row label="Invoice total" value={money(commercialInvoiceTotal)} />
                  <Row label="Amount paid" value={money(amountPaid)} />
                  <Row label="Outstanding" value={money(outstandingBalance)} />
                  <Row label="Invoice status" value={(job as any).invoice_status ?? "Not Invoiced"} />
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                  <div>
                    <div style={{ ...rowLabel, marginBottom: 8 }}>Customer charges</div>
                    {chargeLines.length === 0 ? (
                      <div style={listEmptyStyle}>No customer charge lines entered yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {chargeLines.map((line, index) => (
                          <div key={`${line.id}-charge-${index}`} style={breakdownLineStyle}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 900 }}>{line.item || "Customer charge"}</div>
                                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78, whiteSpace: "pre-wrap" }}>
                                  {[line.description, dateRangeText(line.date_from, line.date_to), line.quantity ? `Qty ${line.quantity}` : "", line.rate ? `Rate ${line.rate}` : ""]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                                {line.notes ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>{line.notes}</div> : null}
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={sellBadgeStyle}>Charge</div>
                                <div style={{ marginTop: 6, fontWeight: 900 }}>{money(line.amount)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ ...rowLabel, marginBottom: 8 }}>Supplier / cost lines</div>
                    {costLines.length === 0 ? (
                      <div style={listEmptyStyle}>No supplier or subcontractor cost lines entered. This is fine if there is no external cost for this job.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {costLines.map((line, index) => (
                          <div key={`${line.id}-cost-${index}`} style={breakdownLineStyle}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 900 }}>{line.item || "Supplier / cost"}</div>
                                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78, whiteSpace: "pre-wrap" }}>
                                  {[line.description, dateRangeText(line.date_from, line.date_to), line.quantity ? `Qty ${line.quantity}` : "", line.rate ? `Rate ${line.rate}` : ""]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                                {line.notes ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>{line.notes}</div> : null}
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={costBadgeStyle}>Cost</div>
                                <div style={{ marginTop: 6, fontWeight: 900 }}>{money(line.amount)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <details style={{ marginTop: 14 }}>
                  <summary style={detailsSummary}>Edit commercial breakdown</summary>
                  <form action={updateJobCommercialBreakdown} style={{ marginTop: 12, display: "grid", gap: 12 }}>
                    <input type="hidden" name="job_id" value={(job as any).id} />
                    <div style={helperTextBox}>
                      Existing lines are shown first. Use the single blank row at the bottom only when you need to add another charge/cost. Example: Jekko charged 07/04/2026 to 07/04/2026 £850, AK46 charged 08/04/2026 to 09/04/2026 £1,700, mats cost £250. Charge lines build the invoice subtotal. Cost lines build the estimated margin/cost total.
                    </div>
                    {makeEditableCommercialRows(commercialLines).map((line, index) => (
                      <div key={`commercial-edit-${index}`} style={editableLineCard}>
                        <input type="hidden" name={`commercial_id_${index}`} defaultValue={line.id} />
                        <div style={editableLineGrid}>
                          <div>
                            <label style={rowLabel}>Type</label>
                            <select name={`commercial_line_type_${index}`} defaultValue={line.line_type} style={inputStyle}>
                              <option value="sell">Customer charge</option>
                              <option value="cost">Supplier / cost</option>
                            </select>
                          </div>
                          <div>
                            <label style={rowLabel}>Item / what it is for</label>
                            <input name={`commercial_item_${index}`} defaultValue={line.item} placeholder="Jekko / AK46 / mats / operator" style={inputStyle} />
                          </div>
                          <div>
                            <label style={rowLabel}>From</label>
                            <input name={`commercial_date_from_${index}`} type="date" defaultValue={line.date_from} style={inputStyle} />
                          </div>
                          <div>
                            <label style={rowLabel}>To</label>
                            <input name={`commercial_date_to_${index}`} type="date" defaultValue={line.date_to} style={inputStyle} />
                          </div>
                          <div>
                            <label style={rowLabel}>Qty / days / hours</label>
                            <input name={`commercial_quantity_${index}`} defaultValue={line.quantity} placeholder="1 day / 8 hours" style={inputStyle} />
                          </div>
                          <div>
                            <label style={rowLabel}>Rate</label>
                            <input name={`commercial_rate_${index}`} defaultValue={line.rate} placeholder="£850/day" style={inputStyle} />
                          </div>
                          <div>
                            <label style={rowLabel}>Amount</label>
                            <input name={`commercial_amount_${index}`} type="number" step="0.01" defaultValue={line.amount ? String(line.amount) : ""} style={inputStyle} />
                          </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <label style={rowLabel}>Description / notes</label>
                          <textarea name={`commercial_description_${index}`} rows={2} defaultValue={line.description} style={textareaStyle} placeholder="Full explanation of this charge or cost" />
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <label style={rowLabel}>Internal note</label>
                          <input name={`commercial_notes_${index}`} defaultValue={line.notes} style={inputStyle} />
                        </div>
                      </div>
                    ))}
                    <ServerSubmitButton style={primaryBtn} pendingText="Saving breakdown…">
                      Save commercial breakdown
                    </ServerSubmitButton>
                  </form>
                </details>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Suppliers / subcontractors breakdown</h2>
                <div style={{ display: "grid", gap: 10 }}>
                  {supplierLinks.length === 0 ? (
                    <div style={listEmptyStyle}>No suppliers linked to this job.</div>
                  ) : (
                    supplierLinks.map((supplier, index) => (
                      <div key={`${supplier.supplier_id ?? supplier.supplier_display_name ?? "supplier"}-${index}`} style={listItemStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 900 }}>
                              {supplier.supplier_display_name || "Supplier"} {supplier.is_primary ? "• Primary" : ""}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                              {[supplier.supplier_category, supplier.service_description, supplier.supplier_reference ? `Ref ${supplier.supplier_reference}` : ""]
                                .filter(Boolean)
                                .join(" • ") || "No service details entered."}
                            </div>
                            {supplier.notes ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>{supplier.notes}</div> : null}
                          </div>
                          <div style={{ fontWeight: 900 }}>{money(supplier.supplier_cost ?? 0)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Crane and staff allocation</h2>
                <form action={updateJobRequirementFlags} style={{ marginBottom: 12, display: "grid", gap: 10 }}>
                  <input type="hidden" name="job_id" value={(job as any).id} />
                  <label style={{ ...listItemStyle, display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" name="no_operator_required" defaultChecked={noOperatorRequired} style={{ marginTop: 3 }} />
                    <span>
                      <strong>No operator required</strong>
                      <span style={{ display: "block", marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                        Tick this where AnnS is not supplying an operator or no operator needs allocating in the CRM.
                      </span>
                    </span>
                  </label>
                  <div>
                    <ServerSubmitButton style={secondaryBtn} pendingText="Saving…">
                      Save allocation requirement
                    </ServerSubmitButton>
                  </div>
                </form>
                <div style={{ display: "grid", gap: 10 }}>
                  {allocationList.length === 0 ? (
                    <div style={listEmptyStyle}>No crane, vehicle, equipment or labour allocated yet.</div>
                  ) : (
                    allocationList.map((item, index) => (
                      <div key={item.id ?? index} style={listItemStyle}>
                        <div style={{ fontWeight: 900 }}>{allocatedAssetName(item)}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>{allocationMeta(item, item.asset_type ?? "allocation")}</div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Operational activity / paperwork</h2>
                {operatorActivityValues.length === 0 && documents.length === 0 ? (
                  <div style={listEmptyStyle}>No operator activity or uploaded paperwork recorded yet.</div>
                ) : (
                  <div style={summaryGrid}>
                    <Row label="Booked on" value={fmtDate((job as any).booked_date ?? (job as any).start_date)} />
                    {(job as any).operator_sign_in_time || (job as any).operator_signed_in_at ? (
                      <Row label="Operator sign in" value={fmtDateTime((job as any).operator_sign_in_time ?? (job as any).operator_signed_in_at)} />
                    ) : null}
                    {(job as any).operator_signed_out_at ? <Row label="Operator sign out" value={fmtDateTime((job as any).operator_signed_out_at)} /> : null}
                    <Row label="Documents" value={documents.length} />
                    <Row label="Lift plan" value={(job as any).lift_plan_status ?? "Check lift plan page"} />
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.72 }}>
                  Timesheet-style hours and break deductions are hidden here until you start using CRM timesheets.
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Notes</h2>
                <div style={noteBox}>{(job as any).notes ?? "No notes added."}</div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </ClientShell>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={rowStyle}>
      <div style={rowLabel}>{label}</div>
      <div style={rowValue}>{value}</div>
    </div>
  );
}

function AssetListBlock({
  title,
  items,
}: {
  title: string;
  items: Array<{ name: string; meta: string }>;
}) {
  return (
    <div>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>
      {items.length === 0 ? (
        <div style={listEmptyStyle}>None allocated.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item, index) => (
            <div key={`${title}-${index}`} style={listItemStyle}>
              <div style={{ fontWeight: 800 }}>{item.name}</div>
              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>{item.meta}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const pageHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 18,
};

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 18,
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.38)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  backdropFilter: "blur(6px)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 20,
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const rowStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const rowLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.7,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginBottom: 6,
};

const rowValue: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const noteBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.06)",
  whiteSpace: "pre-wrap",
};

const listEmptyStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px dashed rgba(0,0,0,0.10)",
  opacity: 0.75,
};

const listItemStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const cancelBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#ef4444",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const successBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(16,185,129,0.12)",
  border: "1px solid rgba(16,185,129,0.24)",
};

const sectionHeaderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
  resize: "vertical",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
};

const warningLineStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(245,158,11,0.14)",
  border: "1px solid rgba(245,158,11,0.24)",
  fontWeight: 800,
};

const commercialTotalsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
};

const breakdownLineStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.74)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const sellBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  background: "rgba(16,185,129,0.12)",
  border: "1px solid rgba(16,185,129,0.24)",
  color: "#047857",
};

const costBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  background: "rgba(245,158,11,0.14)",
  border: "1px solid rgba(245,158,11,0.24)",
  color: "#92400e",
};

const helperTextBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(59,130,246,0.10)",
  border: "1px solid rgba(59,130,246,0.18)",
  fontSize: 13,
  lineHeight: 1.5,
};

const editableLineCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.70)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const editableLineGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const detailsSummary: React.CSSProperties = {
  cursor: "pointer",
  fontWeight: 900,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  border: "1px solid rgba(0,0,0,0.08)",
};
