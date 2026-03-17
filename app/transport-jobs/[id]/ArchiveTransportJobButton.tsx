"use client";

import { useState } from "react";

export default function ArchiveTransportJobButton({
  jobId,
  archived,
}: {
  jobId: string;
  archived: boolean;
}) {
  const [loading, setLoading] = useState(false);

  async function runAction() {
    setLoading(true);

    try {
      const res = await fetch("/api/transport-jobs/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
          archived: !archived,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || "Could not update archive status.");
        return;
      }

      window.location.href = `/transport-jobs/${jobId}`;
    } catch {
      alert("Could not update archive status.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={runAction}
      disabled={loading}
      style={archived ? restoreBtn : archiveBtn}
    >
      {loading ? "Saving..." : archived ? "Restore transport job" : "Archive transport job"}
    </button>
  );
}

const archiveBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,0,0,0.10)",
  color: "#b00020",
  fontWeight: 800,
  border: "1px solid rgba(255,0,0,0.20)",
  cursor: "pointer",
};

const restoreBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(0,180,120,0.12)",
  color: "#0b7a4b",
  fontWeight: 800,
  border: "1px solid rgba(0,180,120,0.20)",
  cursor: "pointer",
};
