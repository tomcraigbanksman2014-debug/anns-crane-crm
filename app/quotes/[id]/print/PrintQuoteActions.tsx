"use client";

export default function PrintQuoteActions({
  backHref,
  editHref,
}: {
  backHref: string;
  editHref?: string;
}) {
  return (
    <div className="quote-print-hide" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button type="button" onClick={() => window.print()} style={printBtn}>
        Print / Save PDF
      </button>
      {editHref ? (
        <a href={editHref} style={editBtn}>
          Edit PDF wording
        </a>
      ) : null}
      <a href={backHref} style={backBtn}>
        Back to quote
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

const editBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #0f766e",
  background: "#ecfdf5",
  color: "#0f766e",
  fontWeight: 900,
  textDecoration: "none",
};
