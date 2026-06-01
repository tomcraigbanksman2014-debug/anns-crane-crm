"use client";

import { useEffect, useMemo, useState } from "react";

type AgreementKind = "cpa-hire" | "contract-lift" | "transport";

type AgreementField = {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
};

type AgreementRateLine = {
  id: string;
  qty: string;
  description: string;
  rate: string;
};

type HireAgreementPackProps = {
  kind: AgreementKind;
  jobLabel: string;
  backHref: string;
  switchLinks?: { label: string; href: string; active?: boolean }[];
  initialFields: AgreementField[];
  initialSupply: string;
  initialRateLines: AgreementRateLine[];
  initialAdditionalTerms: string;
  termsImageUrls: string[];
  termsLabel: string;
  documentFileName?: string;
};

const COMPANY_FOOTER =
  "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB, tel: 01792 641653, e-mail: info@annscranehire.co.uk,";

const KIND_LABELS: Record<AgreementKind, string> = {
  "cpa-hire": "CPA Hire Agreement",
  "contract-lift": "Contract Lift Hire Agreement",
  transport: "Transport Hire Agreement",
};

function fieldValue(fields: AgreementField[], key: string) {
  return fields.find((field) => field.key === key)?.value ?? "";
}

function updateField(fields: AgreementField[], key: string, value: string) {
  return fields.map((field) => (field.key === key ? { ...field, value } : field));
}

function splitLines(value: string) {
  return String(value ?? "")
    .split(/\r?\n/g)
    .map((line) => line.trimEnd());
}

function addBlankRateLine(lines: AgreementRateLine[]) {
  return [
    ...lines,
    {
      id: `line-${Date.now()}-${lines.length + 1}`,
      qty: "",
      description: "",
      rate: "",
    },
  ];
}

function safeLine(line: AgreementRateLine) {
  return Boolean(line.qty.trim() || line.description.trim() || line.rate.trim());
}

function sanitizeDocumentTitle(value: string) {
  return String(value || "Hire Agreement")
    .replace(/[\\/:*?"<>|#%{}~&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Hire Agreement";
}

function fallbackTermsUrls(url: string) {
  const legacy: Record<string, string[]> = {
    "/hire-agreement-terms/cpa-hire-terms-page-1.png": ["/cpa-hire-terms-page-1(1).png"],
    "/hire-agreement-terms/cpa-hire-terms-page-2.png": ["/cpa-hire-terms-page-2(1).png"],
    "/hire-agreement-terms/cpa-hire-terms-page-3.png": ["/cpa-hire-terms-page-3(1)%20(1).png", "/cpa-hire-terms-page-3(1) (1).png"],
    "/hire-agreement-terms/contract-lift-terms-page-1.png": ["/contract-lift-terms-page-1(1)%20(1).png", "/contract-lift-terms-page-1(1) (1).png"],
    "/hire-agreement-terms/contract-lift-terms-page-2.png": ["/contract-lift-terms-page-2(1)%20(1).png", "/contract-lift-terms-page-2(1) (1).png"],
    "/hire-agreement-terms/contract-lift-terms-page-3.png": ["/contract-lift-terms-page-3(1)%20(1).png", "/contract-lift-terms-page-3(1) (1).png"],
    "/hire-agreement-terms/transport-rha-terms-page-1.png": ["/transport-rha-terms-page-1(1)%20(1).png", "/transport-rha-terms-page-1(1) (1).png"],
    "/hire-agreement-terms/transport-rha-terms-page-2.png": ["/transport-rha-terms-page-2(1)%20(1).png", "/transport-rha-terms-page-2(1) (1).png"],
    "/hire-agreement-terms/transport-rha-terms-page-3.png": ["/transport-rha-terms-page-3(1)%20(1).png", "/transport-rha-terms-page-3(1) (1).png"],
  };
  return [url, ...(legacy[url] || [])];
}

function TermsImage({ url, alt }: { url: string; alt: string }) {
  const candidates = useMemo(() => fallbackTermsUrls(url), [url]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const src = candidates[Math.min(candidateIndex, candidates.length - 1)];

  useEffect(() => {
    setCandidateIndex(0);
  }, [url]);

  return (
    <img
      src={src}
      alt={alt}
      loading="eager"
      decoding="sync"
      style={termsImageStyle}
      onError={() => {
        setCandidateIndex((current) => (current + 1 < candidates.length ? current + 1 : current));
      }}
    />
  );
}

async function waitForImagesInDocument(doc: Document, selector = "img") {
  const images = Array.from(doc.querySelectorAll<HTMLImageElement>(selector));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete && image.naturalWidth > 0) {
            resolve();
            return;
          }
          const finish = () => resolve();
          const timer = window.setTimeout(finish, 5000);
          image.addEventListener(
            "load",
            () => {
              window.clearTimeout(timer);
              finish();
            },
            { once: true }
          );
          image.addEventListener(
            "error",
            () => {
              window.clearTimeout(timer);
              finish();
            },
            { once: true }
          );
        })
    )
  );
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


