"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type SelectedUploadItem = {
  id: string;
  file: File;
  previewUrl: string | null;
};

function makeItem(file: File): SelectedUploadItem {
  const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
  const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
  return { id, file, previewUrl };
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileBadgeLabel(file: File) {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (name.endsWith(".doc") || name.endsWith(".docx")) return "WORD";
  if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "EXCEL";
  if (name.endsWith(".dwg") || name.endsWith(".dxf")) return "CAD";
  if (name.endsWith(".txt") || name.endsWith(".rtf")) return "TEXT";
  return "FILE";
}

const acceptedUploadTypes = [
  "image/*",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".rtf",
  ".dwg",
  ".dxf",
].join(",");

export default function DocumentUploadForm({
  jobId,
  allowShareWithOperator = true,
}: {
  jobId: string;
  allowShareWithOperator?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<SelectedUploadItem[]>([]);
  const itemsRef = useRef<SelectedUploadItem[]>([]);
  const [documentType, setDocumentType] = useState("site_drawing");
  const [shareWithOperator, setShareWithOperator] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  function clearSelectedFiles() {
    for (const item of items) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    setItems([]);
    const input = document.getElementById("job-doc-upload") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  function handleFileChange(files: FileList | null) {
    clearSelectedFiles();
    const next = Array.from(files ?? []).map(makeItem);
    setItems(next);
    setMessage(next.length ? "Move drawings, images and documents into the order you want them to appear before uploading." : null);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const found = prev.find((item) => item.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  function moveItem(id: string, direction: -1 | 1) {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!items.length) {
      setMessage("Please choose one or more files.");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      items.forEach((item, index) => {
        formData.append("files", item.file);
        formData.append("file_order", String(index + 1));
      });
      formData.append("document_type", documentType);
      if (allowShareWithOperator) {
        formData.append("share_with_operator", shareWithOperator ? "true" : "false");
      }

      const res = await fetch(`/api/jobs/${jobId}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data?.error || "Could not upload documents.");
        return;
      }

      const uploadedCount = Number(data?.count ?? items.length);
      clearSelectedFiles();
      setDocumentType("site_drawing");
      setShareWithOperator(false);

      setMessage(uploadedCount === 1 ? "Document uploaded." : `${uploadedCount} documents uploaded in the selected order.`);
      router.refresh();
    } catch {
      setMessage("Could not upload documents.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={helperBox}>
          Upload site sketches, crane position drawings, lift diagrams, photos, RAMS, Word/Excel files, CAD files and other lift plan documents.
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.78 }}>
            You can select multiple images, PDFs, Word/Excel files, text files or DWG/DXF drawings at the same time. Image uploads on this page are appended into the full lift plan pack as extra appendix pages.
          </div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.78 }}>
            For site drawings/photos/documents, move them into the order you want before clicking upload. That order will be used in the lift plan appendix/document list.
          </div>
        </div>

        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          style={selectStyle}
        >
          <option value="site_drawing">Site Drawing / Appendix Page</option>
          <option value="photo">Photo / Diagram</option>
          <option value="lift_plan">Lift Plan</option>
          <option value="rams">RAMS</option>
          <option value="delivery_note">Delivery Note</option>
          <option value="other">Other</option>
        </select>

        <input
          id="job-doc-upload"
          type="file"
          multiple
          accept={acceptedUploadTypes}
          onChange={(e) => handleFileChange(e.target.files)}
          style={inputStyle}
        />

        {items.length > 0 ? (
          <div style={previewPanel}>
            <div style={previewHeader}>
              <strong>{items.length} file{items.length === 1 ? "" : "s"} selected</strong>
              <button type="button" onClick={clearSelectedFiles} disabled={uploading} style={smallGhostBtn}>Clear all</button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {items.map((item, index) => (
                <div key={item.id} style={previewRow}>
                  <div style={previewThumb}>
                    {item.previewUrl ? (
                      <img src={item.previewUrl} alt={item.file.name} style={previewImage} />
                    ) : (
                      <div style={fileBadge}>{fileBadgeLabel(item.file)}</div>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={fileName}>{index + 1}. {item.file.name}</div>
                    <div style={fileMeta}>{item.file.type || "Unknown type"} {formatFileSize(item.file.size) ? `• ${formatFileSize(item.file.size)}` : ""}</div>
                  </div>
                  <div style={orderButtons}>
                    <button type="button" onClick={() => moveItem(item.id, -1)} disabled={uploading || index === 0} style={smallBtn}>Up</button>
                    <button type="button" onClick={() => moveItem(item.id, 1)} disabled={uploading || index === items.length - 1} style={smallBtn}>Down</button>
                    <button type="button" onClick={() => removeItem(item.id)} disabled={uploading} style={dangerBtn}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {allowShareWithOperator ? (
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={shareWithOperator}
              onChange={(e) => setShareWithOperator(e.target.checked)}
            />
            <span>Share with operator</span>
          </label>
        ) : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" disabled={uploading} style={primaryBtn}>
            {uploading ? "Uploading..." : items.length > 1 ? "Upload documents in this order" : "Upload document"}
          </button>
        </div>

        {message ? <div style={messageText}>{message}</div> : null}
      </div>
    </form>
  );
}

const helperBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.62)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 13,
  lineHeight: 1.45,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.82)",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.88)",
  boxSizing: "border-box",
  fontSize: 14,
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 700,
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const smallBtn: React.CSSProperties = {
  padding: "7px 9px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const smallGhostBtn: React.CSSProperties = {
  ...smallBtn,
  padding: "6px 8px",
  fontSize: 12,
};

const dangerBtn: React.CSSProperties = {
  ...smallBtn,
  border: "1px solid rgba(185,28,28,0.25)",
  color: "#991b1b",
};

const messageText: React.CSSProperties = {
  fontSize: 13,
  color: "#111",
};

const previewPanel: React.CSSProperties = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.1)",
  background: "rgba(255,255,255,0.7)",
};

const previewHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 8,
  fontSize: 13,
};

const previewRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 8,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.88)",
};

const previewThumb: React.CSSProperties = {
  width: 74,
  height: 58,
  borderRadius: 9,
  overflow: "hidden",
  background: "#f3f4f6",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const previewImage: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const fileBadge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0.4,
  color: "#374151",
};

const fileName: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const fileMeta: React.CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  opacity: 0.72,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const orderButtons: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};
