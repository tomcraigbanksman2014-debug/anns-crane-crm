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
            <a href="/jobs" style={secondaryBtn}>
              ← Back to jobs
            </a>
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
              <section style={cardStyle}>
                <h2 style={sectionTitle}>Primary Supplier</h2>

                <div style={summaryGrid}>
                  <Row label="Supplier" value={linkedSupplier?.company_name ?? "—"} />
                  <Row label="Phone" value={linkedSupplier?.phone ?? "—"} />
                  <Row label="Email" value={linkedSupplier?.email ?? "—"} />
                  <Row label="Category" value={linkedSupplier?.category ?? "—"} />
                  <Row label="Reference" value={primarySupplierReference ?? "—"} />
                  <Row label="Supplier cost" value={money(primarySupplierCost)} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Legacy primary operator</h2>

                <div style={summaryGrid}>
                  <Row label="Operator" value={(job as any).operator_name ?? linkedOperator?.full_name ?? "—"} />
                  <Row label="Phone" value={(job as any).operator_phone ?? linkedOperator?.phone ?? "—"} />
                  <Row label="Email" value={(job as any).operator_email ?? linkedOperator?.email ?? "—"} />
                  <Row label="Status" value={(job as any).operator_status ?? linkedOperator?.status ?? "—"} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Operator Activity</h2>

                <div style={summaryGrid}>
                  <Row label="Booked on" value={fmtDate((job as any).booked_date ?? (job as any).start_date)} />
                  <Row label="Sign in" value={(job as any).operator_sign_in_time ?? "—"} />
                  <Row label="Break deduction" value={(job as any).break_duration ? `${(job as any).break_duration} mins` : "—"} />
                  <Row label="Hours worked" value={(job as any).hours_worked ?? "—"} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Commercial</h2>

                <div style={summaryGrid}>
                  <Row label="Quoted / agreed sell" value={money((job as any).price ?? allocatedSellSubtotal)} />
                  <Row label="Allocated sell subtotal" value={money(allocatedSellSubtotal)} />
                  <Row label="VAT" value={money(liveVat)} />
                  <Row label="Invoice total" value={money((job as any).total_invoice ?? allocatedTotal)} />
                  <Row label="Invoice status" value={(job as any).invoice_status ?? "Not Invoiced"} />
                  <Row label="Part paid amount" value={money((job as any).part_paid_amount ?? 0)} />
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
