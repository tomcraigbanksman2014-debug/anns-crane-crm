"use client";

import { useEffect } from "react";
import { printWithDocumentTitle, setPrintDocumentTitle } from "../../../../lib/printDocumentTitle";

export default function PrintPackButton({ printTitle }: { printTitle?: string }) {
  useEffect(() => {
    setPrintDocumentTitle(printTitle || "Transport Lift Plan Pack");
  }, [printTitle]);

  return (
    <button
      type="button"
      onClick={() => printWithDocumentTitle(printTitle || "Transport Lift Plan Pack", { restoreAfterMs: 120000 })}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        background: "#111",
        color: "#fff",
        fontWeight: 800,
        border: "none",
        cursor: "pointer",
      }}
    >
      Print full pack
    </button>
  );
}
