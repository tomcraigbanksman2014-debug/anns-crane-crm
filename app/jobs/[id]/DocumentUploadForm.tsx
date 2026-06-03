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
  const fileName = file.name.toLowerCase();
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(fileName);
  const previewUrl = isImage ? URL.createObjectURL(file) : null;
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
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(name)) return "IMAGE";
  if (name.endsWith(".doc") || name.endsWith(".docx")) return "WORD";
  if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "EXCEL";
  if (name.endsWith(".dwg") || name.endsWith(".dxf")) return "CAD";
  if (name.endsWith(".txt") || name.endsWith(".rtf")) return "TEXT";
  return "FILE";
}

const acceptedUploadTypes = [
  "image/*",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
  ".bmp",
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

function addFilesToItems(current: SelectedUploadItem[], files: FileList | File[] | null) {
  const incoming = Array.from(files ?? []);
  const existingKeys = new Set(current.map((item) => `${item.file.name}-${item.file.size}-${item.file.lastModified}`));
  const nextItems = incoming
    .filter((file) => !existingKeys.has(`${file.name}-${file.size}-${file.lastModified}`))
    .map(makeItem);
  return [...current, ...nextItems];
}

export default function DocumentUploadForm({
  jobId,
  allowShareWithOperator = true,
}: {
  jobId: string;
  allowShareWithOperator?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<SelectedUploadItem[]>([]);
  const itemsRef = useRef<SelectedUploadItem[]>([]);
  const [documentType, setDocumentType] = useState("site_drawing");
  const [shareWithOperator, setShareWithOperator] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverUpload, setDragOverUpload] = useState(false);
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
    for (const item of itemsRef.current) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    setItems([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleAddFiles(files: FileList | File[] | null) {
    setItems((prev) => {
      const next = addFilesToItems(prev, files);
      if (next.length) {
        setMessage("Preview added. Drag files, or use Move up/down, to set the appendix order before uploading.");
      } else {
        setMessage(null);
      }
      return next;
    });
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

  function moveDraggedItem(targetId: string) {
    if (!draggedItemId || draggedItemId === targetId) return;
    setItems((prev) => {
      const fromIndex = prev.findIndex((item) => item.id === draggedItemId);
      const toIndex = prev.findIndex((item) => item.id === targetId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!items.length) {
      setMessage("Please choose one or more files first.");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      items.forEach((item, index) => {
        formData.append("files", item.file, item.file.name || `upload-${index + 1}`);
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
    } catch (error) {
      console.error("Document upload failed", error);
      setMessage("Could not upload documents.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} encType="multipart/form-data">
      <div style={{ display: "grid", gap: 10 }}>
        <div style={helperBox}>
          Upload site sketches, crane position drawings, lift diagrams, photos, RAMS, Word/Excel files, CAD files and other lift plan documents.
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.78 }}>
            Select or drag in multiple images, PDFs, Word/Excel files, text files or DWG/DXF drawings. Image uploads on this page are appended into the full lift plan pack as extra appendix pages.
          </div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.78 }}>
            For site drawings/photos/documents, put them in the order you want before clicking upload. That order will be used in the lift plan appendix/document list.
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

        <div
          style={{ ...dropZone, ...(dragOverUpload ? dropZoneActive : {}) }}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverUpload(true);
          }}
          onDragLeave={() => setDragOverUpload(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverUpload(false);
            handleAddFiles(e.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
        >
          <strong>Click here to choose files, or drag images/documents here</strong>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Images, PDF, Word, Excel, text, DWG and DXF files are allowed.</span>
        </div>

        <input
          ref={inputRef}
          id="job-doc-upload"
          type="file"
          multiple
          accept={acceptedUploadTypes}
          onChange={(e) => handleAddFiles(e.target.files)}
          style={inputStyle}
        />

        {items.length > 0 ? (
          <div style={previewPanel}>
            <div style={previewHeader}>
              <strong>{items.length} file{items.length === 1 ? "" : "s"} selected for upload</strong>
              <button type="button" onClick={clearSelectedFiles} disabled={uploading} style={smallGhostBtn}>Clear all</button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {items.map((item, index) => (
                <div
                  key={item.id}
                  style={{ ...previewRow, ...(draggedItemId === item.id ? draggingRow : {}) }}
                  draggable={!uploading}
                  onDragStart={(e) => {
                    setDraggedItemId(item.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    moveDraggedItem(item.id);
                  }}
                  onDragEnd={() => setDraggedItemId(null)}
                >
                  <div style={dragHandle} title="Drag to reorder">↕</div>
                  <div style={previewThumb}>
                    {item.previewUrl ? (
                      <img src={item.previewUrl} alt={item.file.name} style={previewImage} />
                    ) : (
                      <div style={fileBadge}>{fileBadgeLabel(item.file)}</div>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={fileName}>{index + 1}. {item.file.name}</div>
                    <div style={fileMeta}>{item.file.type || fileBadgeLabel(item.file)} {formatFileSize(item.file.size) ? `• ${formatFileSize(item.file.size)}` : ""}</div>
                  </div>
                  <div style={orderButtons}>
                    <button type="button" onClick={() => moveItem(item.id, -1)} disabled={uploading || index === 0} style={smallBtn}>Move up</button>
                    <button type="button" onClick={() => moveItem(item.id, 1)} disabled={uploading || index === items.length - 1} style={smallBtn}>Move down</button>
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

const dropZone: React.CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "18px 14px",
  borderRadius: 12,
  border: "2px dashed rgba(0,0,0,0.22)",
  background: "rgba(255,255,255,0.72)",
  cursor: "pointer",
  textAlign: "center",
};

const dropZoneActive: React.CSSProperties = {
  borderColor: "rgba(37,99,235,0.78)",
  background: "rgba(219,234,254,0.72)",
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

const draggingRow: React.CSSProperties = {
  opacity: 0.55,
};

const dragHandle: React.CSSProperties = {
  cursor: "grab",
  fontWeight: 900,
  fontSize: 18,
  color: "#475569",
  userSelect: "none",
};

const previewThumb: React.CSSProperties = {
  width: 92,
  height: 70,
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
