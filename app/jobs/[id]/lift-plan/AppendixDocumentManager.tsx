"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type AppendixDocument = {
  id: string;
  file_name: string | null;
  file_path: string | null;
  file_type: string | null;
  document_type: string | null;
  created_at: string | null;
  share_with_operator: boolean | null;
  public_url: string | null;
};

function documentTypeLabel(value: string | null | undefined) {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "site_drawing":
      return "Site drawing";
    case "photo":
      return "Photo / diagram";
    case "lift_plan":
      return "Lift plan";
    case "rams":
      return "RAMS";
    case "delivery_note":
      return "Delivery note";
    case "spec_sheet":
      return "Specification sheet";
    case "load_chart":
      return "Load chart";
    case "manual":
      return "Manual";
    default:
      return "Other";
  }
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB");
}

function isImageDoc(doc: AppendixDocument) {
  const fileType = String(doc.file_type ?? "").toLowerCase();
  const fileName = String(doc.file_name ?? "").toLowerCase();
  return (
    fileType.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(fileName)
  );
}

export default function AppendixDocumentManager({
  jobId,
  initialDocuments,
}: {
  jobId: string;
  initialDocuments: AppendixDocument[];
}) {
  const router = useRouter();
  const [docs, setDocs] = useState<AppendixDocument[]>(initialDocuments);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const imageCount = useMemo(() => docs.filter(isImageDoc).length, [docs]);

  // router.refresh() gives this client component fresh server props after an upload.
  // Without this sync, the upload succeeds but this manager keeps showing its old
  // first-render state, which makes the new appendix images look as if they
  // disappeared until a hard page reload. Do not overwrite a manual reordered
  // list while the user has unsaved order changes.
  useEffect(() => {
    if (dirty) return;
    setDocs(initialDocuments);
  }, [initialDocuments, dirty]);

  function setOrderedDocs(next: AppendixDocument[]) {
    setDocs(next);
    setDirty(true);
    setMessage("Order changed. Click Save appendix order before printing the pack.");
  }

  function moveDoc(id: string, direction: -1 | 1) {
    setOrderedDocs((() => {
      const index = docs.findIndex((doc) => doc.id === id);
      if (index < 0) return docs;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= docs.length) return docs;
      const next = [...docs];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    })());
  }

  function moveDraggedDoc(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const fromIndex = docs.findIndex((doc) => doc.id === draggedId);
    const toIndex = docs.findIndex((doc) => doc.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const next = [...docs];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    setOrderedDocs(next);
  }

  async function saveOrder() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/documents/reorder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document_ids: docs.map((doc) => doc.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error || "Could not save appendix order.");
        return;
      }
      setDirty(false);
      setMessage("Appendix order saved.");
      router.refresh();
    } catch (error) {
      console.error("Could not save appendix order", error);
      setMessage("Could not save appendix order.");
    } finally {
      setSaving(false);
    }
  }

  async function removeDoc(id: string) {
    const confirmed = window.confirm("Remove this document from the lift plan/job? This will delete the uploaded file.");
    if (!confirmed) return;

    setDeletingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/documents/${id}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error || "Could not remove document.");
        return;
      }
      setDocs((prev) => prev.filter((doc) => doc.id !== id));
      setDirty(false);
      setMessage("Document removed.");
      router.refresh();
    } catch (error) {
      console.error("Could not remove document", error);
      setMessage("Could not remove document.");
    } finally {
      setDeletingId(null);
    }
  }

  if (!docs.length) {
    return <div style={emptyBox}>No appendix image uploads yet.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={managerHeader}>
        <div>
          <div style={listTitle}>Appendix image pages that will be added to the full pack</div>
          <div style={helperText}>
            Drag the cards, or use Move left/right, to set the pack order. {imageCount} image page{imageCount === 1 ? "" : "s"} will preview and print as appendix pages.
          </div>
        </div>
        <button type="button" onClick={saveOrder} disabled={saving || !dirty} style={dirty ? primaryBtn : disabledBtn}>
          {saving ? "Saving..." : dirty ? "Save appendix order" : "Order saved"}
        </button>
      </div>

      <div style={docGrid}>
        {docs.map((doc, index) => (
          <div
            key={doc.id}
            style={{ ...docCard, ...(draggedId === doc.id ? draggingCard : {}) }}
            draggable={saving || deletingId === doc.id ? false : true}
            onDragStart={(e) => {
              setDraggedId(doc.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              moveDraggedDoc(doc.id);
            }}
            onDragEnd={() => setDraggedId(null)}
          >
            <div style={previewBox}>
              {doc.public_url && isImageDoc(doc) ? (
                <a href={doc.public_url} target="_blank" rel="noreferrer" style={previewLink}>
                  <img src={doc.public_url} alt={doc.file_name ?? "Uploaded appendix page"} style={previewImage} />
                </a>
              ) : (
                <div style={fileBadge}>FILE</div>
              )}
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={orderPill}>Page {index + 1}</div>
                <div style={dragHint}>Drag ↕</div>
              </div>
              <div style={{ fontWeight: 900, wordBreak: "break-word" }}>{doc.file_name ?? "Untitled file"}</div>
              <div style={docMeta}>
                {documentTypeLabel(doc.document_type)} • Uploaded {fmtDateTime(doc.created_at)}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={appendixPill}>Pack appendix page</span>
                {doc.share_with_operator ? <span style={neutralPill}>Shared with operator</span> : null}
              </div>
              <div style={buttonRow}>
                <button type="button" onClick={() => moveDoc(doc.id, -1)} disabled={saving || index === 0} style={smallBtn}>Move left</button>
                <button type="button" onClick={() => moveDoc(doc.id, 1)} disabled={saving || index === docs.length - 1} style={smallBtn}>Move right</button>
                <button type="button" onClick={() => removeDoc(doc.id)} disabled={deletingId === doc.id} style={dangerBtn}>
                  {deletingId === doc.id ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {message ? <div style={messageBox}>{message}</div> : null}
    </div>
  );
}

const managerHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const listTitle: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 16,
};

const helperText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  opacity: 0.72,
};

const docGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(235px, 1fr))",
  gap: 12,
};

const docCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 10,
};

const draggingCard: React.CSSProperties = {
  opacity: 0.55,
};

const previewBox: React.CSSProperties = {
  height: 156,
  borderRadius: 10,
  overflow: "hidden",
  background: "#f8fafc",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const previewLink: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
};

const previewImage: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  background: "#fff",
};

const fileBadge: React.CSSProperties = {
  fontWeight: 900,
  color: "#475569",
};

const docMeta: React.CSSProperties = {
  fontSize: 12,
  color: "#334155",
  opacity: 0.85,
};

const orderPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "4px 8px",
  borderRadius: 999,
  background: "#dbeafe",
  color: "#075985",
  fontSize: 12,
  fontWeight: 900,
};

const dragHint: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748b",
  cursor: "grab",
};

const appendixPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "5px 8px",
  fontSize: 12,
  fontWeight: 900,
  color: "#075985",
  background: "#dbeafe",
};

const neutralPill: React.CSSProperties = {
  ...appendixPill,
  color: "#374151",
  background: "#e5e7eb",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const primaryBtn: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const disabledBtn: React.CSSProperties = {
  ...primaryBtn,
  background: "#e5e7eb",
  color: "#64748b",
  cursor: "not-allowed",
};

const smallBtn: React.CSSProperties = {
  padding: "7px 9px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  ...smallBtn,
  border: "1px solid rgba(185,28,28,0.25)",
  color: "#991b1b",
};

const messageBox: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 13,
  fontWeight: 700,
};

const emptyBox: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
};
