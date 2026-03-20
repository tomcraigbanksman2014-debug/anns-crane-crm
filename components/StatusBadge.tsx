import React from "react";

export default function StatusBadge({
  value,
  archived = false,
}: {
  value: string | null | undefined;
  archived?: boolean;
}) {
  const text = archived ? "Archived" : prettyLabel(value);
  const style = archived ? archivedStyle : getStatusStyle(value);

  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {text}
    </span>
  );
}

function prettyLabel(value: string | null | undefined) {
  const v = String(value ?? "").trim().toLowerCase();

  if (!v) return "—";
  if (v === "in_progress") return "In Progress";
  if (v === "not_invoiced") return "Not Invoiced";
  if (v === "part_paid") return "Part Paid";
  if (v === "cross_hire") return "Cross Hire";
  if (v === "crane_support") return "Crane Support";
  if (v === "delivery_note") return "Delivery Note";

  return v
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusStyle(value: string | null | undefined): React.CSSProperties {
  const v = String(value ?? "").trim().toLowerCase();

  if (v === "active" || v === "completed" || v === "paid" || v === "accepted") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (
    v === "pending" ||
    v === "draft" ||
    v === "planned" ||
    v === "sent" ||
    v === "not_invoiced"
  ) {
    return {
      background: "rgba(0,120,255,0.12)",
      color: "#0b57d0",
      border: "1px solid rgba(0,120,255,0.20)",
    };
  }

  if (
    v === "confirmed" ||
    v === "recent" ||
    v === "maintenance" ||
    v === "part_paid"
  ) {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.22)",
    };
  }

  if (
    v === "inactive" ||
    v === "no bookings" ||
    v === "dormant"
  ) {
    return {
      background: "rgba(120,120,120,0.12)",
      color: "#555",
      border: "1px solid rgba(120,120,120,0.18)",
    };
  }

  if (
    v === "cancelled" ||
    v === "rejected" ||
    v === "overdue" ||
    v === "expired"
  ) {
    return {
      background: "rgba(255,0,0,0.10)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.18)",
    };
  }

  return {
    background: "rgba(255,255,255,0.35)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

const archivedStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.08)",
  color: "#111",
  border: "1px solid rgba(0,0,0,0.12)",
};
