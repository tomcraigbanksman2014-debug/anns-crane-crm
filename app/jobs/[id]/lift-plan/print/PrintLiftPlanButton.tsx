"use client";

export default function PrintLiftPlanButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
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
