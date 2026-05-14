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

type PrintablePOLine = {
  description?: string | null;
  qty?: string | number | null;
  unit_cost?: string | number | null;
  total_cost?: string | number | null;
};

function parsePdfLines(value: unknown): PrintablePOLine[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((line) => {
      const row = line as PrintablePOLine;
      const description = String(row.description ?? "").trim();
      if (!description) return null;

      const qty = row.qty === null || row.qty === undefined || row.qty === "" ? "1" : row.qty;
      const unitCost = row.unit_cost === null || row.unit_cost === undefined ? "" : row.unit_cost;
      const totalCost =
        row.total_cost === null || row.total_cost === undefined || row.total_cost === ""
          ? Number(qty || 0) * Number(unitCost || 0)
          : row.total_cost;

      return {
        description,
        qty,
        unit_cost: unitCost,
        total_cost: totalCost,
      };
    })
    .filter(Boolean) as PrintablePOLine[];
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
        ),
        transport_jobs:transport_job_id (
          transport_number,
          transport_date,
          delivery_date,
          collection_address,
          delivery_address,
          job_type
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

  const transportJob = Array.isArray((po as any)?.transport_jobs)
    ? (po as any).transport_jobs[0]
    : (po as any)?.transport_jobs;

  const linkedTitle = transportJob
    ? "Linked transport job"
    : job
      ? "Linked crane job"
      : "Linked job";

  const linkedReference = transportJob?.transport_number ?? job?.job_number ?? "—";
  const linkedSite = job?.site_name
    ?? (transportJob?.job_type === "on_site_hiab" ? "On-site HIAB" : transportJob ? "Transport job" : "—");
  const primaryAddress = job?.site_address ?? transportJob?.collection_address ?? "—";
  const secondaryAddress = transportJob?.delivery_address
    && transportJob.delivery_address !== transportJob.collection_address
      ? transportJob.delivery_address
      : null;
  const linkedDate = transportJob?.transport_date ?? transportJob?.delivery_date ?? job?.job_date ?? null;

  const rawPdfSections = (po as any)?.pdf_sections;
  const pdfSections =
    rawPdfSections && typeof rawPdfSections === "object" && !Array.isArray(rawPdfSections)
      ? (rawPdfSections as Record<string, unknown>)
      : {};

  const pdfText = (key: string, fallback: string | number | null | undefined = "") => {
    const value = pdfSections[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
    return String(fallback ?? "");
  };

  const poNumber = pdfText("poNumber", (po as any)?.po_number ?? "—");
  const supplierCompany = pdfText("supplierCompany", supplier?.company_name ?? "—");
  const supplierReference = pdfText("supplierReference", (po as any)?.supplier_reference ?? "—");
  const poStatus = pdfText("status", (po as any)?.status ?? "—");
  const orderDate = pdfText("orderDate", fmtDate((po as any)?.order_date));
  const requiredDate = pdfText("requiredDate", fmtDate((po as any)?.required_date));
  const displayLinkedTitle = pdfText("linkedTitle", linkedTitle);
  const displayLinkedReference = pdfText("linkedReference", linkedReference);
  const displayLinkedSite = pdfText("linkedSite", linkedSite);
  const displayPrimaryAddress = pdfText("primaryAddress", primaryAddress);
  const displaySecondaryAddress = pdfText("secondaryAddress", secondaryAddress ?? "");
  const displayLinkedDate = pdfText("linkedDate", fmtDate(linkedDate));
  const invoiceInstruction = pdfText(
    "invoiceInstruction",
    "All supplier invoices for this purchase order must be sent to invoicespayable@annscranehire.co.uk and must quote the purchase order number."
  );
  const displayNotes = pdfText("notes", (po as any)?.notes ?? "—");
  const pdfLines = parsePdfLines(pdfSections.lines);
  const printableLines = pdfLines.length > 0 ? pdfLines : ((lines ?? []) as PrintablePOLine[]);
  const total = pdfLines.length > 0
    ? printableLines.reduce((sum, line) => sum + Number(line.total_cost ?? 0), 0)
    : Number((po as any)?.total_cost ?? 0);
  const displayTotal = pdfText("total", fmtMoney(total));

  return (
    <html>
      <head>
        <title>Purchase Order {poNumber}</title>
        <style>{`
          @page {
            size: A4;
            margin: 0;
          }

          @media screen and (max-width: 760px) {
            body {
              background: #fff !important;
            }

            .po-print-page {
              width: 100% !important;
              margin: 0 !important;
              padding: 16px !important;
            }

            .po-print-table {
              display: block;
              width: 100%;
              overflow-x: auto;
              white-space: nowrap;
            }
          }

          @media print {
            html, body {
              width: 210mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .po-print-actions,
            .po-print-help {
              display: none !important;
            }

            .po-print-page {
              width: 190mm !important;
              max-width: 190mm !important;
              margin: 0 auto !important;
              padding: 0 !important;
              box-shadow: none !important;
              overflow: visible !important;
            }
          }
        `}</style>
      </head>
      <body style={bodyStyle}>
        <div style={pageStyle} className="po-print-page">
          <div style={topBarStyle}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 1000 }}>PURCHASE ORDER</div>
              <div style={{ marginTop: 6, opacity: 0.75 }}>
                {poNumber}
              </div>
            </div>

            <div className="po-print-actions">
              <PrintPOActions backHref={`/purchase-orders/${params.id}`} editHref={`/purchase-orders/${params.id}/print/edit`} />
            </div>
          </div>

          <div style={helpBox} className="po-print-help">
            Use <strong>Print / Save PDF</strong>, then choose <strong>Save as PDF</strong> in the browser print window.
          </div>

          <div style={companyBox}>
            <div style={{ fontWeight: 1000, fontSize: 22 }}>AnnS Crane Hire Ltd</div>
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              Supplier order document for cross-hire cranes, transport, equipment and labour.
            </div>
          </div>

          <section style={invoiceInstructionStyle}>
            <strong>Invoice instruction:</strong> {invoiceInstruction}
          </section>

          <div style={gridStyle}>
            <section style={cardStyle}>
              <h2 style={sectionTitle}>Supplier</h2>
              <div><strong>Company:</strong> {supplierCompany || "—"}</div>
              <div><strong>Supplier ref:</strong> {supplierReference || "—"}</div>
              <div><strong>Status:</strong> {poStatus || "—"}</div>
            </section>

            <section style={cardStyle}>
              <h2 style={sectionTitle}>Order details</h2>
              <div><strong>Order date:</strong> {orderDate || "—"}</div>
              <div><strong>Required date:</strong> {requiredDate || "—"}</div>
              <div><strong>Total:</strong> {displayTotal || fmtMoney(total)}</div>
            </section>
          </div>

          <section style={{ ...cardStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>{displayLinkedTitle || linkedTitle}</h2>
            <div>
              <strong>{transportJob ? "Transport number" : "Job number"}:</strong> {displayLinkedReference || "—"}
            </div>
            <div><strong>Site:</strong> {displayLinkedSite || "—"}</div>
            <div><strong>Address:</strong> {displayPrimaryAddress || "—"}</div>
            {displaySecondaryAddress ? (
              <div><strong>Delivery address:</strong> {displaySecondaryAddress}</div>
            ) : null}
            <div><strong>Job date:</strong> {displayLinkedDate || "—"}</div>
          </section>

          <section style={{ ...cardStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Line items</h2>

            {!printableLines || printableLines.length === 0 ? (
              <div>No line items added.</div>
            ) : (
              <table className="po-print-table" style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Qty</th>
                    <th style={thStyle}>Unit Cost</th>
                    <th style={thStyle}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {printableLines.map((line: any, index: number) => (
                    <tr key={line.id ?? `${line.description}-${index}`}>
                      <td style={tdStyle}>{line.description ?? "—"}</td>
                      <td style={tdStyle}>{line.qty ?? 0}</td>
                      <td style={tdStyle}>{fmtMoney(line.unit_cost)}</td>
                      <td style={tdStyle}>{fmtMoney(line.total_cost ?? Number(line.qty ?? 0) * Number(line.unit_cost ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={totalStyle}>
              Total: {displayTotal || fmtMoney(total)}
            </div>
          </section>

          <section style={{ ...cardStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Notes</h2>
            <div style={{ whiteSpace: "pre-wrap" }}>
              {displayNotes || "—"}
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
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 16,
  marginTop: 16,
};

const invoiceInstructionStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  border: "2px solid #111",
  background: "#fff",
  fontSize: 15,
  lineHeight: 1.45,
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
