"use client";

export default function DeletePurchaseOrderButton({
  purchaseOrderId,
  poNumber,
  compact = false,
}: {
  purchaseOrderId: string;
  poNumber?: string | null;
  compact?: boolean;
}) {
  return (
    <form
      action={`/api/purchase-orders/${purchaseOrderId}/delete`}
      method="POST"
      onSubmit={(e) => {
        const ok = window.confirm(
          `Delete purchase order ${poNumber ?? ""}? This cannot be undone.`
        );
        if (!ok) e.preventDefault();
      }}
    >
      <button type="submit" style={compact ? compactDeleteBtn : deleteBtn}>
        {compact ? "Delete" : "Delete purchase order"}
      </button>
    </form>
  );
}

const deleteBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.08)",
  color: "#b00020",
  fontWeight: 800,
  border: "1px solid rgba(255,0,0,0.18)",
  cursor: "pointer",
};

const compactDeleteBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.08)",
  color: "#b00020",
  fontWeight: 800,
  border: "1px solid rgba(255,0,0,0.18)",
  cursor: "pointer",
};
