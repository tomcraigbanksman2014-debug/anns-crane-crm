import type { CSSProperties, ReactNode } from "react";
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
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function fmtLongDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `£${n.toFixed(2)}`;
}

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

function toParagraphs(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function chunkByApproxChars(items: string[], maxChars: number) {
  const pages: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const item of items) {
    const itemSize = item.length + 1;
    if (current.length > 0 && currentChars + itemSize > maxChars) {
      pages.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += itemSize;
  }

  if (current.length > 0) pages.push(current);
  return pages;
}

function markdownishNodes(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let listItems: Array<{ text: string; nested: boolean }> = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    const items = listItems;
    listItems = [];
    nodes.push(
      <ul key={key} style={termsListStyle}>
        {items.map((item, index) => (
          <li key={`${key}-${index}`} style={item.nested ? termsNestedListItemStyle : termsListItemStyle}>
            {item.text}
          </li>
        ))}
      </ul>
    );
  };

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushList(`list-${index}`);
      return;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      flushList(`list-${index}`);
      const level = trimmed.startsWith("###") ? 3 : trimmed.startsWith("##") ? 2 : 1;
      const value = trimmed.replace(/^#{1,3}\s*/, "");
      nodes.push(
        <div
          key={`heading-${index}`}
          style={level === 1 ? termsPrimaryHeadingStyle : level === 2 ? termsSecondaryHeadingStyle : termsMinorHeadingStyle}
        >
          {value}
        </div>
      );
      return;
    }

    if (/^[•*-]\s+/.test(trimmed) || rawLine.startsWith("  •") || rawLine.startsWith("  -")) {
      listItems.push({ text: trimmed.replace(/^[•*-]\s*/, ""), nested: /^\s{2,}/.test(rawLine) });
      return;
    }

    flushList(`list-${index}`);
    nodes.push(
      <p key={`para-${index}`} style={termsTextStyle}>
        {trimmed}
      </p>
    );
  });

  flushList("list-final");
  return nodes;
}

function splitCollectionDelivery(locationValue: string) {
  const cleaned = locationValue.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return { collection: "", delivery: "" };

  const fromToMatch = cleaned.match(/^(.*?)\s+to\s+(.*)$/i);
  if (fromToMatch) {
    return {
      collection: fromToMatch[1]?.trim() || "",
      delivery: fromToMatch[2]?.trim() || "",
    };
  }

  return { collection: "", delivery: cleaned };
}

