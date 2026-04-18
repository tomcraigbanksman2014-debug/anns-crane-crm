"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

export type AssetDocumentItem = {
  id: string;
  title: string;
  document_type: string;
  file_name: string | null;
  uploaded_at: string | null;
  include_in_pack: boolean;
  appendix_order: number | null;
  preview_page_numbers: number[];
  preview_count: number;
  open_url: string | null;
};

type Option = { value: string; label: string };

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function parsePageNumbers(input: string) {
  const values = input
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.trunc(item));

  return Array.from(new Set(values)).sort((a, b) => a - b);
}

async function renderPreviewFiles(file: File, pageNumbers: number[]) {
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  }

  const data = new Uint8Array(await file.arrayBuffer());

  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const validPages = pageNumbers.filter(
    (pageNumber) => pageNumber >= 1 && pageNumber <= pdf.numPages
  );

  if (!validPages.length) {
    throw new Error(`No valid PDF pages selected. This PDF has ${pdf.numPages} page(s).`);
  }

  const rendered: Array<{ pageNumber: number; file: File }> = [];

  for (const pageNumber of validPages) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create a canvas context for PDF preview rendering.");
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) resolve(value);
          else reject(new Error(`Could not render PDF page ${pageNumber}.`));
        },
        "image/png",
        0.92
      );
    });

    rendered.push({
      pageNumber,
      file: new File([blob], `page-${pageNumber}.png`, { type: "image/png" }),
    });
  }

  if (typeof loadingTask.destroy === "function") {
    loadingTask.destroy();
  }

  return rendered;
}

export default function AssetDocumentManager({
  assetLabel,
  uploadUrl,
  deleteUrlPrefix,
  initialDocuments,
  documentTypeOptions,
}: {
  assetLabel: string;
  uploadUrl: string;
  deleteUrlPrefix: string;
  initialDocuments: AssetDocumentItem[];
  documentTypeOptions: Option[];
}) {
  const [documents, setDocuments] = useState<AssetDocumentItem[]>(initialDocuments ?? []);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState(documentTypeOptions[0]?.value ?? "spec_sheet");
  const [includeInPack, setIncludeInPack] = useState(true);
  const [appendixOrder, setAppendixOrder] = useState("10");
  const [pageInput, setPageInput] = useState("1");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const helperText = useMemo(() => {
    if (!includeInPack) {
      return "This PDF will be stored on the asset record but not included in lift plan packs.";
    }
    return "Enter the page numbers the CRM should pull from the uploaded PDF, e.g. 1 or 2,5.";
  }, [includeInPack]);

  async function handleUpload(file: File) {
    setBusy(true);
    setMessage("");

    try {
      if (file.type !== "application/pdf") {
        throw new Error("Only PDF files are allowed.");
      }

      const selectedPages = includeInPack ? parsePageNumbers(pageInput || "1") : [];
      const previewFiles = includeInPack
        ? await renderPreviewFiles(file, selectedPages.length ? selectedPages : [1])
        : [];

      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title.trim() || file.name.replace(/\.pdf$/i, ""));
      formData.append("document_type", documentType);
      formData.append("include_in_pack", includeInPack ? "true" : "false");
      formData.append("appendix_order", appendixOrder.trim() || "10");

      // IMPORTANT: backend expects plain comma string, not JSON
      formData.append(
        "preview_page_numbers",
        previewFiles.map((item) => item.pageNumber).join(",")
      );

      for (const preview of previewFiles) {
        formData.append("preview_files", preview.file, preview.file.name);
      }

      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Upload failed.");
      }

      if (result?.document) {
        setDocuments((prev) => [result.document as AssetDocumentItem, ...prev]);
      }

      setTitle("");
      setDocumentType(documentTypeOptions[0]?.value ?? "spec_sheet");
      setIncludeInPack(true);
      setAppendixOrder("10");
      setPageInput("1");
      setMessage(`${assetLabel} PDF uploaded.`);
    } catch (error: any) {
      setMessage(error?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = window.confirm("Delete this PDF and its generated appendix previews?");
    if (!ok) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`${deleteUrlPrefix}/${id}/delete`, {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Delete failed.");
      }

      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      setMessage("Document deleted.");
    } catch (error: any) {
      setMessage(error?.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={sectionTitle}>Asset PDFs</h2>

      {message ? <div style={messageBox}>{message}</div> : null}

      <div style={helperBox}>{helperText}</div>

      <div style={uploadGrid}>
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
            placeholder={`e.g. ${assetLabel} spec sheet`}
          />
        </Field>

        <Field label="Document type">
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            style={inputStyle}
          >
            {documentTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Appendix order">
          <input
            value={appendixOrder}
            onChange={(e) => setAppendixOrder(e.target.value)}
            style={inputStyle}
            inputMode="numeric"
            placeholder="10"
          />
        </Field>

        <Field label="PDF pages to pull into the pack">
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            style={inputStyle}
            placeholder="1 or 2,5"
            disabled={!includeInPack}
          />
        </Field>

        <div style={{ display: "grid", gap: 6, alignContent: "end" }}>
          <label style={labelStyle}>
            <input
              type="checkbox"
              checked={includeInPack}
              onChange={(e) => setIncludeInPack(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Include in lift plan packs
          </label>
        </div>

        <Field label="Upload PDF">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.currentTarget.value = "";
            }}
            disabled={busy}
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {documents.length === 0 ? (
          <div style={emptyBox}>No asset PDFs uploaded yet.</div>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} style={docRow}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900 }}>{doc.title}</div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                  {doc.document_type} • {fmtDate(doc.uploaded_at)}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                  Include in pack: {doc.include_in_pack ? "Yes" : "No"} • Appendix order:{" "}
                  {doc.appendix_order ?? "—"} • Preview pages:{" "}
                  {doc.preview_page_numbers.length ? doc.preview_page_numbers.join(", ") : "—"} •{" "}
                  Generated preview pages: {doc.preview_count}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {doc.open_url ? (
                  <a href={doc.open_url} target="_blank" rel="noreferrer" style={secondaryBtn}>
                    Open PDF
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleDelete(doc.id)}
                  style={dangerBtn}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const uploadGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const helperBox: CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  lineHeight: 1.5,
};

const messageBox: CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,128,0,0.10)",
  border: "1px solid rgba(0,128,0,0.18)",
  lineHeight: 1.4,
};

const docRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.48)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const emptyBox: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const secondaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const dangerBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  background: "#8b1e1e",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
};
