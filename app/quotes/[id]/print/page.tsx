
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

function splitRouteLocation(value: string) {
  const text = String(value || "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    return { collection: "", delivery: "" };
  }

  if (/\s+to\s+/i.test(text)) {
    const parts = text.split(/\s+to\s+/i);
    const collection = (parts.shift() || "").trim();
    const delivery = parts.join(" to ").trim();
    return { collection, delivery };
  }

  return { collection: "", delivery: text };
}

function pullContactRole(lines: string[]) {
  let contactRole = "";
  const cleaned: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^contact role\s*:\s*(.+)$/i);
    if (match) {
      contactRole = match[1].trim();
      continue;
    }

    cleaned.push(trimmed);
  }

  return { contactRole, cleanedNotes: cleaned };
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
  const additionalNotes = splitLines(fields.additionalNotes);
  const { contactRole, cleanedNotes } = pullContactRole(additionalNotes);
  const paymentTerms = fields.paymentTerms || DEFAULT_PAYMENT_TERMS;
  const longTermPages = chunkByApproxChars(toParagraphs(DEFAULT_CONTRACT_TERMS_TEXT), 9300);
  const route = splitRouteLocation(fields.workLocation || "");

  const detailRows = [
    { label: "Date & time of project", value: fields.projectDateTime || "—" },
    { label: "Hire type", value: fields.hireType || "—" },
    ...(route.collection ? [{ label: "Collection", value: route.collection }] : []),
    { label: route.collection ? "Delivery" : "Location", value: route.delivery || fields.workLocation || "—" },
    { label: "Date(s)", value: fields.workDates || "—" },
    { label: "Duration", value: fields.duration || "—" },
    { label: "Working pattern", value: fields.workingHours || "—" },
    { label: "Valid until", value: fmtDate((quote as any)?.valid_until) },
    { label: "Amount", value: fields.costSummary || fmtMoney((quote as any)?.amount) },
  ];

  const hasCommercialContent =
    breakdownRows.length > 0 ||
    additionalEquipment.length > 0 ||
    includedItems.length > 0 ||
    cleanedNotes.length > 0 ||
    Boolean(contactRole);

  return (
    <html>
      <head>
        <title>{(quote as any)?.subject || "Quote"}</title>
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
              <div style={screenSubStyle}>{(quote as any)?.subject || client?.company_name || "Customer quote"}</div>
            </div>
            <PrintQuoteActions backHref={`/quotes/${params.id}`} />
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
              <MetaLine label="Date" value={fmtLongDate((quote as any)?.quote_date)} />
              <MetaLine label="Quote" value={(quote as any)?.subject || "—"} />
            </div>
          </div>

          <div style={summaryHeaderStyle}>
            <div style={summaryTitleStyle}>Quote</div>
            <div style={summarySubjectStyle}>{(quote as any)?.subject || client?.company_name || "Customer quote"}</div>
          </div>

          <div style={topGridStyle}>
            <Panel title="Client">
              <DataRow label="Company" value={client?.company_name ?? "—"} />
              <DataRow label="Contact name" value={fields.contactName || client?.contact_name || "—"} />
              <DataRow label="Tel" value={fields.contactPhone || client?.phone || "—"} />
              <DataRow label="Site location" value={fields.siteLocation || client?.address || "—"} />
              {contactRole ? <DataRow label="Contact role" value={contactRole} /> : null}
            </Panel>

            <Panel title="Quote details">
              {detailRows.map((row) => (
                <DataRow key={row.label} label={row.label} value={row.value} />
              ))}
            </Panel>
          </div>

          <div style={stackStyle}>
            <Panel title="To Supply">
              <div style={preLineTextStyle}>{fields.toSupply || "—"}</div>
            </Panel>

            <Panel title="Scope of Work">
              <div style={preLineTextStyle}>{fields.scopeOfWork || parsed.rawNotes || "—"}</div>
            </Panel>
          </div>
        </div>

        <div className="quote-sheet" style={sheetStyle}>
          <div style={pageHeaderStyle}>
            <div style={pageHeaderTitleStyle}>Commercial details</div>
            <div style={pageHeaderSubStyle}>{(quote as any)?.subject || client?.company_name || "Quote"}</div>
          </div>

          <div style={stackStyle}>
            {breakdownRows.length > 0 ? (
              <Panel title="Breakdown of current charges / rates">
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: 70 }}>Qty</th>
                      <th style={thStyle}>Description</th>
                      <th style={{ ...thStyle, width: 180 }}>Rate</th>
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
              </Panel>
            ) : null}

            {(additionalEquipment.length > 0 || includedItems.length > 0) ? (
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
            ) : null}

            {cleanedNotes.length > 0 ? (
              <Panel title="Additional quote notes">
                <div style={preLineTextStyle}>{cleanedNotes.join("\n")}</div>
              </Panel>
            ) : null}
          </div>

          <div style={pageHeaderStyle}>
            <div style={pageHeaderTitleStyle}>Standard terms and conditions</div>
            <div style={pageHeaderSubStyle}>Short-form hire terms and acceptance</div>
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

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
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
  gridTemplateColumns: "118px 1fr 220px",
  gap: 16,
  alignItems: "center",
  borderBottom: "2px solid #0f172a",
  paddingBottom: 10,
};

const logoBlockStyle: CSSProperties = {
  minHeight: 72,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const logoStyle: CSSProperties = {
  width: "100%",
  maxWidth: 108,
  maxHeight: 72,
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
  lineHeight: 1.35,
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

const summaryHeaderStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};

const summaryTitleStyle: CSSProperties = {
  fontSize: 27,
  fontWeight: 900,
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const summarySubjectStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#334155",
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
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
  lineHeight: 1.42,
  whiteSpace: "pre-line",
};

const preLineTextStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.48,
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
  lineHeight: 1.4,
  whiteSpace: "pre-line",
};

const smallGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const cleanListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 12.5,
  lineHeight: 1.45,
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
  lineHeight: 1.42,
};

const termsListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: "grid",
  gap: 4,
};

const termsListItemStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.42,
};

const termsNestedListItemStyle: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.38,
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
  lineHeight: 1.4,
  color: "#475569",
  textAlign: "center",
};

const longTermsStyle: CSSProperties = {
  display: "grid",
  gap: 5,
};

const longTermParagraphStyle: CSSProperties = {
  margin: 0,
  fontSize: 9.6,
  lineHeight: 1.3,
  textAlign: "left",
};

const footerTightStyle: CSSProperties = {
  marginTop: "auto",
  fontSize: 10.2,
  lineHeight: 1.3,
  color: "#475569",
  textAlign: "center",
};
