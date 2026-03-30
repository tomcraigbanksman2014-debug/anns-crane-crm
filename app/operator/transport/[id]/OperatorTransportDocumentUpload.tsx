"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OperatorTransportDocumentUpload({
  transportJobId,
}: {
  transportJobId: string;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState("load_photo");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (files.length === 0) {
      setMsg("Choose at least one document first.");
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }
      formData.append("document_type", documentType);

      const res = await fetch(`/api/operator/transport/${transportJobId}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not upload documents.");
        return;
      }

      setFiles([]);
      setDocumentType("load_photo");

      const input = document.getElementById("operator-transport-doc-upload") as HTMLInputElement | null;
      if (input) input.value = "";

      router.refresh();
    } catch {
      setMsg("Could not upload documents.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          style={selectStyle}
        >
          <option value="load_photo">Load Photo</option>
          <option value="pickup_photo">Pickup Photo</option>
          <option value="delivery_photo">Delivery Photo</option>
          <option value="pod">POD</option>
          <option value="delivery_note">Delivery Note</option>
          <option value="collection_note">Collection Note</option>
          <option value="site_drawing">Site Drawing</option>
          <option value="other">Other</option>
        </select>

        <input
          id="operator-transport-doc-upload"
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          style={inputStyle}
        />

        {files.length > 0 ? (
          <div style={fileCountText}>
            {files.length} file{files.length === 1 ? "" : "s"} selected
          </div>
        ) : null}

        <button type="submit" disabled={saving} style={primaryBtn}>
          {saving ? "Uploading..." : "Upload Transport Documents"}
        </button>

        {msg ? <div style={errorText}>{msg}</div> : null}
      </div>
    </form>
  );
}

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

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const fileCountText: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.72,
  fontWeight: 700,
};

const errorText: React.CSSProperties = {
  fontSize: 13,
  color: "#b00020",
};
