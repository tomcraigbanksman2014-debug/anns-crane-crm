"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type ActionType = "pickup_complete" | "delivery_complete";

export default function OperatorTransportActions({
  transportJobId,
  pickupCompletedAt,
  deliveryCompletedAt,
}: {
  transportJobId: string;
  pickupCompletedAt: string | null;
  deliveryCompletedAt: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<ActionType | "">("");
  const [msg, setMsg] = useState<string | null>(null);

  const pickupDone = useMemo(() => !!pickupCompletedAt, [pickupCompletedAt]);
  const deliveryDone = useMemo(() => !!deliveryCompletedAt, [deliveryCompletedAt]);

  async function runAction(action: ActionType) {
    setMsg(null);
    setLoading(action);

    try {
      const res = await fetch(`/api/operator/transport/${transportJobId}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not update transport job.");
        return;
      }

      router.refresh();
    } catch {
      setMsg("Could not update transport job.");
    } finally {
      setLoading("");
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => runAction("pickup_complete")}
          disabled={loading !== "" || pickupDone || deliveryDone}
          style={pickupDone ? doneBtn : primaryBtn}
        >
          {loading === "pickup_complete"
            ? "Saving..."
            : pickupDone
              ? "Pickup Complete"
              : "Mark Pickup Complete"}
        </button>

        <button
          type="button"
          onClick={() => runAction("delivery_complete")}
          disabled={loading !== "" || !pickupDone || deliveryDone}
          style={deliveryDone ? doneBtn : secondaryBtn}
        >
          {loading === "delivery_complete"
            ? "Saving..."
            : deliveryDone
              ? "Delivery Complete"
              : "Mark Delivery Complete"}
        </button>
      </div>

      {!pickupDone ? (
        <div style={hintText}>Mark pickup complete once the load has been collected.</div>
      ) : !deliveryDone ? (
        <div style={hintText}>Pickup is complete. Mark delivery complete after the drop is done.</div>
      ) : (
        <div style={successText}>This transport job has been marked fully complete.</div>
      )}

      {msg ? <div style={errorText}>{msg}</div> : null}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.55)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const doneBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,180,120,0.25)",
  background: "rgba(0,180,120,0.12)",
  color: "#0b7a4b",
  fontWeight: 800,
  cursor: "default",
};

const hintText: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  opacity: 0.78,
};

const successText: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#0b7a4b",
  fontWeight: 800,
};

const errorText: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#b00020",
};
