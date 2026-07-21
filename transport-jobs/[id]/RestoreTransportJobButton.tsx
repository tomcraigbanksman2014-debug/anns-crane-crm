"use client";

import { useState } from "react";

export default function RestoreTransportJobButton({
  jobId,
}: {
  jobId: string;
}) {
  const [loading, setLoading] = useState(false);

  async function runRestore() {
    setLoading(true);

    try {
      const res = await fetch("/api/transport-jobs/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || "Could not restore transport job.");
        return;
      }

      window.location.reload();
    } catch {
      alert("Could not restore transport job.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={runRestore}
      disabled={loading}
      style={buttonStyle}
    >
      {loading ? "Restoring..." : "Restore"}
    </button>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.12)",
  color: "#0b7a4b",
  fontWeight: 800,
  border: "1px solid rgba(0,180,120,0.20)",
  cursor: "pointer",
};
