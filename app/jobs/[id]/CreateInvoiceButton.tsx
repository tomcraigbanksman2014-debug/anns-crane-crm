"use client";

import { useState } from "react";

export default function CreateInvoiceButton({
  jobId,
}: {
  jobId: string;
}) {
  const [loading, setLoading] = useState(false);

  async function runCreate() {
    setLoading(true);

    try {
      const res = await fetch("/api/invoices/from-job", {
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
        alert(data?.error || "Could not create invoice.");
        return;
      }

      window.location.reload();
    } catch {
      alert("Could not create invoice.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={runCreate}
      disabled={loading}
      style={buttonStyle}
    >
      {loading ? "Creating invoice..." : "Create / refresh invoice"}
    </button>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
};
