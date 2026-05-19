"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";
import {
  detectAssetAppendixPreset,
  listAssetAppendixPresetBundles,
  type AssetPresetKind,
  type AssetProfileInput,
} from "../lib/assetAppendixPresets";

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

type RenderedPreview = { pageNumber: number; file: File };

type PreparedUploadTarget = {
  bucket: string;
  path: string;
  token: string;
  file_name: string;
  content_type: string;
  page_number?: number;
};

type PreparedUploadPayload = {
  document_id: string;
  title: string;
  document_type: string;
  include_in_pack: boolean;
  appendix_order: number;
  original_file_name: string;
  original_file_type: string;
  original_file_size: number;
  preview_page_numbers: number[];
  storage_path: string;
  file_upload: PreparedUploadTarget;
  preview_uploads: PreparedUploadTarget[];
};

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

async function readJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `Request failed (${response.status}).`);
  }
}

async function loadPdf(file: File) {
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
  const pdf = await loadingTask.promise;

  return { pdf, loadingTask };
}

async function extractPdfText(file: File, maxPages = 30, maxChars = 45000) {
  const { pdf, loadingTask } = await loadPdf(file);
  const chunks: string[] = [];

  try {
    const pages = Math.min(pdf.numPages || 0, maxPages);
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = (content.items ?? [])
        .map((item: any) => String(item?.str ?? "").trim())
        .filter(Boolean)
        .join(" ");

      if (pageText) chunks.push(`Page ${pageNumber}: ${pageText}`);
      if (chunks.join("\n").length >= maxChars) break;
    }
  } finally {
    if (typeof loadingTask.destroy === "function") {
      loadingTask.destroy();
    }
  }

  return chunks.join("\n").slice(0, maxChars);
}

async function renderPreviewFiles(file: File, pageNumbers: number[]) {
  const { pdf, loadingTask } = await loadPdf(file);

  const validPages = pageNumbers.filter(
    (pageNumber) => pageNumber >= 1 && pageNumber <= pdf.numPages
  );

  if (!validPages.length) {
    throw new Error(`No valid PDF pages selected. This PDF has ${pdf.numPages} page(s).`);
  }

  const rendered: RenderedPreview[] = [];

  try {
    for (const pageNumber of validPages) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.05 });
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
          "image/jpeg",
          0.78
        );
      });

      rendered.push({
        pageNumber,
        file: new File([blob], `page-${pageNumber}.jpg`, { type: "image/jpeg" }),
      });
    }
  } finally {
    if (typeof loadingTask.destroy === "function") {
      loadingTask.destroy();
    }
  }

  return rendered;
}

async function uploadToSignedTarget(target: PreparedUploadTarget, file: File) {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage
    .from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, file);

  if (error) {
    throw new Error(error.message || `Could not upload ${file.name}.`);
  }
}

