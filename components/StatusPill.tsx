"use client";

export default function StatusPill({
  text,
  kind = "neutral",
}: {
  text: string;
  kind?: "good" | "warn" | "bad" | "neutral" | "info";
}) {
  const styles: Record<string, React.CSSProperties> = {
    good: { background: "rgba(0,180,120,0.18)", border: "1px solid rgba(0,180,120,0.28)" },
    warn: { background: "rgba(255,140,0,0.18)", border: "1px solid rgba(255,140,0,0.28)" },
    bad: { background: "rgba(255,0,0,0.14)", border: "1px solid rgba(255,0,0,0.22)" },
    info: { background: "rgba(0,120,255,0.15)", border: "1px solid rgba(0,120,255,0.25)" },
    neutral: { background: "rgba(255,255,255,0.55)", border: "1px solid rgba(0,0,0,0.12)" },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 900,
        padding: "4px 10px",
        borderRadius: 999,
        color: "#111",
        ...styles[kind],
      }}
    >
      {text}
    </span>
  );
}

export function bookingKind(status: string) {
  const s = (status || "").toLowerCase();
  if (["confirmed", "booked", "live"].includes(s)) return "good";
  if (["inquiry", "enquiry", "pending"].includes(s)) return "warn";
  if (["cancelled", "canceled"].includes(s)) return "bad";
  if (["completed", "done"].includes(s)) return "info";
  return "neutral";
}

export function invoiceKind(status: string) {
  const s = (status || "").toLowerCase();
  if (["paid"].includes(s)) return "good";
  if (["sent"].includes(s)) return "warn";
  if (["overdue"].includes(s)) return "bad";
  return "neutral";
}

export function equipmentKind(status: string) {
  const s = (status || "").toLowerCase();
  if (["available"].includes(s)) return "good";
  if (["maintenance", "repair", "out of service"].includes(s)) return "warn";
  if (["on hire", "booked", "in use"].includes(s)) return "info";
  return "neutral";
}
