import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import JobEquipmentManager from "./JobEquipmentManager";

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB");
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function money(value: number | null | undefined) {
  const n = Number(value ?? null);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function statusPillStyle(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (["confirmed", "in progress", "in_progress", "active"].includes(s)) {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (["planned", "draft", "pending"].includes(s)) {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  if (["cancelled", "canceled"].includes(s)) {
    return {
      background: "rgba(255,0,0,0.10)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.20)",
    };
  }

  return {
    background: "rgba(255,255,255,0.45)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
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

function allocatedAssetName(item: any) {
  const type = String(item.asset_type ?? "equipment").toLowerCase();
  if (type === "crane") return item.cranes?.name ?? item.item_name ?? "Crane";
  if (type === "vehicle") return item.vehicles?.name ?? item.item_name ?? "Vehicle";
  return item.equipment?.name ?? item.item_name ?? "Equipment";
}

export default async function JobPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: job, error: jobError },
    { data: allocations },
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
        bookings:booking_id (
          id,
          location,
          site_address,
          start_date,
          end_date,
          start_at,
          end_at,
          status,
          cranes:crane_id (
            id,
            name,
            reg_number,
            fleet_number,
            capacity,
            status
          )
        )
      `)
      .eq("id", params.id)
      .single(),

    supabase
      .from("job_equipment")
      .select(`
        *,
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
        ),
        purchase_orders:purchase_order_id (
          id,
          po_number,
          status
        )
      `)
      .eq("job_id", params.id)
      .order("created_at", { ascending: true }),

    supabase
      .from("cranes")
      .select("id, name, reg_number, capacity, status, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("vehicles")
      .select("id, name, reg_number")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("equipment")
      .select("id, name, asset_number")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("operators")
      .select("id, full_name")
      .eq("archived", false)
      .order("full_name", { ascending: true }),

    supabase
      .from("suppliers")
      .select("id, company_name")
      .order("company_name", { ascending: true }),

    supabase
      .from("purchase_orders")
      .select("id, po_number, status")
      .order("created_at", { ascending: false }),
  ]);

  const client = first((job as any)?.clients);
  const linkedBooking = first((job as any)?.bookings);
  const linkedCrane = first((linkedBooking as any)?.cranes);
  const allocationList = (allocations as any[]) ?? [];

  const cranesAllocated = allocationList.filter((a) => a.asset_type === "crane");
  const vehiclesAllocated = allocationList.filter((a) => a.asset_type === "vehicle");
  const equipmentAllocated = allocationList.filter(
    (a) => String(a.asset_type ?? "equipment") === "equipment"
  );

  const allocatedSubtotal = allocationList.reduce(
    (sum, item) => sum + Number(item.agreed_cost ?? 0),
    0
  );
  const allocatedVat = 0;
  const allocatedTotal = allocatedSubtotal + allocatedVat;

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
        <div style={pageHeader}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>
              Job {job?.job_number ? `#${job.job_number}` : ""}
            </h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Manage live job details, allocations and activity.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/jobs" style={secondaryBtn}>
              ← Back to jobs
            </a>
            {job?.booking_id ? (
              <a href={`/bookings/${job.booking_id}`} style={secondaryBtn}>
                Open booking
              </a>
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
                  <Row label="Job #" value={job.job_number ?? "—"} />
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
                          ...statusPillStyle(job.status),
                        }}
                      >
                        {job.status ?? "—"}
                      </span>
                    }
                  />
                  <Row label="Job date" value={fmtDate(job.job_date)} />
                  <Row label="Start time" value={job.start_time ?? "—"} />
                  <Row label="End time" value={job.end_time ?? "—"} />
                  <Row label="Site" value={job.site_name ?? linkedBooking?.location ?? "—"} />
                  <Row label="Address" value={job.site_address ?? linkedBooking?.site_address ?? "—"} />
                  <Row label="Created" value={fmtDateTime(job.created_at)} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Allocated Assets Summary</h2>

                <div style={summaryGrid}>
                  <Row label="Cranes" value={cranesAllocated.length} />
                  <Row label="Vehicles" value={vehiclesAllocated.length} />
                  <Row label="Lifting equipment" value={equipmentAllocated.length} />
                  <Row label="Allocated cost" value={money(allocatedSubtotal)} />
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                  <AssetListBlock
                    title="Cranes"
                    items={cranesAllocated.map((item) => ({
                      name: allocatedAssetName(item),
                      meta: `${item.cranes?.reg_number ?? "—"}${item.cranes?.capacity ? ` • ${item.cranes.capacity}` : ""}${item.operators?.full_name ? ` • ${item.operators.full_name}` : ""}${Number(item.agreed_cost ?? 0) ? ` • ${money(item.agreed_cost)}` : ""}`,
                    }))}
                  />

                  <AssetListBlock
                    title="Vehicles"
                    items={vehiclesAllocated.map((item) => ({
                      name: allocatedAssetName(item),
                      meta: `${item.vehicles?.reg_number ?? "—"}${item.operators?.full_name ? ` • ${item.operators.full_name}` : ""}${Number(item.agreed_cost ?? 0) ? ` • ${money(item.agreed_cost)}` : ""}`,
                    }))}
                  />

                  <AssetListBlock
                    title="Lifting Equipment"
                    items={equipmentAllocated.map((item) => ({
                      name: allocatedAssetName(item),
                      meta: `${item.equipment?.asset_number ?? "—"}${item.operators?.full_name ? ` • ${item.operators.full_name}` : ""}${Number(item.agreed_cost ?? 0) ? ` • ${money(item.agreed_cost)}` : ""}`,
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
                jobId={job.id}
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
                }))}
                purchaseOrderOptions={((poList as any[]) ?? []).map((p: any) => ({
                  value: p.id,
                  label: `${p.po_number ?? "PO"}${p.status ? ` • ${p.status}` : ""}`,
                }))}
                defaultDate={job.job_date}
                defaultStartTime={job.start_time}
                defaultEndTime={job.end_time}
              />
            </div>

            <div style={{ display: "grid", gap: 18 }}>
              <section style={cardStyle}>
                <h2 style={sectionTitle}>Linked Booking</h2>

                <div style={summaryGrid}>
                  <Row label="Booking ID" value={linkedBooking?.id ?? "—"} />
                  <Row label="Booking status" value={linkedBooking?.status ?? "—"} />
                  <Row label="Start date" value={fmtDate(linkedBooking?.start_date)} />
                  <Row label="End date" value={fmtDate(linkedBooking?.end_date)} />
                  <Row label="Start time" value={fmtDateTime(linkedBooking?.start_at)} />
                  <Row label="End time" value={fmtDateTime(linkedBooking?.end_at)} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Primary Crane From Booking</h2>

                <div style={summaryGrid}>
                  <Row label="Crane" value={linkedCrane?.name ?? "—"} />
                  <Row label="Registration" value={linkedCrane?.reg_number ?? "—"} />
                  <Row label="Fleet" value={linkedCrane?.fleet_number ?? "—"} />
                  <Row label="Capacity" value={linkedCrane?.capacity ?? "—"} />
                  <Row label="Status" value={linkedCrane?.status ?? "—"} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Legacy primary operator</h2>

                <div style={summaryGrid}>
                  <Row label="Operator" value={job.operator_name ?? "—"} />
                  <Row label="Phone" value={job.operator_phone ?? "—"} />
                  <Row label="Email" value={job.operator_email ?? "—"} />
                  <Row label="Status" value={job.operator_status ?? "—"} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Operator Activity</h2>

                <div style={summaryGrid}>
                  <Row label="Started" value={fmtDateTime(job.started_at)} />
                  <Row label="Arrived on site" value={fmtDateTime(job.arrived_on_site_at)} />
                  <Row label="Lift completed" value={fmtDateTime(job.lift_completed_at)} />
                  <Row label="Job completed" value={fmtDateTime(job.completed_at)} />
                  <Row label="Worked time" value={job.worked_time ?? "—"} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Invoice Status</h2>

                <div style={summaryGrid}>
                  <Row label="Invoice status" value={job.invoice_status ?? "Not Invoiced"} />
                  <Row label="Invoice #" value={job.invoice_number ?? "—"} />
                  <Row label="Invoice created" value={fmtDate(job.invoice_created_at)} />
                  <Row label="Invoice due" value={fmtDate(job.invoice_due_at)} />
                  <Row label="Allocated subtotal" value={money(allocatedSubtotal)} />
                  <Row label="VAT" value={money(allocatedVat)} />
                  <Row label="Allocated total" value={money(allocatedTotal)} />
                  <Row label="Invoice notes" value={job.invoice_notes ?? "—"} />
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
  gridTemplateColumns: "1.05fr 0.95fr",
  gap: 18,
  alignItems: "start",
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
  gap: 2,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: "10px 0",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

const rowLabel: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.72,
  minWidth: 140,
};

const rowValue: React.CSSProperties = {
  fontWeight: 800,
  textAlign: "right",
};

const listItemStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.48)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const listEmptyStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.40)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  textDecoration: "none",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
