"use client";

export default function PrintPOActions({
  backHref,
}: {
  backHref: string;
}) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => window.print()}
        style={printBtn}
      >
        Print / Save PDF
      </button>

      <a href={backHref} style={backBtn}>
        Back to PO
      </a>
    </div>
  );
}

const printBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const backBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#fff",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
};
