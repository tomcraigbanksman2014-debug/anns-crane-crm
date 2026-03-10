"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ActionType = "start" | "arrive" | "lift_complete" | "complete";

export default function OperatorJobActions({
  jobId,
}: {
  jobId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<ActionType | "">("");
  const [msg, setMsg] = useState<string | null>(null);

  async function runAction(action: ActionType) {
    setMsg(null);
    setLoading(action);

    try {
      const res = await fetch(`/api/operator/jobs/${jobId}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not update job.");
        return;
      }

      router.refresh();
    } catch {
      setMsg("Could not update job.");
    } finally {
      setLoading("");
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => runAction("start")}
          disabled={loading !== ""}
          style={primaryBtn}
        >
          {loading === "start" ? "Saving..." : "Start Job"}
        </button>

        <button
          type="button"
          onClick={() => runAction("arrive")}
          disabled={loading !== ""}
          style={secondaryBtn}
        >
          {loading === "arrive" ? "Saving..." : "Arrived On Site"}
        </button>

        <button
          type="button"
          onClick={() => runAction("lift_complete")}
          disabled={loading !== ""}
          style={secondaryBtn}
        >
          {loading === "lift_complete" ? "Saving..." : "Lift Complete"}
        </button>

        <button
          type="button"
          onClick={() => runAction("complete")}
          disabled={loading !== ""}
          style={doneBtn}
        >
          {loading === "complete" ? "Saving..." : "Job Complete"}
        </button>
      </div>

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
  cursor: "pointer",
};

const errorText: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#b00020",
};
