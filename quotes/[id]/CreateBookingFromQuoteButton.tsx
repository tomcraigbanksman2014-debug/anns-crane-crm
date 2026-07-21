"use client";

export default function CreateBookingFromQuoteButton({
  quoteId,
}: {
  quoteId: string;
}) {
  return (
    <a
      href={`/quotes/${quoteId}/convert-booking`}
      style={btnStyle}
    >
      Create booking draft
    </a>
  );
}

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(0,120,255,0.12)",
  color: "#0b57d0",
  fontWeight: 800,
  border: "1px solid rgba(0,120,255,0.18)",
};
