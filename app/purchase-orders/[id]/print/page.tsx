import { createSupabaseServerClient } from "../../../lib/supabase/server";
import PrintPOActions from "./PrintPOActions";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

export default async function PurchaseOrderPrintPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: po }, { data: lines }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(`
        *,
        suppliers:supplier_id (
          company_name
        ),
        jobs:job_id (
          job_number,
          site_name,
          site_address,
          job_date
        )
      `)
      .eq("id", params.id)
      .single(),

    supabase
      .from("purchase_order_lines")
      .select("*")
      .eq("purchase_order_id", params.id)
      .order("created_at", { ascending: true }),
  ]);

  const supplier = Array.isArray((po as any)?.suppliers)
    ? (po as any).suppliers[0]
    : (po as any)?.suppliers;

  const job = Array.isArray((po as any)?.jobs)
    ? (po as any).jobs[0]
    : (po as any)?.jobs;

  const total = Number((po as any)?.total_cost ?? 0);

  return (
    <html>
      <head>
        <title>Purchase Order {(po as any)?.po_number ?? ""}</title>
      </head>
      <body style={bodyStyle}>
        <div style={pageStyle}>
          <div style={topBarStyle}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 1000 }}>PURCHASE ORDER</div>
              <div style={{ marginTop: 6, opacity: 0.75 }}>
                {(po as any)?.po_number ?? "—"}
              </div>
            </div>

            <PrintPOActions backHref={`/purchase-orders/${params.id}`} />
          </div>

          <div style={helpBox}>
            Use <strong>Print / Save PDF</strong>, then choose <strong>Save as PDF</strong> in the browser print window.
          </div>

          <div style={companyBox}>
            <div style={{ fontWeight: 1000, fontSize: 22 }}>Ann’s Crane Hire</div>
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              Supplier order document for cross-hire cranes and equipment.
            </div>
          </div>

          <div style={gridStyle}>
            <section style={cardStyle}>
              <h2 style={sectionTitle}>Supplier</h2>
              <div><strong>Company:</strong> {supplier?.company_name ?? "—"}</div>
              <div><strong>Supplier ref:</strong> {(po as any)?.supplier_reference ?? "—"}</div>
              <div><strong>Status:</strong> {(po as any)?.status ?? "—"}</div>
            </section>

            <section style={cardStyle}>
              <h2 style={sectionTitle}>Order details</h2>
              <div><strong>Order date:</strong> {fmtDate((po as any)?.order_date)}</div>
              <div><strong>Required date:</strong> {fmtDate((po as any)?.required_date)}</div>
              <div><strong>Total:</strong> {fmtMoney((po as any)?.total_cost)}</div>
            </section>
          </div>

          <section style={{ ...cardStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Linked job</h2>
            <div><strong>Job number:</strong> {job?.job_number ?? "—"}</div>
            <div><strong>Site:</strong> {job?.site_name ?? "—"}</div>
            <div><strong>Address:</strong> {job?.site_address ?? "—"}</div>
            <div><strong>Job date:</strong> {fmtDate(job?.job_date)}</div>
          </section>

          <section style={{ ...cardStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Line items</h2>

            {!lines || lines.length === 0 ? (
              <div>No line items added.</div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Qty</th>
                    <th style={thStyle}>Unit Cost</th>
                    <th style={thStyle}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line: any) => (
                    <tr key={line.id}>
                      <td style={tdStyle}>{line.description ?? "—"}</td>
                      <td style={tdStyle}>{line.qty ?? 0}</td>
                      <td style={tdStyle}>{fmtMoney(line.unit_cost)}</td>
                      <td style={tdStyle}>{fmtMoney(line.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={totalStyle}>
              Total: {fmtMoney(total)}
            </div>
          </section>

          <section style={{ ...cardStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Notes</h2>
            <div style={{ whiteSpace: "pre-wrap" }}>
              {(po as any)?.notes ?? "—"}
            </div>
          </section>
        </div>
      </body>
    </html>
  );
}

const bodyStyle: React.CSSProperties = {
  margin: 0,
  background: "#f5f5f5",
  fontFamily: "Arial, sans-serif",
  color: "#111",
};

const pageStyle: React.CSSProperties = {
  width: "min(980px, 92vw)",
  margin: "20px auto",
  background: "#fff",
  padding: 28,
  boxSizing: "border-box",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const helpBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 10,
  background: "#f7f7f7",
  border: "1px solid #ddd",
};

const companyBox: React.CSSProperties = {
  marginTop: 18,
  padding: 16,
  border: "1px solid #ddd",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginTop: 16,
};

const cardStyle: React.CSSProperties = {
  padding: 16,
  border: "1px solid #ddd",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  fontSize: 20,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #ccc",
  padding: "10px 8px",
  fontSize: 13,
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "10px 8px",
  fontSize: 14,
};

const totalStyle: React.CSSProperties = {
  marginTop: 14,
  textAlign: "right",
  fontSize: 18,
  fontWeight: 900,
};
