"use client";

import { useState } from "react";

export default function CreateTransportJobButton({
  jobId,
}: {
  jobId: string;
}) {
  const [loading, setLoading] = useState(false);

  async function runCreate() {
    setLoading(true);

    try {
      const res = await fetch("/api/jobs/create-transport", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.job?.id) {
        alert(data?.error || "Could not create transport job.");
        return;
      }

      window.location.href = `/transport-jobs/${data.job.id}?success=${encodeURIComponent(
        "Transport job created from crane job."
      )}`;
    } catch {
      alert("Could not create transport job.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={runCreate}
      style={buttonStyle}
      disabled={loading}
    >
      {loading ? "Creating..." : "Create transport job"}
    </button>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.52)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
  cursor: "pointer",
};
