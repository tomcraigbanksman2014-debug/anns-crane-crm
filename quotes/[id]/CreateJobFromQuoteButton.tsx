"use client";

export default function CreateJobFromQuoteButton({
  quoteId,
}: {
  quoteId: string;
}) {
  return (
    <a
      href={`/quotes/${quoteId}/convert-job`}
      style={btnStyle}
    >
      Create job draft
    </a>
  );
}

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(0,180,120,0.12)",
  color: "#0b7a4b",
  fontWeight: 800,
  border: "1px solid rgba(0,180,120,0.20)",
};
