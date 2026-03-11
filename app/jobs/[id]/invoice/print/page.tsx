import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import PrintInvoiceButton from "./PrintInvoiceButton";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function money(value: any) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

export default async function InvoicePrintPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: job }, { data: lines }] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        job_date,
        invoice_number,
        invoice_created_at,
        invoice_due_date,
        invoice_notes,
        invoice_subtotal,
        invoice_vat,
        invoice_total,
        site_name,
        site_address,
        clients:client_id (
          company_name,
          contact_name,
          email,
          phone
        )
      `)
      .eq("id", params.id)
      .single(),

    supabase
      .from("job_invoice_lines")
      .select("*")
      .eq("job_id", params.id)
      .order("created_at", { ascending: true }),
  ]);

  const client = Array.isArray((job as any)?.clients)
    ? (job as any).clients[0] ?? null
    : (job as any)?.clients ?? null;

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 24,
        color: "#111",
        background: "#fff",
        minHeight: "100vh",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
      }}
    >
      <style>{`
        @media print {
          .print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="print-hide"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0 }}>AnnS Crane Hire Invoice</h1>
        <PrintInvoiceButton />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        <section style={card}>
          <h2 style={sectionTitle}>Bill To</h2>
          <DetailRow label="Company" value={client?.company_name} />
          <DetailRow label="Contact" value={client?.contact_name} />
          <DetailRow label="Email" value={client?.email} />
          <DetailRow label="Phone" value={client?.phone} />
          <DetailRow label="Site" value={(job as any)?.site_name} />
          <DetailRow label="Address" value={(job as any)?.site_address} />
        </section>

        <section style={card}>
          <h2 style={sectionTitle}>Invoice Details</h2>
          <DetailRow label="Invoice #" value={(job as any)?.invoice_number} />
          <DetailRow label="Job #" value={(job as any)?.job_number} />
          <DetailRow label="Job date" value={fmtDate((job as any)?.job_date)} />
          <DetailRow label="Created" value={fmtDate((job as any)?.invoice_created_at)} />
          <DetailRow label="Due" value={fmtDate((job as any)?.invoice_due_date)} />
        </section>
      </div>

      <section style={card}>
        <h2 style={sectionTitle}>Invoice Lines</h2>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left" style={thStyle}>Description</th>
              <th align="left" style={thStyle}>Qty</th>
              <th align="left" style={thStyle}>Unit price</th>
              <th align="left" style={thStyle}>Line total</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} style={tdStyle}>No invoice lines found.</td>
              </tr>
            ) : (
              (lines ?? []).map((line: any) => (
                <tr key={line.id}>
                  <td style={tdStyle}>{line.description ?? "—"}</td>
                  <td style={tdStyle}>{line.qty ?? "—"}</td>
                  <td style={tdStyle}>{money(line.unit_price)}</td>
                  <td style={tdStyle}>{money(line.line_total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section style={card}>
        <h2 style={sectionTitle}>Totals</h2>
        <div style={{ maxWidth: 360, marginLeft: "auto" }}>
          <DetailRow label="Subtotal" value={money((job as any)?.invoice_subtotal)} />
          <DetailRow label="VAT" value={money((job as any)?.invoice_vat)} />
          <DetailRow label="Total" value={money((job as any)?.invoice_total)} />
        </div>
      </section>

      <section style={card}>
        <h2 style={sectionTitle}>Notes</h2>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {(job as any)?.invoice_notes || "—"}
        </div>
      </section>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ opacity: 0.72 }}>{label}</div>
      <div style={{ fontWeight: 800, textAlign: "right" }}>{value || "—"}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 12,
  padding: 16,
  breakInside: "avoid",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
};

const thStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid rgba(0,0,0,0.12)",
  fontSize: 12,
  opacity: 0.8,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
};
