import Image from "next/image";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import PrintQuoteActions from "./PrintQuoteActions";
import {
  DEFAULT_CONTRACT_TERMS_TEXT,
  DEFAULT_HIRE_TERMS_TEXT,
  DEFAULT_PAYMENT_TERMS,
  parseBreakdownRows,
  parseQuoteNotes,
  splitBulletLines,
  splitLines,
} from "../../quoteTemplate";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function fmtLongDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? null);
  if (!Number.isFinite(n)) return "—";
  return `£${n.toFixed(2)}`;
}

export default async function QuotePrintPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select(`
      *,
      clients:client_id (
        id,
        company_name,
        contact_name,
        phone,
        email,
        address
      )
    `)
    .eq("id", params.id)
    .single();

  const client = Array.isArray((quote as any)?.clients)
    ? (quote as any).clients[0]
    : (quote as any)?.clients;

  const parsed = parseQuoteNotes((quote as any)?.notes ?? null);
  const fields = parsed.fields;
  const breakdownRows = parseBreakdownRows(fields.breakdown);
  const additionalEquipment = splitBulletLines(fields.additionalEquipment);
  const includedItems = splitBulletLines(fields.includedItems);
  const projectDateTimeLines = splitLines(fields.projectDateTime);
  const workingHoursLines = splitLines(fields.workingHours);
  const customNotesLines = splitLines(fields.additionalNotes);
  const paymentTerms = fields.paymentTerms || DEFAULT_PAYMENT_TERMS;

  return (
    <html>
      <head>
        <title>{(quote as any)?.subject || "Quote"}</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @page { margin: 14mm; }
              @media print {
                .quote-print-hide { display: none !important; }
                body { background: #fff !important; }
                .quote-page { box-shadow: none !important; margin: 0 !important; width: auto !important; }
              }
            `,
          }}
        />
      </head>
      <body style={bodyStyle}>
        <div className="quote-page" style={pageStyle}>
          <div style={topBarStyle}>
            <div>
              <div style={{ fontSize: 36, fontWeight: 1000, letterSpacing: 0.5 }}>QUOTE</div>
              <div style={{ marginTop: 4, opacity: 0.72 }}>
                {(quote as any)?.subject ?? client?.company_name ?? "Customer quote"}
              </div>
            </div>
            <PrintQuoteActions backHref={`/quotes/${params.id}`} />
          </div>

          <div className="quote-print-hide" style={helpBox}>
            Use <strong>Print / Save PDF</strong>, then choose <strong>Save as PDF</strong> in the browser print window.
          </div>

          <div style={headerCard}>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "0 0 auto" }}>
                <Image src="/logo.png" alt="Ann's Crane Hire" width={140} height={76} />
              </div>
              <div style={{ flex: "1 1 320px" }}>
                <div style={{ fontWeight: 900, fontSize: 24 }}>Anns Crane Hire Ltd</div>
                <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                  6 Bay St, Port Tennant, Swansea, SA1 8LB<br />
                  Tel: 01792 641653<br />
                  Email: info@annscranehire.co.uk
                </div>
              </div>
              <div style={{ flex: "0 1 220px", textAlign: "right", fontWeight: 700 }}>
                {fmtLongDate((quote as any)?.quote_date)}
              </div>
            </div>
          </div>

          <div style={infoTable}>
            <InfoCell label="Client" value={client?.company_name ?? "—"} />
            <InfoCell label="Date & time of project" value={fields.projectDateTime || "—"} />
            <InfoCell label="Contact name" value={fields.contactName || client?.contact_name || "—"} />
            <InfoCell label="Tel" value={fields.contactPhone || client?.phone || "—"} />
            <InfoCell label="Site location" value={fields.siteLocation || fields.workLocation || client?.address || "—"} />
            <InfoCell label="Hire type" value={fields.hireType || "—"} />
          </div>

          <div style={sectionBox}>
            <div style={sectionHeading}>To Supply</div>
            <div style={bodyText}>{fields.toSupply || "—"}</div>
            <div style={{ ...sectionHeading, marginTop: 14 }}>Scope of Work</div>
            <div style={bodyText}>{fields.scopeOfWork || parsed.rawNotes || "—"}</div>
          </div>

          <div style={infoTable}>
            <InfoCell label="Location" value={fields.workLocation || client?.address || "—"} />
            <InfoCell label="Date(s)" value={fields.workDates || "—"} />
            <InfoCell label="Duration" value={fields.duration || formatProjectBlock(projectDateTimeLines) || "—"} />
            <InfoCell label="Working pattern" value={fields.workingHours || formatProjectBlock(workingHoursLines) || "—"} />
            <InfoCell label="Cost" value={fields.costSummary || fmtMoney((quote as any)?.amount)} />
            <InfoCell label="Valid until" value={fmtDate((quote as any)?.valid_until)} />
          </div>

          {additionalEquipment.length > 0 ? (
            <div style={sectionBox}>
              <div style={sectionHeading}>Additional Equipment & Personnel</div>
              <ul style={listStyle}>
                {additionalEquipment.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {includedItems.length > 0 ? (
            <div style={sectionBox}>
              <div style={sectionHeading}>Included under full CPA terms</div>
              <ul style={listStyle}>
                {includedItems.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {breakdownRows.length > 0 ? (
            <div style={sectionBox}>
              <div style={sectionHeading}>Breakdown of current charges / rates</div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Qty</th>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownRows.map((row, index) => (
                    <tr key={`${row.description}-${index}`}>
                      <td style={tdStyle}>{row.qty || "—"}</td>
                      <td style={tdStyle}>{row.description || "—"}</td>
                      <td style={tdStyle}>{row.rate || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {customNotesLines.length > 0 ? (
            <div style={sectionBox}>
              <div style={sectionHeading}>Additional quote notes</div>
              <div style={bodyText}>{customNotesLines.join("\n")}</div>
            </div>
          ) : null}

          <div style={termsBox}>
            <div style={termsPre}>{DEFAULT_HIRE_TERMS_TEXT}</div>
          </div>

          <div style={signatureBox}>
            <div style={signatureHeading}>PLEASE SIGN BELOW AND RETURN TO info@annscranehire.co.uk</div>
            <div style={{ fontWeight: 800, marginTop: 14 }}>FOR AND ON BEHALF OF:</div>
            <div style={signatureLineRow}>
              <div style={signatureLine}><span>Name:</span><div style={lineStyle} /></div>
              <div style={signatureLine}><span>Signed:</span><div style={lineStyle} /></div>
              <div style={signatureLine}><span>Date:</span><div style={lineStyle} /></div>
            </div>
            <div style={footerTable}>
              <div style={footerCell}><strong>Purchase Order No:</strong></div>
              <div style={footerCell}><strong>PAYMENT TERMS:</strong> {paymentTerms}</div>
            </div>
          </div>

          <div style={{ marginTop: 20, fontSize: 13, fontWeight: 700 }}>
            Construction Plant-hire Association (CPA) Standard terms and conditions for contract lift services.
          </div>

          <div style={longTermsBox}>
            <div style={termsPre}>{DEFAULT_CONTRACT_TERMS_TEXT}</div>
          </div>
        </div>
      </body>
    </html>
  );
}

function formatProjectBlock(lines: string[]) {
  if (!lines.length) return "";
  return lines.join("\n");
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoCellStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value || "—"}</div>
    </div>
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
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
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

const headerCard: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #111",
  padding: 16,
};

const infoTable: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  borderLeft: "1px solid #111",
  borderRight: "1px solid #111",
  borderBottom: "1px solid #111",
};

const infoCellStyle: React.CSSProperties = {
  borderTop: "1px solid #111",
  borderRight: "1px solid #111",
  padding: 10,
  minHeight: 62,
  whiteSpace: "pre-wrap",
};

const infoLabelStyle: React.CSSProperties = {
  fontWeight: 800,
  marginBottom: 6,
};

const infoValueStyle: React.CSSProperties = {
  lineHeight: 1.45,
};

const sectionBox: React.CSSProperties = {
  border: "1px solid #111",
  padding: 12,
  marginTop: 14,
};

const sectionHeading: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 16,
  marginBottom: 8,
};

const bodyText: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  lineHeight: 1.55,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid #111",
  padding: "10px 8px",
  fontSize: 13,
};

const tdStyle: React.CSSProperties = {
  border: "1px solid #111",
  padding: "10px 8px",
  fontSize: 14,
  verticalAlign: "top",
  whiteSpace: "pre-wrap",
};

const listStyle: React.CSSProperties = {
  margin: "0 0 0 18px",
  padding: 0,
  lineHeight: 1.55,
};

const termsBox: React.CSSProperties = {
  border: "1px solid #111",
  marginTop: 16,
  padding: 12,
};


const termsPre: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  lineHeight: 1.45,
  fontSize: 12,
};

const signatureBox: React.CSSProperties = {
  border: "1px solid #111",
  marginTop: 16,
  padding: 12,
};

const signatureHeading: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 18,
};

const signatureLineRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginTop: 14,
};

const signatureLine: React.CSSProperties = {
  display: "grid",
  gap: 8,
  alignItems: "end",
};

const lineStyle: React.CSSProperties = {
  borderBottom: "1px solid #111",
  height: 24,
};

const footerTable: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  borderTop: "1px solid #111",
  marginTop: 16,
};

const footerCell: React.CSSProperties = {
  padding: "10px 8px 0 0",
  minHeight: 30,
};

const longTermsBox: React.CSSProperties = {
  border: "1px solid #111",
  marginTop: 16,
  padding: 12,
};
