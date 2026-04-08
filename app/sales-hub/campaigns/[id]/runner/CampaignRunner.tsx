"use client";

import { useMemo, useState } from "react";
import {
  buildFormattedEmailHtml,
  normaliseDraftBody,
  normaliseDraftSubject,
  SHARED_EMAIL_SIGNATURE_TEXT,
} from "../../../../lib/emailSignature";

type DraftRow = {
  target_type: "lead" | "customer";
  target_id: string;
  company_name: string;
  contact_name: string;
  channel: string;
  subject: string;
  body: string;
  provider?: "openai" | "fallback";
  target_email?: string | null;
  target_phone?: string | null;
};

type SkippedRow = {
  target_type: "lead" | "customer";
  target_id: string;
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

  const pageOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  function buildOutlookHref(draft: DraftRow) {
    const to = String(draft.target_email ?? "").trim();
    if (!to) return "";

    const parts = [
      `to=${encodeURIComponent(to)}`,
      draft.subject ? `subject=${encodeURIComponent(normaliseDraftSubject(draft.subject))}` : "",
    ].filter(Boolean);

    return `https://outlook.office.com/mail/deeplink/compose?${parts.join("&")}`;
  }

  function getPlainBody(draft: DraftRow) {
    return normaliseDraftBody(draft.body);
  }

  function getPlainBodyWithSignature(draft: DraftRow) {
    const cleaned = getPlainBody(draft);
    if (!cleaned) return SHARED_EMAIL_SIGNATURE_TEXT;
    return `${cleaned}\n\n${SHARED_EMAIL_SIGNATURE_TEXT}`;
  }

  function getHtmlBody(draft: DraftRow) {
    return buildFormattedEmailHtml({
      body: getPlainBody(draft),
      origin: pageOrigin,
    });
  }

  function setFeedback(message: string) {
    setError(message);
    window.setTimeout(() => {
      setError((current) => (current === message ? null : current));
    }, 2200);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copied.`);
    } catch {
      setError(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function copyFormattedEmail(draft: DraftRow) {
    const html = getHtmlBody(draft);
    const plain = getPlainBodyWithSignature(draft);

    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }

      setFeedback("Formatted email copied.");
    } catch {
      setError("Could not copy formatted email.");
    }
  }

  async function openInOutlookAndCopy(draft: DraftRow) {
    const href = buildOutlookHref(draft);
    if (!href) {
      setError("No email address saved for this draft.");
      return;
    }

    await copyFormattedEmail(draft);
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function openAllInOutlook() {
    const emailDrafts = drafts.filter((draft) => String(draft.target_email ?? "").trim());
    if (!emailDrafts.length) {
      setError("No email-ready drafts available.");
      return;
    }

    const firstDraft = emailDrafts[0];
    if (!firstDraft) {
      setError("No email-ready drafts available.");
      return;
    }

    copyFormattedEmail(firstDraft).finally(() => {
      const href = buildOutlookHref(firstDraft);
      if (href) {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    });

    if (emailDrafts.length > 1) {
      setFeedback(
        "Browsers only allow one Outlook compose window per click. The first email has been opened and copied with the full AnnS signature and logo. Use ‘Open in Outlook + copy formatted email’ on each draft for the rest."
      );
    }
  }

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

  async function copyCombined() {
    const blocks = drafts.map((draft) => {
      const parts = [
        `Type: ${draft.target_type}`,
        `Company: ${draft.company_name}`,
        draft.contact_name ? `Contact: ${draft.contact_name}` : "",
        draft.subject ? `Subject: ${normaliseDraftSubject(draft.subject)}` : "",
        "Body:",
        draft.channel === "email" ? getPlainBodyWithSignature(draft) : getPlainBody(draft),
      ].filter(Boolean);
      return parts.join("\n");
    });

    await copyText(blocks.join("\n\n--------------------\n\n"), "All drafts");
  }

  const leadDrafts = drafts.filter((row) => row.target_type === "lead").length;
  const customerDrafts = drafts.filter((row) => row.target_type === "customer").length;

  return (
    <div style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 24 }}>Campaign Runner</h2>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Generate one set of drafts across all leads and customers linked to <strong>{campaignName}</strong>.
      </p>
      <p style={{ marginTop: 6, opacity: 0.72, fontSize: 14 }}>
        Outlook deeplinks can prefill the recipient and subject, but they cannot inject the AnnS HTML signature and logo by themselves. Use the formatted-email buttons below so the message opens in Outlook with the branded signature copied and ready to paste.
      </p>

      {error ? (
        <div
          style={
            error.toLowerCase().includes("copied") ||
            error.toLowerCase().includes("opened") ||
            error.toLowerCase().includes("first email")
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
        <SummaryCard label="Lead drafts" value={String(leadDrafts)} />
        <SummaryCard label="Customer drafts" value={String(customerDrafts)} />
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

        {channel === "email" && drafts.some((draft) => String(draft.target_email ?? "").trim()) ? (
          <button type="button" onClick={openAllInOutlook} style={secondaryBtn}>
            Open first in Outlook + copy formatted email
          </button>
        ) : null}
      </div>

      {skipped.length > 0 ? (
        <section style={{ ...panelStyle, marginTop: 18 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Skipped targets</div>
          <div style={{ display: "grid", gap: 8 }}>
            {skipped.map((row) => (
              <div key={`${row.target_type}-${row.target_id}`} style={skipCard}>
                <div style={{ fontWeight: 800 }}>{row.company_name}</div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                  {row.target_type.toUpperCase()} • {row.reason}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
        {drafts.length === 0 ? (
          <div style={panelStyle}>No drafts generated yet.</div>
        ) : (
          drafts.map((draft) => {
            const openHref =
              draft.target_type === "lead"
                ? `/sales-hub/leads/${draft.target_id}`
                : `/customers/${draft.target_id}`;

            return (
              <div key={`${draft.target_type}-${draft.target_id}`} style={draftCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900 }}>{draft.company_name}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                      {draft.target_type.toUpperCase()} • {draft.contact_name || "No contact name"} • {draft.target_email || draft.target_phone || "No destination"} • {draft.channel}
                      {draft.provider ? ` • ${draft.provider}` : ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a href={openHref} style={linkBtn}>
                      Open {draft.target_type}
                    </a>
                    {channel === "email" && draft.target_email ? (
                      <>
                        <button type="button" onClick={() => copyFormattedEmail(draft)} style={secondaryBtn}>
                          Copy formatted email
                        </button>
                        <button type="button" onClick={() => openInOutlookAndCopy(draft)} style={secondaryBtn}>
                          Open in Outlook + copy email
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {draft.subject ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Subject</div>
                    <div style={{ marginTop: 4, fontWeight: 700, whiteSpace: "pre-wrap" }}>
                      {normaliseDraftSubject(draft.subject)}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => copyText(normaliseDraftSubject(draft.subject), "Subject")}
                        style={secondaryBtn}
                      >
                        Copy subject
                      </button>
                    </div>
                  </div>
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Body</div>
                  <textarea
                    readOnly
                    value={draft.channel === "email" ? getPlainBodyWithSignature(draft) : getPlainBody(draft)}
                    style={textareaStyle}
                  />
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          draft.channel === "email" ? getPlainBodyWithSignature(draft) : getPlainBody(draft),
                          "Body"
                        )
                      }
                      style={secondaryBtn}
                    >
                      Copy body
                    </button>
                    {draft.channel === "email" ? (
                      <button type="button" onClick={() => copyFormattedEmail(draft)} style={secondaryBtn}>
                        Copy body with logo signature
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
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
};

const summaryCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const panelStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const draftCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.68)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const skipCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.64)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 260,
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
  padding: "10px 14px",
  borderRadius: 10,
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
