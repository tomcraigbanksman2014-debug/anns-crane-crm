"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DocumentUploadForm({
  jobId,
  allowShareWithOperator = true,
}: {
  jobId: string;
  allowShareWithOperator?: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("site_drawing");
  const [shareWithOperator, setShareWithOperator] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!file) {
      setMessage("Please choose a file.");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
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
        setMessage(data?.error || "Could not upload document.");
        return;
      }

      setFile(null);
      setDocumentType("site_drawing");
      setShareWithOperator(false);

      const input = document.getElementById("job-doc-upload") as HTMLInputElement | null;
      if (input) input.value = "";

      setMessage("Document uploaded.");
      router.refresh();
    } catch {
      setMessage("Could not upload document.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={helperBox}>
          Upload site sketches, crane position drawings, lift diagrams, photos, RAMS, and other lift plan documents.
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.78 }}>
            Image uploads on this page are appended into the full lift plan pack as extra appendix pages.
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
          accept="image/*,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={inputStyle}
        />

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
            {uploading ? "Uploading..." : "Upload document"}
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

const messageText: React.CSSProperties = {
  fontSize: 13,
  color: "#111",
};
