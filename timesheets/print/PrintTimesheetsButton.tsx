"use client";

export default function PrintTimesheetsButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        padding: "12px 16px",
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
