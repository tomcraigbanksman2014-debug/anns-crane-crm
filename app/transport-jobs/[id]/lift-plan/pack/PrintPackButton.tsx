"use client";

import { printWithDocumentTitle } from "../../../../lib/printDocumentTitle";

export default function PrintPackButton({ printTitle }: { printTitle?: string }) {
  return (
    <button
      type="button"
      onClick={() => printWithDocumentTitle(printTitle)}
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
