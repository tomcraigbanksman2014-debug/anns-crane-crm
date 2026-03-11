import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import PrintInvoiceButton from "./PrintInvoiceButton";

function fmtDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB");
}

function money(value: any) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function safeText(value: any) {
  return String(value ?? "").trim();
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
        contact_name,
        contact_phone,
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

  const invoiceDate = fmtDate((job as any)?.invoice_created_at);
  const dueDate = fmtDate((job as any)?.invoice_due_date);
  const reference = `Job ${(job as any)?.job_number ?? ""}`.trim();
  const vatRate = "20.00";
  const subtotal = Number((job as any)?.invoice_subtotal ?? 0);
  const vat = Number((job as any)?.invoice_vat ?? 0);
  const total = Number((job as any)?.invoice_total ?? 0);

  return (
    <div
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "28px 18px 40px",
        background: "#fff",
        color: "#111",
        minHeight: "100vh",
        fontFamily:
          "Arial, Helvetica, sans-serif",
      }}
    >
      <style>{`
        @media print {
          .print-hide {
            display: none !important;
          }

          body {
            background: #fff !important;
          }
        }
      `}</style>

      <div
        className="print-hide"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 24 }}>Invoice Preview</div>
        <PrintInvoiceButton />
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 24,
          }}
        >
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 0.2 }}>
              ANNS CRANE HIRE LTD
            </div>

            <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.25 }}>
              <div>6 Bay Street</div>
              <div>Swansea, SA1 8LB</div>
              <div>United Kingdom</div>

              <div style={{ height: 10 }} />

              <div>Telephone: 01792 641 653</div>
              <div>Mobile 01792 641653</div>
              <div>Email info@annscranehire.co.uk</div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <img
              src="/logo.png"
              alt="AnnS Crane Hire"
              style={{
                width: 230,
                maxWidth: "100%",
                height: "auto",
                objectFit: "contain",
                display: "block",
                marginLeft: "auto",
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 0.95fr",
            gap: 24,
            alignItems: "start",
            marginTop: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              Invoice To:
            </div>

            <div
              style={{
                minHeight: 170,
                border: "1px solid #b8b8b8",
                padding: 16,
                fontSize: 14,
                lineHeight: 1.35,
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {safeText(client?.company_name) || "—"}
              </div>
              {safeText(client?.contact_name) ? <div>{client?.contact_name}</div> : null}
              {safeText(client?.phone) ? <div>{client?.phone}</div> : null}
              {safeText(client?.email) ? <div>{client?.email}</div> : null}
              {safeText((job as any)?.site_address) ? (
                <>
                  <div style={{ height: 8 }} />
                  <div>{(job as any).site_address}</div>
                </>
              ) : null}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 900,
                textAlign: "center",
                marginBottom: 14,
              }}
            >
              SALES INVOICE
            </div>

            <div style={{ display: "grid", gap: 8, fontSize: 15 }}>
              <MetaRow label="Invoice Date" value={invoiceDate || "—"} />
              <MetaRow label="Due Date" value={dueDate || "—"} />
              <MetaRow label="Your VAT Number" value="GB 475188652" />
              <MetaRow label="Reference" value={reference || "—"} />
              <MetaRow label="Invoice Number" value={(job as any)?.invoice_number || "—"} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#efefef" }}>
                <th align="left" style={thStyleCode}>Code</th>
                <th align="left" style={thStyleDesc}>Description</th>
                <th align="right" style={thStyleNum}>Qty/Hrs</th>
                <th align="right" style={thStyleNum}>Price/Rate</th>
                <th align="right" style={thStyleNum}>VAT %</th>
                <th align="right" style={thStyleNum}>Net</th>
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, padding: "18px 10px" }}>
                    No invoice lines found.
                  </td>
                </tr>
              ) : (
                (lines ?? []).map((line: any, index: number) => (
                  <tr key={line.id ?? index}>
                    <td style={tdStyleCode}>
                      {index === 0 ? "CONTRACT\nLIFT" : "MATS"}
                    </td>
                    <td style={tdStyleDesc}>
                      <div style={{ whiteSpace: "pre-wrap" }}>
                        {line.description || "—"}
                      </div>
                      {index === 0 && safeText((job as any)?.site_name) ? (
                        <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                          {safeText((job as any)?.site_name)}
                          {safeText((job as any)?.site_address)
                            ? `\n${safeText((job as any)?.site_address)}`
                            : ""}
                        </div>
                      ) : null}
                    </td>
                    <td style={tdStyleNum}>{money(line.qty)}</td>
                    <td style={tdStyleNum}>{money(line.unit_price)}</td>
                    <td style={tdStyleNum}>{vatRate}</td>
                    <td style={tdStyleNum}>{money(line.line_total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 14, marginTop: 8 }}>
          Reverse charge: Customer to pay the VAT to HMRC
        </div>

        <div
          style={{
            marginTop: 8,
            borderTop: "2px solid #6d6d6d",
            paddingTop: 20,
            display: "grid",
            gridTemplateColumns: "1.3fr 0.7fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#efefef" }}>
                  <th align="left" style={vatHeadLeft}>VAT Rate</th>
                  <th align="right" style={vatHeadNum}>Net</th>
                  <th align="right" style={vatHeadNum}>VAT</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={vatCellLeft}>Standard 20.00% (20.00%)</td>
                  <td style={vatCellNum}>£{money(subtotal)}</td>
                  <td style={vatCellNum}>£0.00</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            style={{
              background: "#e9e9e9",
              padding: "14px 18px",
              fontSize: 15,
            }}
          >
            <TotalRow label="Total Net" value={`£${money(subtotal)}`} />
            <TotalRow label="Total VAT" value={`£${money(vat)}`} />
            <TotalRow label="VAT Reverse Charge" value={`-${`£${money(vat)}`}`} />
            <TotalRow
              label="TOTAL"
              value={`£${money(subtotal)}`}
              strong
            />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            Notes:
          </div>
          <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>
            {safeText((job as any)?.invoice_notes) || reference || "—"}
          </div>
        </div>

        <div
          style={{
            marginTop: 22,
            borderTop: "1px solid #9b9b9b",
            paddingTop: 16,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
            Terms and Conditions:
          </div>

          <div style={{ fontSize: 13, lineHeight: 1.25, maxWidth: 900 }}>
            <div>
              We reserve the right to charge interest on late paid invoices at the
              rate of 8% above bank base rates under the Late Payment of Commercial
              Debts (Interest) Act 1998.
            </div>
            <div>
              Queries raised more than 7 days after the invoice date will not be
              considered.
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 150,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 26,
            fontSize: 12,
            lineHeight: 1.25,
          }}
        >
          <div>
            <div>
              Registered in England and Wales No. 15895379 , VAT Registration
              Number GB 475188652
            </div>
            <div>Registered Address 6 Bay Street, Swansea, SA1 8LB</div>

            <div style={{ height: 18 }} />

            <div>
              The debt represented by this invoice has been purchased by, and
              assigned to, Ultimate Finance Ltd and is to be paid to: Ultimate
              Finance Ltd
            </div>
            <div>
              First Floor, Equinox North, Great Park Road, Bradley Stoke,
            </div>
          </div>

          <div>
            <div>
              They alone can give you a valid discharge of this debt.
            </div>
            <div>PLEASE DO NOT SEND ANY PAYMENTS</div>
            <div>DIRECTLY TO ANNS CRANE HIRE LIMITED</div>
          </div>

          <div>
            <div>BANK DETAILS: Sort Code - 30-15-99</div>
            <div>Account Number – 13622760</div>
            <div>IBAN – GB87 LOYD 3015 9913 6227 60</div>
            <div>Swift - LOYDGB21021</div>

            <div style={{ marginTop: 90, textAlign: "right" }}>Page 1 of 1</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "170px 1fr",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 4,
        fontWeight: strong ? 900 : 500,
        fontSize: strong ? 17 : 15,
      }}
    >
      <div>{label}</div>
      <div>{value}</div>
    </div>
  );
}

const thStyleCode: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 14,
  fontWeight: 700,
};

const thStyleDesc: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 14,
  fontWeight: 700,
};

const thStyleNum: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 14,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: 13,
  verticalAlign: "top",
};

const tdStyleCode: React.CSSProperties = {
  ...tdStyle,
  width: 90,
  whiteSpace: "pre-wrap",
};

const tdStyleDesc: React.CSSProperties = {
  ...tdStyle,
  width: "100%",
};

const tdStyleNum: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const vatHeadLeft: React.CSSProperties = {
  background: "#efefef",
  padding: "6px 8px",
  fontWeight: 700,
  fontSize: 14,
};

const vatHeadNum: React.CSSProperties = {
  background: "#efefef",
  padding: "6px 8px",
  fontWeight: 700,
  fontSize: 14,
};

const vatCellLeft: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: 13,
};

const vatCellNum: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: 13,
  textAlign: "right",
  whiteSpace: "nowrap",
};