async function createDocumentWithDirectUploads({
  uploadUrl,
  file,
  title,
  documentType,
  includeInPack,
  appendixOrder,
  previewFiles,
  extractedText,
}: {
  uploadUrl: string;
  file: File;
  title: string;
  documentType: string;
  includeInPack: boolean;
  appendixOrder: number;
  previewFiles: RenderedPreview[];
  extractedText?: string;
}) {
  const initResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      document_type: documentType,
      include_in_pack: includeInPack,
      appendix_order: appendixOrder,
      original_file_name: file.name,
      original_file_type: file.type || "application/pdf",
      original_file_size: file.size,
      preview_page_numbers: previewFiles.map((item) => item.pageNumber),
      preview_uploads: previewFiles.map((item) => ({
        page_number: item.pageNumber,
        file_name: item.file.name,
        content_type: item.file.type || "image/jpeg",
      })),
    }),
  });

  const initResult = await readJsonResponse(initResponse);

  if (!initResponse.ok) {
    throw new Error(initResult?.error || `Upload preparation failed (${initResponse.status}).`);
  }

  const upload = initResult?.upload as PreparedUploadPayload | undefined;

  if (!upload?.document_id || !upload?.file_upload?.token) {
    throw new Error("Upload preparation response was incomplete.");
  }

  await uploadToSignedTarget(upload.file_upload, file);

  const previewTargets = new Map<number, PreparedUploadTarget>();
  for (const target of upload.preview_uploads ?? []) {
    if (typeof target.page_number === "number") {
      previewTargets.set(target.page_number, target);
    }
  }

  for (const preview of previewFiles) {
    const target = previewTargets.get(preview.pageNumber);
    if (!target) {
      throw new Error(`Missing upload target for preview page ${preview.pageNumber}.`);
    }
    await uploadToSignedTarget(target, preview.file);
  }

  const finalizeResponse = await fetch(`${uploadUrl}/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      document_id: upload.document_id,
      title: upload.title,
      document_type: upload.document_type,
      include_in_pack: upload.include_in_pack,
      appendix_order: upload.appendix_order,
      original_file_name: upload.original_file_name,
      original_file_type: upload.original_file_type,
      original_file_size: upload.original_file_size,
      storage_path: upload.storage_path,
      preview_page_numbers: upload.preview_page_numbers,
      preview_uploads: upload.preview_uploads.map((target) => ({
        page_number: target.page_number,
        preview_storage_path: target.path,
        preview_file_name: target.file_name,
        content_type: target.content_type,
      })),
      extracted_text: extractedText || "",
    }),
  });

  const finalizeResult = await readJsonResponse(finalizeResponse);

  if (!finalizeResponse.ok) {
    throw new Error(
      finalizeResult?.error || `Upload finalisation failed (${finalizeResponse.status}).`
    );
  }

  return finalizeResult;
}

export default function AssetDocumentManager({
  assetLabel,
  assetType,
  assetProfile,
  uploadUrl,
  deleteUrlPrefix,
  initialDocuments,
  documentTypeOptions,
}: {
  assetLabel: string;
  assetType: AssetPresetKind;
  assetProfile?: AssetProfileInput | null;
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

  const preset = useMemo(
    () => detectAssetAppendixPreset(assetType, assetProfile ?? null),
    [assetType, assetProfile]
  );

  const presetBundles = useMemo(
    () => listAssetAppendixPresetBundles(assetType, assetProfile ?? null),
    [assetType, assetProfile]
  );

  const helperText = useMemo(() => {
    if (!includeInPack) {
      return "This PDF will be stored on the asset record but not included in lift plan packs.";
    }
    return "Enter the PDF pages to pull into lift plan packs. Text from specification/load-chart PDFs is also read so future lift plans can use the latest crane data.";
  }, [includeInPack]);

  async function handleUpload(file: File) {
    setBusy(true);
    setMessage("");

    try {
      if (file.type !== "application/pdf") {
        throw new Error("Only PDF files are allowed.");
      }

      const selectedPages = includeInPack ? parsePageNumbers(pageInput || "1") : [];
      setMessage("Reading PDF text…");
      const extractedText = await extractPdfText(file);
      setMessage("Building preview pages…");
      const previewFiles = includeInPack
        ? await renderPreviewFiles(file, selectedPages.length ? selectedPages : [1])
        : [];

      const result = await createDocumentWithDirectUploads({
        uploadUrl,
        file,
        title: title.trim() || file.name.replace(/\.pdf$/i, ""),
        documentType,
        includeInPack,
        appendixOrder: Number(appendixOrder || "10") || 10,
        previewFiles,
        extractedText,
      });

      if (result?.document) {
        setDocuments((prev) => [result.document as AssetDocumentItem, ...prev]);
      }

      setTitle("");
      setDocumentType(documentTypeOptions[0]?.value ?? "spec_sheet");
      setIncludeInPack(true);
      setAppendixOrder("10");
      setPageInput("1");
      setMessage(`${assetLabel} PDF uploaded. Specification text has been saved for lift plan use.`);
    } catch (error: any) {
      setMessage(error?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAutoBundleUpload(file: File) {
    if (!preset || !presetBundles.length) {
      setMessage("No automatic appendix preset exists for this machine yet.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      if (file.type !== "application/pdf") {
        throw new Error("Only PDF files are allowed.");
      }

      const created: AssetDocumentItem[] = [];
      setMessage("Reading PDF text…");
      const extractedText = await extractPdfText(file);

      for (let index = 0; index < presetBundles.length; index += 1) {
        const bundle = presetBundles[index];
        setMessage(
          `Building ${preset.label} bundle ${index + 1} of ${presetBundles.length}: ${bundle.title}`
        );

        const previewFiles = await renderPreviewFiles(file, bundle.pages);

        const result = await createDocumentWithDirectUploads({
          uploadUrl,
          file,
          title: bundle.title,
          documentType: bundle.documentType,
          includeInPack: true,
          appendixOrder: bundle.appendixOrder,
          previewFiles,
          extractedText,
        });

        if (result?.document) {
          created.push(result.document as AssetDocumentItem);
        }
      }

      if (created.length) {
        setDocuments((prev) => [...created.reverse(), ...prev]);
      }

      setMessage(`${preset.label} default appendix bundles created. Specification text has been saved for lift plan use.`);
    } catch (error: any) {
      setMessage(error?.message || "Automatic bundle upload failed.");
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

      const result = await readJsonResponse(response);

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

      {preset ? (
        <>
          <div style={helperBox}>
            <strong>Detected machine preset:</strong> {preset.label}. Upload the full manual once
            and the default appendix bundles will be created automatically.
          </div>
          <div style={autoBox}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900 }}>Automatic appendix bundles</div>
              <div style={{ fontSize: 13, opacity: 0.78 }}>
                {presetBundles
                  .map((bundle) => `${bundle.title} (pages ${bundle.pages.join(",")})`)
                  .join(" • ")}
              </div>
            </div>
            <div>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleAutoBundleUpload(file);
                  e.currentTarget.value = "";
                }}
                disabled={busy}
                style={inputStyle}
              />
            </div>
          </div>
        </>
      ) : null}

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

        <Field label="Manual / one-off upload">
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
                  {doc.preview_page_numbers.length ? doc.preview_page_numbers.join(", ") : "—"} •
                  {" "}Generated preview pages: {doc.preview_count}
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
  children: ReactNode;
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

const autoBox: CSSProperties = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.38)",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "grid",
  gap: 12,
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
