import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import JobEquipmentManager from "../../components/JobEquipmentManager";

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

  if (s === "cancelled") {
    return {
      background: "rgba(255,0,0,0.10)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.18)",
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

export default async function JobDetailPage({
  params,
}: {
  params: { id: string };
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
            company_name
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
      .select("id, po_number, status")
      .order("created_at", { ascending: false }),
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

  const allocatedSellSubtotal = allocationList.reduce(
    (sum, item) => sum + Number(item?.agreed_sell_rate ?? 0),
    0
  );

  const allocatedCostSubtotal = allocationList.reduce(
    (sum, item) =>
      sum +
      Number(
        item?.supplier_cost ??
          item?.agreed_cost ??
          0
      ),
    0
  );

  const liveVat = Number((job as any)?.invoice_vat ?? 0);
  const allocatedTotal = allocatedSellSubtotal + liveVat;

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
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
            {String((job as any)?.status ?? "").toLowerCase() !== "cancelled" ? (
              <form action={`/api/jobs/${params.id}/cancel`} method="POST">
                <button type="submit" style={cancelBtn}>
                  Cancel job
                </button>
              </form>
            ) : null}
          </div>
        </div>

        {jobError ? <div style={errorBox}>{jobError.message}</div> : null}
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
                  <Row label="Other" value={otherAllocated.length} />
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
                    title="Other"
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
                  <Row label="Started" value={fmtDateTime((job as any).started_at)} />
                  <Row label="Arrived on site" value={fmtDateTime((job as any).arrived_on_site_at)} />
                  <Row label="Lift completed" value={fmtDateTime((job as any).lift_completed_at)} />
                  <Row label="Job completed" value={fmtDateTime((job as any).completed_at)} />
                  <Row label="Worked time" value={(job as any).worked_time ?? "—"} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Invoice Status</h2>

                <div style={summaryGrid}>
                  <Row label="Invoice status" value={(job as any).invoice_status ?? "Not Invoiced"} />
                  <Row label="Invoice #" value={(job as any).invoice_number ?? "—"} />
                  <Row label="Invoice created" value={fmtDate((job as any).invoice_created_at ?? (job as any).invoice_date)} />
                  <Row label="Invoice due" value={fmtDate((job as any).invoice_due_date)} />
                  <Row label="Allocated subtotal" value={money(allocatedSellSubtotal)} />
                  <Row label="VAT" value={money(liveVat)} />
                  <Row label="Allocated total" value={money(allocatedTotal)} />
                  <Row label="Invoice notes" value={(job as any).invoice_notes ?? "—"} />
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </ClientShell>
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
        <div style={listEmptyStyle}>None added.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((item, index) => (
            <div key={`${title}-${index}`} style={listItemStyle}>
              <div style={{ fontWeight: 800 }}>{item.name}</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.74 }}>{item.meta}</div>
            </div>
          ))}
        </div>
      )}
    </div>
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

const pageHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 18,
};

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr",
  gap: 18,
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const rowStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.36)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const rowLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.74,
  fontWeight: 800,
};

const rowValue: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 900,
  wordBreak: "break-word",
};

const listItemStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.36)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const listEmptyStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.28)",
  border: "1px dashed rgba(0,0,0,0.12)",
  opacity: 0.75,
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
