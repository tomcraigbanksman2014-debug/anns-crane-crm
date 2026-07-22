"use client";

import { useEffect, useMemo, useState } from "react";

type PreviewDocument = {
  id: string;
  name: string;
  url: string;
  mimeType?: string | null;
};

export default function DocumentPreviewModal({ document }: { document: PreviewDocument }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const previewType = useMemo(() => {
    const mime = String(document.mimeType || "").toLowerCase();
    const name = document.name.toLowerCase();
    if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)) return "image";
    if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
    return "other";
  }, [document.mimeType, document.name]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={openButton}>Open</button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label={`Preview ${document.name}`} style={backdrop} onMouseDown={() => setOpen(false)}>
          <div style={modalCard} onMouseDown={(event) => event.stopPropagation()}>
            <div style={header}>
              <div style={{ minWidth: 0 }}>
                <div style={title}>{document.name}</div>
                <div style={subtitle}>Secure document preview</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <a href={document.url} download={document.name} style={downloadButton}>Download</a>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close preview" style={closeButton}>×</button>
              </div>
            </div>
            <div style={previewArea}>
              {previewType === "image" ? (
                <img src={document.url} alt={document.name} style={imageStyle} />
              ) : previewType === "pdf" ? (
                <iframe src={document.url} title={document.name} style={frameStyle} />
              ) : (
                <div style={fallback}>
                  <p style={{ marginTop: 0 }}>This file type cannot be previewed inside the CRM.</p>
                  <a href={document.url} target="_blank" rel="noreferrer" style={downloadButton}>Open in a new tab</a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const openButton: React.CSSProperties = {
  border: 0,
  borderRadius: 9,
  padding: "8px 11px",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};
const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  background: "rgba(0,0,0,.72)",
  padding: "min(3vw,28px)",
  display: "grid",
  placeItems: "center",
};
const modalCard: React.CSSProperties = {
  width: "min(1200px,96vw)",
  height: "min(900px,94vh)",
  background: "#eef5fb",
  borderRadius: 16,
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "auto minmax(0,1fr)",
  boxShadow: "0 24px 80px rgba(0,0,0,.45)",
};
const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "14px 16px",
  borderBottom: "1px solid rgba(0,0,0,.12)",
  background: "#fff",
};
const title: React.CSSProperties = { fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const subtitle: React.CSSProperties = { marginTop: 3, fontSize: 12, opacity: .68 };
const closeButton: React.CSSProperties = { width: 38, height: 38, borderRadius: 10, border: "1px solid rgba(0,0,0,.12)", background: "#fff", fontSize: 28, lineHeight: 1, cursor: "pointer" };
const downloadButton: React.CSSProperties = { display: "inline-block", padding: "9px 12px", borderRadius: 9, textDecoration: "none", background: "#111", color: "#fff", fontWeight: 900 };
const previewArea: React.CSSProperties = { minHeight: 0, overflow: "auto", display: "grid", placeItems: "center", padding: 12 };
const imageStyle: React.CSSProperties = { display: "block", maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 };
const frameStyle: React.CSSProperties = { width: "100%", height: "100%", minHeight: 500, border: 0, background: "#fff", borderRadius: 8 };
const fallback: React.CSSProperties = { textAlign: "center", background: "#fff", borderRadius: 12, padding: 24, maxWidth: 520 };
