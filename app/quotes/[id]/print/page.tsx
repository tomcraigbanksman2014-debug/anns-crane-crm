import type { CSSProperties, ReactNode } from "react";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import PrintQuoteActions from "./PrintQuoteActions";
import {
  chunkArray,
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

function toParagraphs(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderMarkdownishTerms(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let listItems: Array<{ text: string; nested: boolean }> = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    const items = listItems;
    listItems = [];
    nodes.push(
      <ul key={key} style={listStyle}>
        {items.map((item, index) => (
          <li key={`${key}-${index}`} style={item.nested ? nestedListItemStyle : listItemStyle}>
            {item.text}
          </li>
        ))}
      </ul>
    );
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList(`list-${index}`);
      return;
    }

    if (trimmed.startsWith("# ") || trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
      flushList(`list-${index}`);
      const level = trimmed.startsWith("### ") ? 3 : trimmed.startsWith("## ") ? 2 : 1;
      const textValue = trimmed.replace(/^#{1,3}\s*/, "");
      nodes.push(
        <div
          key={`heading-${index}`}
          style={level === 1 ? termsMainHeadingStyle : level === 2 ? termsSubHeadingStyle : termsMinorHeadingStyle}
        >
          {textValue}
        </div>
      );
      return;
    }

    if (/^[•*-]\s+/.test(trimmed) || /^•/.test(trimmed)) {
      const nested = /^[-*]\s+/.test(trimmed) || rawLine.startsWith("  ");
      listItems.push({ text: trimmed.replace(/^[•*-]\s*/, ""), nested });
      return;
    }

    flushList(`list-${index}`);
    nodes.push(
      <p key={`p-${index}`} style={termsParagraphStyle}>
        {trimmed}
      </p>
    );
  });

  flushList("list-final");
  return nodes;
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
  const customNotesLines = splitLines(fields.additionalNotes);
  const paymentTerms = fields.paymentTerms || DEFAULT_PAYMENT_TERMS;
  const contractTermPages = chunkArray(toParagraphs(DEFAULT_CONTRACT_TERMS_TEXT), 14);

  return (
    <html>
      <head>
        <title>{(quote as any)?.subject || "Quote"}</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @page { size: A4; margin: 12mm; }
              * { box-sizing: border-box; }
              html, body { margin: 0; padding: 0; }
              body { font-family: Arial, Helvetica, sans-serif; background: #eef2f7; color: #111827; }
              .quote-print-hide { display: block; }
              .quote-print-page {
                width: 210mm;
                min-height: calc(297mm - 24mm);
                margin: 12px auto;
                background: #ffffff;
                box-shadow: 0 8px 28px rgba(0,0,0,0.08);
                border: 1px solid #d9dee6;
                padding: 14mm;
                position: relative;
                break-after: page;
                page-break-after: always;
              }
              .quote-print-page:last-child {
                break-after: auto;
                page-break-after: auto;
              }
              @media print {
                body { background: #fff !important; }
                .quote-print-hide { display: none !important; }
                .quote-print-page {
                  width: auto;
                  min-height: auto;
                  margin: 0;
                  box-shadow: none;
                  border: none;
                  padding: 0;
                }
                table, tr, td, th, ul, li, p, div {
                  break-inside: avoid-page;
                  page-break-inside: avoid;
                }
              }
            `,
          }}
        />
      </head>
      <body>
        <div className="quote-print-page" style={pageStyle}>
          <div style={topBarStyle} className="quote-print-hide">
            <div>
              <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 0.4 }}>QUOTE</div>
              <div style={{ marginTop: 4, color: "#6b7280" }}>
                {(quote as any)?.subject ?? client?.company_name ?? "Customer quote"}
              </div>
            </div>
            <PrintQuoteActions backHref={`/quotes/${params.id}`} />
          </div>

          <div className="quote-print-hide" style={helpBoxStyle}>
            Use <strong>Print / Save PDF</strong>, then choose <strong>Save as PDF</strong> in the browser print window.
          </div>

          <div style={headerStyle}>
            <div style={logoWrapStyle}>
              <img src="/logo.png" alt="Anns Crane Hire" style={logoStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={companyNameStyle}>Anns Crane Hire Ltd</div>
              <div style={companyTextStyle}>6 Bay St, Port Tennant, Swansea, SA1 8LB</div>
              <div style={companyTextStyle}>Tel: 01792 641653</div>
              <div style={companyTextStyle}>Email: info@annscranehire.co.uk</div>
            </div>
            <div style={quoteMetaStyle}>
              <div style={quoteLabelStyle}>Date</div>
              <div style={quoteMetaValueStyle}>{fmtLongDate((quote as any)?.quote_date)}</div>
              <div style={{ ...quoteLabelStyle, marginTop: 10 }}>Quote</div>
              <div style={quoteMetaValueStyle}>{(quote as any)?.subject || "—"}</div>
            </div>
          </div>

          <div style={heroTitleStyle}>QUOTE</div>

          <div style={detailsGridStyle}>
            <InfoCard title="Client">
              <InfoRow label="Company" value={client?.company_name ?? "—"} />
              <InfoRow label="Contact name" value={fields.contactName || client?.contact_name || "—"} />
              <InfoRow label="Tel" value={fields.contactPhone || client?.phone || "—"} />
              <InfoRow label="Site location" value={fields.siteLocation || client?.address || "—"} />
            </InfoCard>
            <InfoCard title="Quote details">
              <InfoRow label="Date & time of project" value={fields.projectDateTime || "—"} />
              <InfoRow label="Hire type" value={fields.hireType || "—"} />
              <InfoRow label="Location" value={fields.workLocation || client?.address || "—"} />
              <InfoRow label="Date(s)" value={fields.workDates || "—"} />
              <InfoRow label="Duration" value={fields.duration || "—"} />
              <InfoRow label="Working pattern" value={fields.workingHours || "—"} />
              <InfoRow label="Valid until" value={fmtDate((quote as any)?.valid_until)} />
              <InfoRow label="Amount" value={fields.costSummary || fmtMoney((quote as any)?.amount)} />
            </InfoCard>
          </div>

          <SectionBox title="To Supply">
            <div style={bodyTextStyle}>{fields.toSupply || "—"}</div>
          </SectionBox>

          <SectionBox title="Scope of Work">
            <div style={bodyTextStyle}>{fields.scopeOfWork || parsed.rawNotes || "—"}</div>
          </SectionBox>
        </div>

        <div className="quote-print-page" style={pageStyle}>
          <div style={pageMiniHeaderStyle}>
            <div style={pageMiniTitleStyle}>Commercial details</div>
            <div style={pageMiniSubStyle}>{(quote as any)?.subject || client?.company_name || "Quote"}</div>
          </div>

          {breakdownRows.length > 0 ? (
            <SectionBox title="Breakdown of current charges / rates">
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 86 }}>Qty</th>
                    <th style={thStyle}>Description</th>
                    <th style={{ ...thStyle, width: 220 }}>Rate</th>
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
            </SectionBox>
          ) : null}

          {additionalEquipment.length > 0 ? (
            <SectionBox title="Additional Equipment & Personnel">
              <ul style={cleanListStyle}>
                {additionalEquipment.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </SectionBox>
          ) : null}

          {includedItems.length > 0 ? (
            <SectionBox title="Included under full CPA terms">
              <ul style={cleanListStyle}>
                {includedItems.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </SectionBox>
          ) : null}

          {customNotesLines.length > 0 ? (
            <SectionBox title="Additional quote notes">
              <div style={bodyTextStyle}>{customNotesLines.join("\n")}</div>
            </SectionBox>
          ) : null}

          <SectionBox title="Standard terms and conditions">
            <div>{renderMarkdownishTerms(DEFAULT_HIRE_TERMS_TEXT)}</div>
          </SectionBox>

          <div style={signatureBoxStyle}>
            <div style={signatureTitleStyle}>PLEASE SIGN BELOW AND RETURN TO info@annscranehire.co.uk</div>
            <div style={signForStyle}>FOR AND ON BEHALF OF:</div>
            <div style={signatureRowStyle}>
              <SignatureField label="Name" />
              <SignatureField label="Signed" />
              <SignatureField label="Date" />
            </div>
            <div style={acceptanceFooterStyle}>
              <div style={acceptanceFooterCellStyle}><strong>Purchase Order No:</strong></div>
              <div style={acceptanceFooterCellStyle}><strong>PAYMENT TERMS:</strong> {paymentTerms}</div>
            </div>
          </div>

          <div style={companyFooterStyle}>
            Construction Plant-hire Association (CPA) Standard terms and conditions for contract lift services.
            <br />
            Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB, tel: 01792 641653, e-mail: info@annscranehire.co.uk
          </div>
        </div>

        {contractTermPages.map((paragraphs, pageIndex) => (
          <div key={`contract-page-${pageIndex}`} className="quote-print-page" style={pageStyle}>
            <div style={pageMiniHeaderStyle}>
              <div style={pageMiniTitleStyle}>Construction Plant-hire Association (CPA)</div>
              <div style={pageMiniSubStyle}>Standard terms and conditions for contract lift services</div>
            </div>

            <div style={contractTermsWrapStyle}>
              {paragraphs.map((paragraph, index) => (
                <p key={`term-${pageIndex}-${index}`} style={contractParagraphStyle}>
                  {paragraph}
                </p>
              ))}
            </div>

            <div style={companyFooterTightStyle}>
              Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB, tel: 01792 641653, e-mail: info@annscranehire.co.uk
            </div>
          </div>
        ))}
      </body>
    </html>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={infoCardStyle}>
      <div style={infoCardTitleStyle}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}

function SectionBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={sectionBoxStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRowStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

function SignatureField({ label }: { label: string }) {
  return (
    <div style={signatureFieldStyle}>
      <span style={signatureFieldLabelStyle}>{label}:</span>
      <div style={signatureFieldLineStyle} />
    </div>
  );
}

const pageStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const topBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const helpBoxStyle: CSSProperties = {
  border: "1px solid #d8dfeb",
  background: "#f8fbff",
  borderRadius: 10,
  padding: "10px 12px",
  color: "#334155",
};

const headerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "180px 1fr 220px",
  gap: 18,
  alignItems: "center",
  border: "1px solid #d5dce6",
  borderRadius: 14,
  padding: 18,
};

const logoWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 84,
  padding: 8,
};

const logoStyle: CSSProperties = {
  display: "block",
  maxWidth: "100%",
  maxHeight: 78,
  width: "auto",
  height: "auto",
  objectFit: "contain",
};

const companyNameStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1.1,
};

const companyTextStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  lineHeight: 1.5,
};

const quoteMetaStyle: CSSProperties = {
  borderLeft: "1px solid #d5dce6",
  paddingLeft: 16,
  minHeight: 84,
};

const quoteLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.7,
  textTransform: "uppercase",
  color: "#64748b",
};

const quoteMetaValueStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.4,
};

const heroTitleStyle: CSSProperties = {
  fontSize: 34,
  fontWeight: 900,
  letterSpacing: 0.6,
};

const detailsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
};

const infoCardStyle: CSSProperties = {
  border: "1px solid #d5dce6",
  borderRadius: 14,
  padding: 16,
};

const infoCardTitleStyle: CSSProperties = {
  marginBottom: 12,
  fontSize: 18,
  fontWeight: 800,
};

const infoRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "150px 1fr",
  gap: 10,
  alignItems: "start",
};

const infoLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const infoValueStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const sectionBoxStyle: CSSProperties = {
  border: "1px solid #d5dce6",
  borderRadius: 14,
  padding: 16,
};

const sectionTitleStyle: CSSProperties = {
  marginBottom: 10,
  fontSize: 18,
  fontWeight: 800,
};

const bodyTextStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
  fontSize: 14,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const thStyle: CSSProperties = {
  border: "1px solid #cdd5df",
  background: "#f5f7fb",
  padding: "10px 10px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 800,
};

const tdStyle: CSSProperties = {
  border: "1px solid #cdd5df",
  padding: "10px 10px",
  verticalAlign: "top",
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const cleanListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  lineHeight: 1.55,
  fontSize: 14,
  display: "grid",
  gap: 6,
};

const termsMainHeadingStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginTop: 0,
  marginBottom: 8,
};

const termsSubHeadingStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  marginTop: 12,
  marginBottom: 6,
};

const termsMinorHeadingStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  marginTop: 10,
  marginBottom: 4,
};

const termsParagraphStyle: CSSProperties = {
  margin: "4px 0",
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};

const listStyle: CSSProperties = {
  margin: "6px 0 8px 0",
  paddingLeft: 18,
  display: "grid",
  gap: 5,
};

const listItemStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
};

const nestedListItemStyle: CSSProperties = {
  ...listItemStyle,
  marginLeft: 10,
};

const signatureBoxStyle: CSSProperties = {
  border: "1px solid #cdd5df",
  borderRadius: 14,
  overflow: "hidden",
  marginTop: "auto",
};

const signatureTitleStyle: CSSProperties = {
  padding: "12px 14px",
  fontWeight: 900,
  fontSize: 14,
  borderBottom: "1px solid #cdd5df",
};

const signForStyle: CSSProperties = {
  padding: "12px 14px 0 14px",
  fontWeight: 800,
  fontSize: 14,
};

const signatureRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 16,
  padding: 14,
};

const signatureFieldStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const signatureFieldLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
};

const signatureFieldLineStyle: CSSProperties = {
  borderBottom: "1px solid #111827",
  minHeight: 24,
};

const acceptanceFooterStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  borderTop: "1px solid #cdd5df",
};

const acceptanceFooterCellStyle: CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  borderRight: "1px solid #cdd5df",
};

const companyFooterStyle: CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  lineHeight: 1.5,
  color: "#374151",
};

const pageMiniHeaderStyle: CSSProperties = {
  borderBottom: "2px solid #d5dce6",
  paddingBottom: 10,
  marginBottom: 8,
};

const pageMiniTitleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
};

const pageMiniSubStyle: CSSProperties = {
  marginTop: 4,
  color: "#6b7280",
  fontSize: 13,
};

const contractTermsWrapStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const contractParagraphStyle: CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  lineHeight: 1.48,
  textAlign: "left",
};

const companyFooterTightStyle: CSSProperties = {
  marginTop: "auto",
  paddingTop: 12,
  fontSize: 11,
  textAlign: "center",
  color: "#4b5563",
};
