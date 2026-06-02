"use client";

import { useEffect } from "react";
import { printWithDocumentTitle, setPrintDocumentTitle } from "../../../../lib/printDocumentTitle";

export default function PrintLiftPlanButton({ printTitle }: { printTitle?: string }) {
  useEffect(() => {
    setPrintDocumentTitle(printTitle || "Lift Plan");
  }, [printTitle]);

  return (
    <button
      type="button"
      onClick={() => printWithDocumentTitle(printTitle || "Lift Plan", { restoreAfterMs: 120000 })}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.15)",
        background: "#111",
        color: "#fff",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      Print / Save as PDF
    </button>
  );
}
