"use client";

import { useState } from "react";

type DraftRow = {
  lead_id: string;
  company_name: string;
  contact_name: string;
  channel: string;
  subject: string;
  body: string;
};

type SkippedRow = {
  lead_id: string;
  company_name: string;
  reason: string;
};

export default function CampaignRunner({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [channel, setChannel] = useState<string>("email");
  const [goal, setGoal] = useState<string>("introduction");
  const [tone, setTone] = useState<string>("professional");

  async function generateDrafts() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sales-campaigns/${campaignId}/generate-drafts`, {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Could not generate drafts.");
        return;
      }

      setDrafts(Array.isArray(data?.drafts) ? data.drafts : []);
      setSkipped(Array.isArray(data?.skipped) ? data.skipped : []);
      setChannel(String(data?.campaign?.channel ?? "email"));
      setGoal(String(data?.campaign?.goal ?? "introduction"));
      setTone(String(data?.campaign?.tone ?? "professional"));
    } catch {
      setError("Could not generate drafts.");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setError(`${label} copied.`);
      setTimeout(() => setError(null), 1500);
    } catch {
      setError(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function copyCombined() {
    const blocks = drafts.map((draft) => {
      const parts = [
        `Company: ${draft.company_name}`,
        draft.contact_name ? `Contact: ${draft.contact_name}` : "",
        draft.subject ? `Subject: ${draft.subject}` : "",
        "Body:",
        draft.body,
      ].filter(Boolean);

      return parts.join("\n");
    });

    await copyText(blocks.join("\n\n--------------------\n\n"), "All drafts");
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 24 }}>Campaign Runner</h2>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Generate one set of drafts across all leads linked to <strong>{campaignName}</strong>.
      </p>

      {error ? (
        <div
          style={
            error.includes("copied")
              ? successBox
              : errorBox
          }
        >
          {error}
        </div>
      ) : null}

      <div style={summaryGrid}>
        <SummaryCard label="Channel" value={channel} />
        <SummaryCard label="Goal" value={goal} />
        <SummaryCard label="Tone" value={tone} />
        <SummaryCard label="Drafts" value={String(drafts.length)} />
        <SummaryCard label="Skipped" value={String(skipped.length)} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <button type="button" onClick={generateDrafts} disabled={loading} style={primaryBtn}>
          {loading ? "Generating..." : "Generate all drafts"}
        </button>

        {drafts.length > 0 ? (
          <button type="button" onClick={copyCombined} style={secondaryBtn}>
            Copy all drafts
          </button>
        ) : null}
      </div>

      {skipped.length > 0 ? (
        <section style={{ ...panelStyle, marginTop: 18 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Skipped leads</div>
          <div style={{ display: "grid", gap: 8 }}>
            {skipped.map((row) => (
              <div key={row.lead_id} style={skipCard}>
                <div style={{ fontWeight: 800 }}>{row.company_name}</div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>{row.reason}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {drafts.length === 0 ? (
          <div style={panelStyle}>No drafts generated yet.</div>
        ) : (
          drafts.map((draft) => (
            <div key={draft.lead_id} style={draftCard}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900 }}>{draft.company_name}</div>
                  <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                    {draft.contact_name || "No contact name"} • {draft.channel}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a href={`/sales-hub/leads/${draft.lead_id}`} style={linkBtn}>
                    Open lead
                  </a>
                </div>
              </div>

              {draft.subject ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Subject</div>
                  <div style={{ marginTop: 4, fontWeight: 700, whiteSpace: "pre-wrap" }}>{draft.subject}</div>
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => copyText(draft.subject, "Subject")}
                      style={secondaryBtn}
                    >
                      Copy subject
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Body</div>
                <textarea readOnly value={draft.body} style={textareaStyle} />
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => copyText(draft.body, "Body")}
                    style={secondaryBtn}
                  >
                    Copy body
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCard}>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const summaryCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.72)",
  padding: 14,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
};

const panelStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const skipCard: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,180,0,0.12)",
  border: "1px solid rgba(255,180,0,0.18)",
};

const draftCard: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 220,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
  resize: "vertical",
  whiteSpace: "pre-wrap",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};

const successBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,160,80,0.14)",
  border: "1px solid rgba(0,160,80,0.18)",
};
