"use client";

export default function PrintPackButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
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
