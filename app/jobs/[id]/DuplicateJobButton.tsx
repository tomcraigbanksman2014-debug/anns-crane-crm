"use client";

import { useState } from "react";

export default function DuplicateJobButton({
  jobId,
}: {
  jobId: string;
}) {
  const [loading, setLoading] = useState(false);

  async function runDuplicate() {
    setLoading(true);

    try {
      const res = await fetch("/api/jobs/duplicate", {
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
        alert(data?.error || "Could not duplicate job.");
        return;
      }

      window.location.href = `/jobs/${data.job.id}?success=${encodeURIComponent("Job duplicated.")}`;
    } catch {
      alert("Could not duplicate job.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={runDuplicate} style={buttonStyle} disabled={loading}>
      {loading ? "Duplicating..." : "Duplicate job"}
    </button>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};
