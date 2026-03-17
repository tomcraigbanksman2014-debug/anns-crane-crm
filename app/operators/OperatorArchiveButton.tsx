"use client";

import { useState } from "react";

export default function OperatorArchiveButton({
  operatorId,
  archived,
}: {
  operatorId: string;
  archived: boolean;
}) {
  const [loading, setLoading] = useState(false);

  async function runAction() {
    setLoading(true);

    try {
      const res = await fetch(
        archived ? "/api/operators/restore" : "/api/operators/archive",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operator_id: operatorId,
          }),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || "Could not update operator.");
        return;
      }

      window.location.reload();
    } catch {
      alert("Could not update operator.");
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
      {loading ? "Saving..." : archived ? "Restore" : "Archive"}
    </button>
  );
}

const archiveBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  color: "#b00020",
  fontWeight: 800,
  border: "1px solid rgba(255,0,0,0.20)",
  cursor: "pointer",
};

const restoreBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.12)",
  color: "#0b7a4b",
  fontWeight: 800,
  border: "1px solid rgba(0,180,120,0.20)",
  cursor: "pointer",
};