export default function HireAgreementPack({
  kind,
  jobLabel,
  backHref,
  switchLinks = [],
  initialFields,
  initialSupply,
  initialRateLines,
  initialAdditionalTerms,
  termsImageUrls,
  termsLabel,
  documentFileName,
}: HireAgreementPackProps) {
  const [fields, setFields] = useState<AgreementField[]>(initialFields);
  const [supplyText, setSupplyText] = useState(initialSupply);
  const [rateLines, setRateLines] = useState<AgreementRateLine[]>(
    initialRateLines.length ? initialRateLines : [{ id: "line-1", qty: "1x", description: "Rate", rate: "" }]
  );
  const [additionalTerms, setAdditionalTerms] = useState(initialAdditionalTerms);
  const title = KIND_LABELS[kind];

  const safeDocumentTitle = useMemo(
    () => sanitizeDocumentTitle(documentFileName || `${fieldValue(fields, "client") || "Customer"} - ${jobLabel} - ${title}`),
    [documentFileName, fields, jobLabel, title]
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = safeDocumentTitle;
  }, [safeDocumentTitle]);

  async function handlePrint() {
    if (typeof document === "undefined") return;

    const printRoot = document.querySelector<HTMLElement>(".hire-print-root");
    if (!printRoot) {
      window.print();
      return;
    }

    await waitForImagesInDocument(document, ".hire-print-root img");

    const existingFrame = document.getElementById("hire-agreement-print-frame");
    if (existingFrame) existingFrame.remove();

    const frame = document.createElement("iframe");
    frame.id = "hire-agreement-print-frame";
    frame.title = safeDocumentTitle;
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    document.body.appendChild(frame);

    const printDoc = frame.contentDocument || frame.contentWindow?.document;
    const printWindow = frame.contentWindow;
    if (!printDoc || !printWindow) {
      frame.remove();
      window.print();
      return;
    }

    const printHtml = printRoot.outerHTML;
    const baseHref = typeof window !== "undefined" ? `${window.location.origin}/` : "/";
    printDoc.open();
    printDoc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base href="${escapeHtml(baseHref)}" />
<title>${escapeHtml(safeDocumentTitle)}</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; width: 210mm; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, Helvetica, sans-serif; }
  .hire-print-root { display: block !important; width: 210mm !important; margin: 0 auto !important; padding: 0 !important; gap: 0 !important; }
  .hire-page {
    width: 210mm !important;
    height: 297mm !important;
    min-height: 0 !important;
    margin: 0 auto !important;
    box-shadow: none !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    background: #fff !important;
  }
  .hire-front-page {
    padding: 6mm 9mm 6mm !important;
    font-size: 9.2px !important;
    line-height: 1.12 !important;
  }
  .hire-front-page table { page-break-inside: avoid !important; break-inside: avoid !important; }
  .hire-front-page th,
  .hire-front-page td { padding: 2.6px 4px !important; line-height: 1.1 !important; }
  .hire-front-page h1 { margin: 2mm 0 4mm !important; font-size: 24px !important; }
  .hire-front-page .hire-logo { width: 88px !important; height: auto !important; }
  .hire-front-page .hire-top-line { margin-bottom: 4mm !important; }
  .hire-front-page .hire-rates-table { margin-top: 2.5mm !important; }
  .hire-front-page .hire-terms-box {
    margin-top: 2.5mm !important;
    padding: 4px !important;
    font-size: 6.9px !important;
    line-height: 1.02 !important;
    max-height: 42mm !important;
    overflow: hidden !important;
  }
  .hire-front-page .hire-signature-table { margin-top: 2.5mm !important; }
  .hire-front-page .hire-signature-line { height: 18px !important; font-size: 9px !important; letter-spacing: 1px !important; }
  .hire-front-page .hire-footer { margin-top: 2mm !important; font-size: 7.8px !important; line-height: 1.1 !important; }
  .terms-page {
    height: 297mm !important;
    padding: 6mm 8mm !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .terms-page img {
    width: auto !important;
    height: auto !important;
    max-width: 194mm !important;
    max-height: 283mm !important;
    object-fit: contain !important;
    display: block !important;
    margin: 0 auto !important;
  }
  .hire-page:last-child { page-break-after: auto !important; break-after: auto !important; }
</style>
</head>
<body>${printHtml}</body>
</html>`);
    printDoc.close();

    await waitForImagesInDocument(printDoc, "img");

    let removed = false;
    const removeFrame = () => {
      if (removed) return;
      removed = true;
      window.setTimeout(() => frame.remove(), 500);
    };

    printWindow.onafterprint = removeFrame;
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
      window.setTimeout(removeFrame, 30000);
    }, 250);
  }

  const visibleRateLines = useMemo(() => {
    const nonEmpty = rateLines.filter(safeLine);
    return nonEmpty.length ? nonEmpty : [{ id: "empty", qty: "", description: "", rate: "" }];
  }, [rateLines]);

  const client = fieldValue(fields, "client");
  const issueDate = fieldValue(fields, "issueDate");
  const projectDate = fieldValue(fields, "projectDate");
  const contactName = fieldValue(fields, "contactName");
  const contactDetails = fieldValue(fields, "contactDetails");
  const siteAddress = fieldValue(fields, "siteAddress");
  const collectionAddress = fieldValue(fields, "collectionAddress");
  const deliveryAddress = fieldValue(fields, "deliveryAddress");
  const hireType = fieldValue(fields, "hireType");
  const poNumber = fieldValue(fields, "poNumber");
  const paymentTerms = fieldValue(fields, "paymentTerms");

  function setRateLine(index: number, key: keyof AgreementRateLine, value: string) {
    setRateLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, [key]: value } : line)));
  }

  return (
    <div style={pageWrap}>
      <style>{printCss}</style>

      <div className="no-print" style={toolbarStyle}>
        <a href={backHref} style={secondaryButton}>
          ← Back
        </a>
        {switchLinks.map((link) => (
          <a key={link.href} href={link.href} style={link.active ? primaryButton : secondaryButton}>
            {link.label}
          </a>
        ))}
        <button type="button" onClick={handlePrint} style={primaryButton}>
          Print / save PDF
        </button>
      </div>

      <div className="no-print" style={fileNameNoticeStyle}>
        PDF filename should default to: <strong>{safeDocumentTitle}</strong>
      </div>

      <div className="no-print" style={editorCard}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>{title}</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.72 }}>
            Generated from {jobLabel}. Edit any field below before printing. The terms pages are fixed images copied from the supplied examples so the wording is preserved exactly.
          </p>
        </div>

        <div style={editorGrid}>
          {fields.map((field) => (
            <label key={field.key} style={labelStyle}>
              {field.label}
              {field.multiline ? (
                <textarea
                  value={field.value}
                  onChange={(event) => setFields((prev) => updateField(prev, field.key, event.target.value))}
                  rows={field.key.includes("Address") ? 4 : 3}
                  style={textareaStyle}
                />
              ) : (
                <input
                  value={field.value}
                  onChange={(event) => setFields((prev) => updateField(prev, field.key, event.target.value))}
                  style={inputStyle}
                />
              )}
            </label>
          ))}
        </div>

        <label style={labelStyle}>
          To supply / scope of work
          <textarea value={supplyText} onChange={(event) => setSupplyText(event.target.value)} rows={5} style={textareaStyle} />
        </label>

        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Rates / charge lines</h2>
            <button type="button" onClick={() => setRateLines((prev) => addBlankRateLine(prev))} style={secondaryButton}>
              Add line
            </button>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {rateLines.map((line, index) => (
              <div key={line.id} style={rateEditorGrid}>
                <input value={line.qty} onChange={(event) => setRateLine(index, "qty", event.target.value)} placeholder="Qty" style={inputStyle} />
                <input
                  value={line.description}
                  onChange={(event) => setRateLine(index, "description", event.target.value)}
                  placeholder="Description"
                  style={inputStyle}
                />
                <input value={line.rate} onChange={(event) => setRateLine(index, "rate", event.target.value)} placeholder="Rate" style={inputStyle} />
              </div>
            ))}
          </div>
        </div>

        <label style={{ ...labelStyle, marginTop: 16 }}>
          Additional visible terms on page 1
          <textarea value={additionalTerms} onChange={(event) => setAdditionalTerms(event.target.value)} rows={8} style={textareaStyle} />
        </label>
      </div>

      <div className="hire-print-root" style={printRootStyle}>
        <section className="hire-page hire-front-page" style={hirePageStyle}>
          <div className="hire-top-line" style={topLineStyle}>
            <img className="hire-logo" src="/logo.png" alt="AnnS Crane Hire" style={{ width: 96, height: "auto" }} />
            <div style={{ textAlign: "right", fontWeight: 700 }}>{issueDate}</div>
          </div>

          <h1 className="hire-document-title" style={documentTitleStyle}>HIRE AGREEMENT</h1>

          <table style={mainTableStyle}>
            <tbody>
              <tr>
                <th style={thStyle}>Client:</th>
                <td style={tdStyle}>{client}</td>
                <th style={thStyle}>Date & Time of Project:</th>
                <td style={tdStyle}>{projectDate}</td>
              </tr>
              <tr>
                <th style={thStyle}>Contact Name:</th>
                <td style={tdStyle}>{contactName}</td>
                <th style={thStyle}>{kind === "transport" ? "email / Tel:" : "Tel:"}</th>
                <td style={tdStyle}>{contactDetails}</td>
              </tr>
              {kind === "transport" ? (
                <>
                  <tr>
                    <th style={thStyle}>Collection Address:</th>
                    <td colSpan={3} style={tdStyle}>{splitLines(collectionAddress).map((line, index) => <div key={index}>{line || "\u00a0"}</div>)}</td>
                  </tr>
                  <tr>
                    <th style={thStyle}>Delivery Address:</th>
                    <td colSpan={3} style={tdStyle}>{splitLines(deliveryAddress).map((line, index) => <div key={index}>{line || "\u00a0"}</div>)}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <th style={thStyle}>Site Location:</th>
                  <td colSpan={3} style={tdStyle}>{splitLines(siteAddress).map((line, index) => <div key={index}>{line || "\u00a0"}</div>)}</td>
                </tr>
              )}
              <tr>
                <th style={thStyle}>Hire Type:</th>
                <td colSpan={3} style={tdStyle}>{hireType}</td>
              </tr>
            </tbody>
          </table>

          <table style={{ ...mainTableStyle, marginTop: 10 }}>
            <tbody>
              <tr>
                <th style={{ ...thStyle, width: "22%" }}>To Supply:</th>
                <td style={tdStyle}>{splitLines(supplyText).map((line, index) => <div key={index}>{line || "\u00a0"}</div>)}</td>
              </tr>
            </tbody>
          </table>

          <table className="hire-rates-table" style={{ ...mainTableStyle, marginTop: 7 }}>
            <thead>
              <tr>
                <th colSpan={3} style={thStyle}>Rates</th>
              </tr>
              <tr>
                <th style={{ ...thStyle, width: 70 }}>Qty</th>
                <th style={thStyle}>Description</th>
                <th style={{ ...thStyle, width: 210 }}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {visibleRateLines.map((line) => (
                <tr key={line.id}>
                  <td style={tdStyle}>{line.qty}</td>
                  <td style={tdStyle}>{line.description}</td>
                  <td style={tdStyle}>{line.rate}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={vatNoticeStyle}>ALL RATES ARE EXCLUDING VAT AND BASED ON WEEKDAY WORKING</div>

          <div className="hire-terms-box" style={termsBoxStyle}>
            {splitLines(additionalTerms).map((line, index) => (
              <div key={index}>{line || "\u00a0"}</div>
            ))}
          </div>

          <table className="hire-signature-table" style={{ ...mainTableStyle, marginTop: 7 }}>
            <tbody>
              <tr>
                <th colSpan={4} style={{ ...thStyle, fontSize: 12 }}>PLEASE SIGN BELOW AND RETURN TO info@annscranehire.co.uk:</th>
              </tr>
              <tr>
                <th colSpan={4} style={thStyle}>FOR AND ON BEHALF OF:</th>
              </tr>
              <tr>
                <td className="hire-signature-line" colSpan={4} style={{ ...tdStyle, height: 24, letterSpacing: 1.1, fontSize: 9.5 }}>
                  N_a_m_e_:______________________ S_i_g_n_e_d_:___________________ D_a_t_e_:______________________
                </td>
              </tr>
              <tr>
                <th style={thStyle}>Purchase Order No:</th>
                <td style={tdStyle}>{poNumber}</td>
                <th style={thStyle}>PAYMENT TERMS:</th>
                <td style={tdStyle}>{paymentTerms}</td>
              </tr>
            </tbody>
          </table>

          <div className="hire-footer" style={footerStyle}>{COMPANY_FOOTER}</div>
        </section>

        {termsImageUrls.map((url, index) => (
          <section key={url} className="hire-page terms-page" style={termsPageStyle}>
            <TermsImage url={url} alt={`${termsLabel} page ${index + 1}`} />
          </section>
        ))}
      </div>
    </div>
  );
}

const pageWrap: React.CSSProperties = {
  width: "min(1420px, 100%)",
  margin: "0 auto",
  padding: "0 0 32px",
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 14,
};

const primaryButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #0f172a",
  padding: "10px 14px",
  fontWeight: 800,
  textDecoration: "none",
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  background: "#fff",
  color: "#0f172a",
  border: "1px solid #d1d5db",
  padding: "10px 14px",
  fontWeight: 800,
  textDecoration: "none",
  cursor: "pointer",
};


const fileNameNoticeStyle: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1e3a8a",
  borderRadius: 12,
  padding: "10px 12px",
  marginBottom: 12,
  fontSize: 13,
  fontWeight: 700,
};

const editorCard: React.CSSProperties = {
  border: "1px solid #dbeafe",
  background: "#ffffff",
  borderRadius: 16,
  padding: 16,
  marginBottom: 18,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
};

const editorGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const rateEditorGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "90px minmax(180px, 1fr) minmax(160px, 260px)",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 800,
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 11px",
  fontSize: 14,
  fontWeight: 600,
  width: "100%",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 76,
  resize: "vertical",
  fontFamily: "inherit",
};

const printRootStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
};

const hirePageStyle: React.CSSProperties = {
  width: "210mm",
  minHeight: "297mm",
  margin: "0 auto",
  background: "#fff",
  color: "#111827",
  padding: "8mm 10mm 7mm",
  boxSizing: "border-box",
  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.16)",
  position: "relative",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: 9.8,
};

const topLineStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 8,
};

const documentTitleStyle: React.CSSProperties = {
  margin: "3px 0 10px",
  textAlign: "center",
  fontSize: 26,
  lineHeight: 1.05,
  fontWeight: 900,
  textTransform: "uppercase",
};

const mainTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const thStyle: React.CSSProperties = {
  border: "1px solid #111827",
  padding: "3px 5px",
  textAlign: "left",
  verticalAlign: "top",
  fontWeight: 900,
  background: "#fff",
};

const tdStyle: React.CSSProperties = {
  border: "1px solid #111827",
  padding: "3px 5px",
  textAlign: "left",
  verticalAlign: "top",
  whiteSpace: "pre-wrap",
};

const vatNoticeStyle: React.CSSProperties = {
  border: "1px solid #111827",
  borderTop: 0,
  textAlign: "center",
  padding: "4px 8px",
  fontWeight: 900,
};

const termsBoxStyle: React.CSSProperties = {
  border: "1px solid #111827",
  marginTop: 7,
  padding: 5,
  fontSize: 7.1,
  lineHeight: 1.04,
  whiteSpace: "pre-wrap",
  maxHeight: "45mm",
  overflow: "hidden",
};

const footerStyle: React.CSSProperties = {
  marginTop: 5,
  textAlign: "center",
  fontSize: 8.5,
};

const termsPageStyle: React.CSSProperties = {
  ...hirePageStyle,
  padding: "7mm 8mm",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const termsImageStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "194mm",
  maxHeight: "283mm",
  height: "auto",
  objectFit: "contain",
  display: "block",
};

const printCss = `
@page { size: A4; margin: 0; }
@media (max-width: 760px) {
  .hire-print-root { overflow-x: auto; }
}
@media print {
  .no-print { display: none !important; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    width: 210mm !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body * { visibility: hidden !important; }
  .hire-print-root, .hire-print-root * { visibility: visible !important; }
  .hire-print-root {
    position: static !important;
    display: block !important;
    width: 210mm !important;
    margin: 0 auto !important;
    padding: 0 !important;
    gap: 0 !important;
    overflow: visible !important;
  }
  .hire-page {
    width: 210mm !important;
    height: 297mm !important;
    min-height: 0 !important;
    margin: 0 auto !important;
    box-shadow: none !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    background: #fff !important;
  }
  .hire-front-page {
    padding: 6mm 9mm 6mm !important;
    font-size: 9.2px !important;
    line-height: 1.12 !important;
  }
  .hire-front-page table { page-break-inside: avoid !important; break-inside: avoid !important; }
  .hire-front-page th,
  .hire-front-page td { padding: 2.6px 4px !important; line-height: 1.1 !important; }
  .hire-front-page h1 { margin: 2mm 0 4mm !important; font-size: 24px !important; }
  .hire-front-page .hire-logo { width: 88px !important; height: auto !important; }
  .hire-front-page .hire-top-line { margin-bottom: 4mm !important; }
  .hire-front-page .hire-rates-table { margin-top: 2.5mm !important; }
  .hire-front-page .hire-terms-box {
    margin-top: 2.5mm !important;
    padding: 4px !important;
    font-size: 6.9px !important;
    line-height: 1.02 !important;
    max-height: 42mm !important;
    overflow: hidden !important;
  }
  .hire-front-page .hire-signature-table { margin-top: 2.5mm !important; }
  .hire-front-page .hire-signature-line { height: 18px !important; font-size: 9px !important; letter-spacing: 1px !important; }
  .hire-front-page .hire-footer { margin-top: 2mm !important; font-size: 7.8px !important; line-height: 1.1 !important; }
  .terms-page {
    height: 297mm !important;
    padding: 6mm 8mm !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .terms-page img {
    width: auto !important;
    height: auto !important;
    max-width: 194mm !important;
    max-height: 283mm !important;
    object-fit: contain !important;
    display: block !important;
    margin: 0 auto !important;
  }
  .hire-page:last-child { page-break-after: auto !important; break-after: auto !important; }
}
`;
