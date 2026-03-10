"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DocumentUploadForm({
  jobId,
}: {
  jobId: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!file) {
      setMsg("Please choose a file.");
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/jobs/${jobId}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not upload document.");
        return;
      }

      setFile(null);
      const input = document.getElementById("job-doc-upload") as HTMLInputElement | null;
      if (input) input.value = "";

      router.refresh();
    } catch {
      setMsg("Could not upload document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ display: "grid", gap: 10 }}>
        <input
          id="job-doc-upload"
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={inputStyle}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" disabled={saving} style={primaryBtn}>
            {saving ? "Uploading..." : "Upload document"}
          </button>
        </div>

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
