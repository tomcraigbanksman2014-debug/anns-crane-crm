"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type CraneDocument = {
  id: string;
  title: string;
  document_type: string;
  file_url: string;
  uploaded_at: string;
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

export default function CraneDocumentsManager({
  craneId,
  initialDocuments,
}: {
  craneId: string;
  initialDocuments: CraneDocument[];
}) {
  const supabase = createSupabaseBrowserClient();

  const [documents, setDocuments] = useState<CraneDocument[]>(initialDocuments ?? []);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("spec_sheet");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadDocument(file: File) {
    setUploading(true);
    setMessage("");

    try {
      if (file.type !== "application/pdf") {
        setMessage("Only PDF files are allowed.");
        return;
      }

      const ext = file.name.split(".").pop() || "pdf";
      const fileName = `${craneId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("crane-documents")
        .upload(fileName, file, {
          upsert: false,
          contentType: "application/pdf",
        });

      if (uploadError) {
        setMessage(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("crane-documents")
        .getPublicUrl(fileName);

      const fileUrl = publicUrlData.publicUrl;

      const { data, error } = await supabase
        .from("crane_documents")
        .insert({
          crane_id: craneId,
          title: title.trim() || file.name.replace(/\.pdf$/i, ""),
          document_type: documentType,
          file_url: fileUrl,
        })
        .select("*")
        .single();

      if (error) {
        setMessage(error.message);
        return;
      }

      setDocuments((prev) => [data as CraneDocument, ...prev]);
      setTitle("");
      setDocumentType("spec_sheet");
      setMessage("Document uploaded.");
    } catch (e: any) {
      setMessage(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(id: string, fileUrl: string) {
    const ok = window.confirm("Delete this document?");
    if (!ok) return;

    const path = fileUrl.split("/crane-documents/")[1] || "";

    const { error } = await supabase.from("crane_documents").delete().eq("id", id);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (path) {
      await supabase.storage.from("crane-documents").remove([path]);
    }

    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setMessage("Document deleted.");
  }

  return (
    <div style={cardStyle}>
      <h2 style={sectionTitle}>Documents</h2>

      {message ? <div style={messageBox}>{message}</div> : null}

      <div style={uploadGrid}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Grove spec sheet"
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Document type</label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            style={inputStyle}
          >
            <option value="spec_sheet">spec_sheet</option>
            <option value="loler">loler</option>
            <option value="inspection">inspection</option>
            <option value="service">service</option>
            <option value="insurance">insurance</option>
            <option value="manual">manual</option>
            <option value="other">other</option>
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Upload PDF</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadDocument(file);
              e.currentTarget.value = "";
            }}
            disabled={uploading}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {documents.length === 0 ? (
          <div style={emptyBox}>No documents uploaded yet.</div>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} style={docRow}>
              <div>
                <div style={{ fontWeight: 900 }}>{doc.title}</div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                  {doc.document_type} • {fmtDate(doc.uploaded_at)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noreferrer"
                  style={secondaryBtn}
                >
                  Open PDF
                </a>
                <button
                  type="button"
                  onClick={() => deleteDocument(doc.id, doc.file_url)}
                  style={dangerBtn}
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

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const uploadGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const docRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.48)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const emptyBox: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const messageBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.20)",
  color: "#0b57d0",
  fontWeight: 800,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const dangerBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  color: "#8b0000",
  fontWeight: 900,
  border: "1px solid rgba(255,0,0,0.20)",
  cursor: "pointer",
};
