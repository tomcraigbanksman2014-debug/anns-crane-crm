"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DocumentDeleteButton({
  jobId,
  documentId,
}: {
  jobId: string;
  documentId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    const confirmed = window.confirm("Delete this document?");
    if (!confirmed) return;

    setLoading(true);

    try {
      const res = await fetch(`/api/jobs/${jobId}/documents/${documentId}/delete`, {
        method: "POST",
      });

      if (res.ok) {
        router.refresh();
      } else {
        alert("Could not delete document.");
      }
    } catch {
      alert("Could not delete document.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={loading}
      style={deleteBtn}
    >
      {loading ? "Deleting..." : "Delete"}
    </button>
  );
}

const deleteBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,0,0,0.18)",
  background: "rgba(255,0,0,0.08)",
  color: "#b00020",
  fontWeight: 800,
  cursor: "pointer",
};