function removeLocationBlockFromScope(scope: string) {
  if (!scope) return scope;
  return scope
    .replace(/\n?LOCATION:\s*[\s\S]*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const rawPdfSections = (quote as any)?.pdf_sections;
  const pdfSections =
    rawPdfSections && typeof rawPdfSections === "object" && !Array.isArray(rawPdfSections)
      ? (rawPdfSections as Record<string, unknown>)
      : {};

  const pdfText = (key: string, fallback: string | null | undefined = "") => {
    const value = pdfSections[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
    return String(fallback ?? "");
  };

  const baseFields = parsed.fields;
  const fields = {
    ...baseFields,
    contactName: pdfText("contactName", baseFields.contactName),
    contactPhone: pdfText("contactPhone", baseFields.contactPhone),
    projectDateTime: pdfText("projectDateTime", baseFields.projectDateTime),
    siteLocation: pdfText("siteLocation", baseFields.siteLocation),
    hireType: pdfText("hireType", baseFields.hireType),
    toSupply: pdfText("toSupply", baseFields.toSupply),
    scopeOfWork: pdfText("scopeOfWork", baseFields.scopeOfWork),
    workLocation: pdfText("workLocation", baseFields.workLocation),
    workDates: pdfText("workDates", baseFields.workDates),
    duration: pdfText("duration", baseFields.duration),
    workingHours: pdfText("workingHours", baseFields.workingHours),
    costSummary: pdfText("costSummary", baseFields.costSummary),
    additionalEquipment: pdfText("additionalEquipment", baseFields.additionalEquipment),
    includedItems: pdfText("includedItems", baseFields.includedItems),
    breakdown: pdfText("breakdown", baseFields.breakdown),
    additionalNotes: pdfText("additionalNotes", baseFields.additionalNotes),
    paymentTerms: pdfText("paymentTerms", baseFields.paymentTerms || DEFAULT_PAYMENT_TERMS),
  };

  const displaySubject = pdfText("subject", (quote as any)?.subject || "Quote");
  const displayQuoteDate = pdfText("quoteDate", fmtLongDate((quote as any)?.quote_date));
  const displayValidUntil = pdfText("validUntil", fmtDate((quote as any)?.valid_until));
  const displayClientCompany = pdfText("clientCompany", client?.company_name ?? "");

  const breakdownRows = parseBreakdownRows(fields.breakdown);
  const additionalEquipment = splitBulletLines(fields.additionalEquipment);
  const includedItems = splitBulletLines(fields.includedItems);
  const additionalNotes = splitLines(fields.additionalNotes);
  const paymentTerms = fields.paymentTerms || DEFAULT_PAYMENT_TERMS;
  const longTermPages = chunkByApproxChars(toParagraphs(DEFAULT_CONTRACT_TERMS_TEXT), 7600);

  const splitLocation = splitCollectionDelivery(fields.workLocation || "");
  const collection = pdfText("collection", splitLocation.collection);
  const delivery = pdfText("delivery", splitLocation.delivery);
  const cleanedScope = removeLocationBlockFromScope(fields.scopeOfWork || parsed.rawNotes || "");

  const contactRoleNote =
    additionalNotes.find((line) => line.toLowerCase().startsWith("contact role:")) ?? "";

  const contactRole = pdfText(
    "contactRole",
    contactRoleNote ? contactRoleNote.replace(/^contact role:\s*/i, "").trim() : ""
  );

  const displayAdditionalNotes = additionalNotes.filter(
    (line) => !line.toLowerCase().startsWith("contact role:")
  );

  const hasCommercialContent =
    breakdownRows.length > 0 ||
    additionalEquipment.length > 0 ||
    includedItems.length > 0 ||
    displayAdditionalNotes.length > 0 ||
    Boolean(fields.costSummary) ||
    Boolean((quote as any)?.amount);

  return (
    <html>
      <head>
        <title>{displaySubject}</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @page { size: A4; margin: 10mm; }
              * { box-sizing: border-box; }
              html, body { margin: 0; padding: 0; }
              body { font-family: Arial, Helvetica, sans-serif; background: #eef2f7; color: #111827; }
              .quote-hide-print { display: block; }
              .quote-sheet {
                width: 190mm;
                min-height: 277mm;
                margin: 10px auto;
                background: #fff;
                border: 1px solid #dbe2ea;
                box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
                padding: 10mm;
                page-break-after: always;
                break-after: page;
              }
              .quote-sheet:last-of-type {
                page-break-after: auto;
                break-after: auto;
              }
              .terms-page p, .terms-page li, .terms-page h1, .terms-page h2, .terms-page h3 {
                break-inside: avoid;
                page-break-inside: avoid;
              }
              @media print {
                body { background: #fff !important; }
                .quote-hide-print { display: none !important; }
                .quote-sheet {
                  width: auto;
                  min-height: auto;
                  margin: 0;
                  border: none;
                  box-shadow: none;
                  padding: 0;
                }
              }
            `,
          }}
        />
      </head>
      <body>
        <div className="quote-sheet" style={sheetStyle}>
          <div className="quote-hide-print" style={actionBarStyle}>
            <div>
              <div style={screenTitleStyle}>QUOTE</div>
              <div style={screenSubStyle}>{displaySubject || displayClientCompany || "Customer quote"}</div>
            </div>
            <PrintQuoteActions backHref={`/quotes/${params.id}`} editHref={`/quotes/${params.id}/print/edit`} />
          </div>

          <div style={mastheadStyle}>
            <div style={logoBlockStyle}>
              <img src="/logo.png" alt="Anns Crane Hire" style={logoStyle} />
            </div>
            <div style={companyBlockStyle}>
              <div style={companyNameStyle}>Anns Crane Hire Ltd</div>
              <div style={companyLineStyle}>6 Bay St, Port Tennant, Swansea, SA1 8LB</div>
              <div style={companyLineStyle}>Tel: 01792 641653</div>
              <div style={companyLineStyle}>Email: info@annscranehire.co.uk</div>
            </div>
            <div style={metaBlockStyle}>
              <MetaLine label="Date" value={displayQuoteDate || "—"} />
              <MetaLine label="Quote" value={displaySubject || "—"} />
            </div>
          </div>

          <div style={heroRowStyle}>
            <div style={heroTitleStyle}>QUOTE</div>
            <div style={heroRefStyle}>{displaySubject || displayClientCompany || "Customer quote"}</div>
          </div>

          <div style={topGridStyle}>
            <Panel title="Client">
              <DataRow label="Company" value={displayClientCompany || "—"} />
              <DataRow label="Contact name" value={fields.contactName || client?.contact_name || "—"} />
              <DataRow label="Tel" value={fields.contactPhone || client?.phone || "—"} />
              {hasText(contactRole) ? <DataRow label="Contact role" value={contactRole} /> : null}
              {hasText(fields.siteLocation) ? (
                <DataRow label="Site location" value={fields.siteLocation} />
              ) : client?.address ? (
                <DataRow label="Site location" value={client.address} />
              ) : null}
            </Panel>

            <Panel title="Quote details">
              <DataRow label="Date & time of project" value={fields.projectDateTime || "—"} />
              <DataRow label="Hire type" value={fields.hireType || "—"} />
              {hasText(collection) ? <DataRow label="Collection" value={collection} /> : null}
              {hasText(delivery) ? <DataRow label="Delivery" value={delivery} /> : null}
              {!hasText(collection) && !hasText(delivery) ? (
                <DataRow label="Location" value={fields.workLocation || "—"} />
              ) : null}
              <DataRow label="Date(s)" value={fields.workDates || "—"} />
              <DataRow label="Duration" value={fields.duration || "—"} />
              <DataRow label="Working pattern" value={fields.workingHours || "—"} />
              <DataRow label="Valid until" value={displayValidUntil || "—"} />
              <DataRow label="Amount" value={fields.costSummary || fmtMoney((quote as any)?.amount)} />
            </Panel>
          </div>

          <div style={bodyGridStyle}>
            <Panel title="To Supply">
              <div style={preLineTextStyle}>{fields.toSupply || "—"}</div>
            </Panel>
            <Panel title="Scope of Work">
              <div style={preLineTextStyle}>{cleanedScope || "—"}</div>
            </Panel>
          </div>

          {hasCommercialContent ? (
            <div style={compactCommercialWrapStyle}>
              {breakdownRows.length > 0 ? (
                <Panel title="Breakdown of current charges / rates">
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Description</th>
                        <th style={{ ...thStyle, width: 70 }}>Qty</th>
                        <th style={{ ...thStyle, width: 180, textAlign: "right" }}>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdownRows.map((row, index) => (
                        <tr key={`${row.description}-${index}`}>
                          <td style={tdStyle}>{row.description || "—"}</td>
                          <td style={tdStyle}>{row.qty || "—"}</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>{row.rate || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              ) : null}

              <div style={smallGridStyle}>
                {additionalEquipment.length > 0 ? (
                  <Panel title="Additional equipment & personnel">
                    <ul style={cleanListStyle}>
                      {additionalEquipment.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </Panel>
                ) : null}

                {includedItems.length > 0 ? (
                  <Panel title="Included under full CPA terms">
                    <ul style={cleanListStyle}>
                      {includedItems.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </Panel>
                ) : null}
              </div>

              {displayAdditionalNotes.length > 0 ? (
                <Panel title="Additional quote notes">
                  <div style={preLineTextStyle}>{displayAdditionalNotes.join("\n")}</div>
                </Panel>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="quote-sheet" style={sheetStyle}>
          <div style={pageHeaderStyle}>
            <div style={pageHeaderTitleStyle}>Standard terms and conditions</div>
            <div style={pageHeaderSubStyle}>{displaySubject || displayClientCompany || "Quote"}</div>
          </div>

          <div style={termsCardStyle}>{markdownishNodes(DEFAULT_HIRE_TERMS_TEXT)}</div>

          <div style={signatureBoxStyle}>
            <div style={signatureTitleStyle}>PLEASE SIGN BELOW AND RETURN TO info@annscranehire.co.uk</div>
            <div style={signForStyle}>FOR AND ON BEHALF OF:</div>
            <div style={signatureRowStyle}>
              <SignatureField label="Name" />
              <SignatureField label="Signed" />
              <SignatureField label="Date" />
            </div>
            <div style={signatureFooterStyle}>
              <div style={signatureFooterCellStyle}><strong>Purchase Order No:</strong></div>
              <div style={signatureFooterCellStyle}><strong>PAYMENT TERMS:</strong> {paymentTerms}</div>
            </div>
          </div>

          <div style={footerStyle}>
            Construction Plant-hire Association (CPA) Standard terms and conditions for contract lift services.
            <br />
            Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB, tel: 01792 641653, e-mail: info@annscranehire.co.uk
          </div>
        </div>

        {longTermPages.map((page, index) => (
          <div key={`long-terms-${index}`} className="quote-sheet terms-page" style={sheetStyle}>
            <div style={pageHeaderStyle}>
              <div style={pageHeaderTitleStyle}>Construction Plant-hire Association (CPA)</div>
              <div style={pageHeaderSubStyle}>Standard terms and conditions for contract lift services</div>
            </div>

            <div style={longTermsStyle}>
              {page.map((paragraph, paragraphIndex) => (
                <p key={`p-${index}-${paragraphIndex}`} style={longTermParagraphStyle}>
                  {paragraph}
                </p>
              ))}
            </div>

            <div style={footerTightStyle}>
              Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB, tel: 01792 641653, e-mail: info@annscranehire.co.uk
            </div>
          </div>
        ))}
      </body>
    </html>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={panelStyle}>
      <div style={panelTitleStyle}>{title}</div>
      {children}
    </section>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={dataRowStyle}>
      <div style={dataLabelStyle}>{label}</div>
      <div style={dataValueStyle}>{value}</div>
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <div style={metaLabelStyle}>{label}</div>
      <div style={metaValueStyle}>{value}</div>
    </div>
  );
}

function SignatureField({ label }: { label: string }) {
  return (
    <div style={signatureFieldStyle}>
      <span style={signatureLabelStyle}>{label}:</span>
      <div style={signatureLineStyle} />
    </div>
  );
}

const sheetStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const actionBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const screenTitleStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: 0.4,
};

const screenSubStyle: CSSProperties = {
  marginTop: 3,
  color: "#64748b",
  fontSize: 13,
};

const mastheadStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "150px 1fr 220px",
  gap: 16,
  alignItems: "center",
  borderBottom: "2px solid #0f172a",
  paddingBottom: 10,
};

const logoBlockStyle: CSSProperties = {
  minHeight: 88,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const logoStyle: CSSProperties = {
  width: "100%",
  maxWidth: 140,
  maxHeight: 88,
  objectFit: "contain",
  display: "block",
};

const companyBlockStyle: CSSProperties = {
  display: "grid",
  gap: 3,
};

const companyNameStyle: CSSProperties = {
  fontSize: 26,
  fontWeight: 900,
  lineHeight: 1.05,
};

const companyLineStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.4,
};

const metaBlockStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  borderLeft: "1px solid #cbd5e1",
  paddingLeft: 14,
};

const metaLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.7,
  textTransform: "uppercase",
  color: "#64748b",
};

const metaValueStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.35,
};

const heroRowStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  alignItems: "end",
};

const heroTitleStyle: CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  letterSpacing: 0.6,
};

const heroRefStyle: CSSProperties = {
  fontSize: 16,
  color: "#334155",
  fontWeight: 700,
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const bodyGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const compactCommercialWrapStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const smallGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const panelStyle: CSSProperties = {
  border: "1px solid #d8dee8",
  borderRadius: 10,
  padding: 12,
  display: "grid",
  gap: 8,
};

const panelTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  letterSpacing: 0.2,
};

const dataRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "122px 1fr",
  gap: 8,
  alignItems: "start",
};

const dataLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "#64748b",
};

const dataValueStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: "pre-line",
};

const preLineTextStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  whiteSpace: "pre-line",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: CSSProperties = {
  borderBottom: "1px solid #cbd5e1",
  textAlign: "left",
  padding: "8px 6px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "#475569",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #e2e8f0",
  padding: "8px 6px",
  fontSize: 12.5,
  verticalAlign: "top",
  lineHeight: 1.45,
  whiteSpace: "pre-line",
};

const cleanListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 12.5,
  lineHeight: 1.5,
  display: "grid",
  gap: 4,
};

const pageHeaderStyle: CSSProperties = {
  borderBottom: "1px solid #cbd5e1",
  paddingBottom: 8,
  display: "grid",
  gap: 2,
};

const pageHeaderTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
};

const pageHeaderSubStyle: CSSProperties = {
  fontSize: 12.5,
  color: "#64748b",
};

const termsCardStyle: CSSProperties = {
  border: "1px solid #d8dee8",
  borderRadius: 10,
  padding: 12,
  display: "grid",
  gap: 6,
};

const termsPrimaryHeadingStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 14,
  fontWeight: 900,
  textTransform: "uppercase",
};

const termsSecondaryHeadingStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  fontWeight: 800,
};

const termsMinorHeadingStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  fontWeight: 800,
};

const termsTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.45,
};

const termsListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: "grid",
  gap: 4,
};

const termsListItemStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
};

const termsNestedListItemStyle: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.4,
  marginLeft: 8,
};

const signatureBoxStyle: CSSProperties = {
  border: "1px solid #0f172a",
  display: "grid",
  gap: 10,
  padding: 12,
};

const signatureTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
};

const signForStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 800,
};

const signatureRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 14,
};

const signatureFieldStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  alignItems: "center",
  gap: 8,
};

const signatureLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
};

const signatureLineStyle: CSSProperties = {
  borderBottom: "1px solid #111827",
  minHeight: 22,
};

const signatureFooterStyle: CSSProperties = {
  borderTop: "1px solid #111827",
  paddingTop: 8,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const signatureFooterCellStyle: CSSProperties = {
  fontSize: 12.5,
};

const footerStyle: CSSProperties = {
  marginTop: "auto",
  fontSize: 11,
  lineHeight: 1.45,
  color: "#475569",
  textAlign: "center",
};

const longTermsStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const longTermParagraphStyle: CSSProperties = {
  margin: 0,
  fontSize: 10,
  lineHeight: 1.36,
  textAlign: "left",
};

const footerTightStyle: CSSProperties = {
  marginTop: "auto",
  fontSize: 10.5,
  lineHeight: 1.35,
  color: "#475569",
  textAlign: "center",
};
