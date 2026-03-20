"use client";

import { useState } from "react";
import ClientShell from "../../ClientShell";

export default function AdminTransportToolsPage() {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function runBackfill() {
    setRunning(true);
    setMsg(null);

    try {
      const res = await fetch("/api/admin/transport-geocode-backfill", {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not run transport geocode backfill.");
        return;
      }

      const failuresText =
        Array.isArray(data?.failures) && data.failures.length > 0
          ? ` Failures: ${data.failures.length}.`
          : "";

      setMsg(
        `Checked ${data?.checked ?? 0} transport jobs. Updated ${data?.updated ?? 0}. Skipped ${data?.skipped ?? 0}.${failuresText}`
      );
    } catch {
      setMsg("Could not run transport geocode backfill.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1000px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: 32 }}>Admin: Transport Tools</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Maintenance tools for transport mapping and routing.
          </p>

          {msg ? (
            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                borderRadius: 10,
                background:
                  msg.includes("Updated") || msg.includes("Checked")
                    ? "rgba(0,180,120,0.10)"
                    : "rgba(255,0,0,0.10)",
                border:
                  msg.includes("Updated") || msg.includes("Checked")
                    ? "1px solid rgba(0,180,120,0.25)"
                    : "1px solid rgba(255,0,0,0.25)",
              }}
            >
              {msg}
            </div>
          ) : null}

          <div style={{ ...toolCard, marginTop: 18 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>
                Backfill transport job coordinates
              </div>
              <p style={{ marginTop: 8, opacity: 0.8 }}>
                Finds transport jobs with missing pickup or delivery coordinates and
                geocodes them again so the transport map can show routes and ETA.
              </p>
            </div>

            <button
              type="button"
              onClick={runBackfill}
              disabled={running}
              style={primaryBtn}
            >
              {running ? "Running..." : "Run backfill"}
            </button>
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const toolCard: React.CSSProperties = {
  padding: 18,
  borderRadius: 14,
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
  flexWrap: "wrap",
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "white",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};
