"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OperatorPhotoUpload({
  jobId,
}: {
  jobId: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("photo");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!file) {
      setMsg("Choose a document first.");
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", documentType);

      const res = await fetch(`/api/operator/jobs/${jobId}/photos/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not upload document.");
        return;
      }

      setFile(null);
      setDocumentType("photo");

      const input = document.getElementById("operator-photo-upload") as HTMLInputElement | null;
      if (input) input.value = "";

      router.refresh();
    } catch {
      setMsg("Could not upload document.");
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
          <option value="photo">Photo</option>
          <option value="delivery_note">Delivery Note</option>
          <option value="site_drawing">Site Drawing</option>
          <option value="rams">RAMS</option>
          <option value="lift_plan">Lift Plan</option>
          <option value="other">Other</option>
        </select>

        <input
          id="operator-photo-upload"
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={inputStyle}
        />

        <button type="submit" disabled={saving} style={primaryBtn}>
          {saving ? "Uploading..." : "Upload Job Document"}
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

const errorText: React.CSSProperties = {
  fontSize: 13,
  color: "#b00020",
};
