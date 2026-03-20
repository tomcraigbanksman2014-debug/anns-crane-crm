"use client";

import { useState } from "react";
import ClientShell from "../../ClientShell";

function parseIds(raw: string) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(/[\s,\n\r\t,]+/)
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );
}

export default function BulkArchivePage() {
  const [type, setType] = useState<"jobs" | "transport_jobs">("jobs");
  const [idsText, setIdsText] = useState("");
  const [archived, setArchived] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function runBulkArchive() {
    const ids = parseIds(idsText);

    if (ids.length === 0) {
      setMsg("Enter at least one ID.");
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const endpoint =
        type === "jobs"
          ? "/api/jobs/bulk-archive"
          : "/api/transport-jobs/bulk-archive";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids,
          archived,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not run bulk archive.");
        return;
      }

      setMsg(
        `${archived ? "Archived" : "Restored"} ${data?.count ?? ids.length} ${type === "jobs" ? "crane job(s)" : "transport job(s)"}.`
      );
      setIdsText("");
    } catch {
      setMsg("Could not run bulk archive.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ClientShell>
      <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: 32 }}>Admin: Bulk Archive</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Archive or restore many crane jobs or transport jobs in one go.
          </p>

          {msg ? (
            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                borderRadius: 10,
                background:
                  msg.includes("Archived") || msg.includes("Restored")
                    ? "rgba(0,180,120,0.10)"
                    : "rgba(255,0,0,0.10)",
                border:
                  msg.includes("Archived") || msg.includes("Restored")
                    ? "1px solid rgba(0,180,120,0.25)"
                    : "1px solid rgba(255,0,0,0.25)",
              }}
            >
              {msg}
            </div>
          ) : null}

          <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as "jobs" | "transport_jobs")}
                  style={inputStyle}
                >
                  <option value="jobs">Crane jobs</option>
                  <option value="transport_jobs">Transport jobs</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Action</label>
                <select
                  value={archived ? "archive" : "restore"}
                  onChange={(e) => setArchived(e.target.value === "archive")}
                  style={inputStyle}
                >
                  <option value="archive">Archive</option>
                  <option value="restore">Restore</option>
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>IDs</label>
              <textarea
                value={idsText}
                onChange={(e) => setIdsText(e.target.value)}
                rows={10}
                style={textareaStyle}
                placeholder="Paste one ID per line, or comma-separated IDs"
              />
            </div>

            <div>
              <button
                type="button"
                onClick={runBulkArchive}
                disabled={loading}
                style={primaryBtn}
              >
                {loading ? "Running..." : archived ? "Archive selected" : "Restore selected"}
              </button>
            </div>
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

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
  resize: "vertical",
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
