"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildFormattedEmailHtml,
  normaliseDraftBody,
  normaliseDraftSubject,
  SHARED_EMAIL_SIGNATURE_TEXT,
} from "../../../../lib/emailSignature";

type DraftRow = {
  target_type: "lead" | "customer" | "supplier";
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
  target_type: "lead" | "customer" | "supplier";
  target_id: string;
  company_name: string;
  reason: string;
};

type GmailStatus = {
  connected: boolean;
  emailAddress?: string | null;
  expectedEmail?: string | null;
  expiryDate?: string | null;
  connectedByUsername?: string | null;
  updatedAt?: string | null;
  error?: string | null;
};

type GmailSendResponse = {
  ok?: boolean;
  senderEmail?: string;
  batchLimit?: number;
  requestedCount?: number;
  processedCount?: number;
  remainingCount?: number;
  sent?: Array<{ key: string; to: string; messageId: string; threadId: string }>;
  failed?: Array<{ key: string; to: string | null; error: string }>;
  skipped?: Array<{ key: string; reason: string }>;
  error?: string;
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

  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [gmailStatusLoading, setGmailStatusLoading] = useState(false);
  const [gmailSending, setGmailSending] = useState(false);
  const [gmailResult, setGmailResult] = useState<GmailSendResponse | null>(null);
  const [gmailSentKeys, setGmailSentKeys] = useState<string[]>([]);

  const pageOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  useEffect(() => {
    refreshGmailStatus();

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const success = params.get("success");
      const urlError = params.get("error");

      if (success) setError(success);
      if (urlError) setError(urlError);

      if (success || urlError) {
        params.delete("success");
        params.delete("error");
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
        window.history.replaceState({}, "", nextUrl);
      }
    }
  }, []);

  function draftKey(draft: DraftRow, index: number) {
    return `${draft.target_type}:${draft.target_id || index}`;
  }

  function isValidEmail(value: unknown) {
    const email = String(value ?? "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  const emailDrafts = drafts.filter(
    (draft) => String(draft.channel ?? "email").toLowerCase() === "email" && isValidEmail(draft.target_email)
  );

  const unsentEmailDrafts = emailDrafts.filter((draft, index) => !gmailSentKeys.includes(draftKey(draft, index)));

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
    const readyDrafts = drafts.filter((draft) => String(draft.target_email ?? "").trim());
    if (!readyDrafts.length) {
      setError("No email-ready drafts available.");
      return;
    }

    const firstDraft = readyDrafts[0];
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

    if (readyDrafts.length > 1) {
      setFeedback(
        "Browsers only allow one Outlook compose window per click. The first email has been opened and copied with the full AnnS signature and logo. Use ‘Open in Outlook + copy formatted email’ on each draft for the rest."
      );
    }
  }

  async function refreshGmailStatus() {
    setGmailStatusLoading(true);

    try {
      const res = await fetch("/api/email/google/status", {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));
      setGmailStatus(data);
    } catch {
      setGmailStatus({
        connected: false,
        error: "Could not check Gmail connection.",
      });
    } finally {
      setGmailStatusLoading(false);
    }
  }

  function connectGmail() {
    const returnTo =
      typeof window !== "undefined"
        ? window.location.pathname
        : `/sales-hub/campaigns/${campaignId}/runner`;

    window.location.href = `/api/email/google/connect?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function disconnectGmail() {
    if (!window.confirm("Disconnect the Gmail sender from this CRM?")) return;

    setGmailStatusLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/email/google/disconnect", {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Could not disconnect Gmail.");
        return;
      }

      setGmailStatus({
        connected: false,
        expectedEmail: gmailStatus?.expectedEmail ?? "sales@annscranehire.co.uk",
      });
      setGmailSentKeys([]);
      setGmailResult(null);
      setFeedback("Gmail sender disconnected.");
    } catch {
      setError("Could not disconnect Gmail.");
    } finally {
      setGmailStatusLoading(false);
    }
  }

  async function sendGmailBatch(batchSize: number) {
    if (!gmailStatus?.connected) {
      setError("Connect Gmail before sending campaign emails.");
      return;
    }

    if (!unsentEmailDrafts.length) {
      setError("No unsent email-ready drafts available.");
      return;
    }

    const batch = unsentEmailDrafts.slice(0, batchSize);

    setGmailSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/sales-campaigns/${campaignId}/send-gmail`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          drafts: batch,
          batch_limit: batchSize,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as GmailSendResponse;

      if (!res.ok) {
        setError(data?.error || "Could not send emails through Gmail.");
        setGmailResult(data);
        return;
      }

      const sentKeys = Array.isArray(data.sent) ? data.sent.map((row) => row.key).filter(Boolean) : [];

      setGmailSentKeys((current) => Array.from(new Set([...current, ...sentKeys])));
      setGmailResult(data);

      const sentCount = data.sent?.length ?? 0;
      const failedCount = data.failed?.length ?? 0;
      const skippedCount = data.skipped?.length ?? 0;

      if (sentCount > 0 && failedCount === 0) {
        setFeedback(`${sentCount} email${sentCount === 1 ? "" : "s"} sent through Gmail API.`);
      } else if (sentCount > 0) {
        setError(`${sentCount} sent, ${failedCount} failed, ${skippedCount} skipped.`);
      } else {
        setError(data?.error || `${failedCount} failed, ${skippedCount} skipped. No emails were sent.`);
      }
    } catch {
      setError("Could not send emails through Gmail.");
    } finally {
      setGmailSending(false);
    }
  }

  async function generateDrafts() {
    setLoading(true);
    setError(null);
    setGmailResult(null);
    setGmailSentKeys([]);

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
  const supplierDrafts = drafts.filter((row) => row.target_type === "supplier").length;
  const gmailConnected = Boolean(gmailStatus?.connected);

  return (
    <div style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 24 }}>Campaign Runner</h2>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Generate one set of drafts across all leads, customers and suppliers linked to <strong>{campaignName}</strong>.
      </p>
      <p style={{ marginTop: 6, opacity: 0.72, fontSize: 14 }}>
        Outlook deeplinks can prefill the recipient and subject, but they cannot inject the AnnS HTML signature and logo by themselves. Use the formatted-email buttons below so the message opens in Outlook with the branded signature copied and ready to paste.
      </p>

      {error ? (
        <div
          style={
            error.toLowerCase().includes("copied") ||
            error.toLowerCase().includes("opened") ||
            error.toLowerCase().includes("sent through gmail") ||
            error.toLowerCase().includes("connected") ||
            error.toLowerCase().includes("disconnected") ||
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
        <SummaryCard label="Supplier drafts" value={String(supplierDrafts)} />
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

      <section style={{ ...panelStyle, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Gmail API sender</div>
            <div style={{ marginTop: 6, fontSize: 14, opacity: 0.76 }}>
              Sends campaign emails from the connected sales mailbox using Google OAuth.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <button type="button" onClick={refreshGmailStatus} disabled={gmailStatusLoading} style={secondaryBtn}>
              {gmailStatusLoading ? "Checking..." : "Refresh Gmail status"}
            </button>

            {gmailConnected ? (
              <button type="button" onClick={disconnectGmail} disabled={gmailStatusLoading || gmailSending} style={secondaryBtn}>
                Disconnect Gmail
              </button>
            ) : (
              <button type="button" onClick={connectGmail} disabled={gmailStatusLoading} style={primaryBtn}>
                Connect Gmail
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <div style={gmailStatusLine}>
            <strong>Status:</strong>{" "}
            {gmailStatusLoading
              ? "Checking..."
              : gmailConnected
                ? `Connected as ${gmailStatus?.emailAddress || gmailStatus?.expectedEmail || "sales mailbox"}`
                : `Not connected${gmailStatus?.expectedEmail ? ` — expected ${gmailStatus.expectedEmail}` : ""}`}
          </div>

          {gmailStatus?.connectedByUsername ? (
            <div style={gmailStatusLine}>
              <strong>Connected by:</strong> {gmailStatus.connectedByUsername}
            </div>
          ) : null}

          {gmailStatus?.updatedAt ? (
            <div style={gmailStatusLine}>
              <strong>Last updated:</strong> {new Date(gmailStatus.updatedAt).toLocaleString()}
            </div>
          ) : null}

          {gmailStatus?.error ? (
            <div style={errorBox}>{gmailStatus.error}</div>
          ) : null}
        </div>

        {drafts.length > 0 && channel === "email" ? (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <div style={gmailStatsGrid}>
              <SummaryCard label="Email-ready drafts" value={String(emailDrafts.length)} />
              <SummaryCard label="Sent this session" value={String(gmailSentKeys.length)} />
              <SummaryCard label="Remaining" value={String(unsentEmailDrafts.length)} />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => sendGmailBatch(1)}
                disabled={!gmailConnected || gmailSending || unsentEmailDrafts.length === 0}
                style={secondaryBtn}
              >
                {gmailSending ? "Sending..." : "Send 1 test email through Gmail API"}
              </button>

              <button
                type="button"
                onClick={() => sendGmailBatch(50)}
                disabled={!gmailConnected || gmailSending || unsentEmailDrafts.length === 0}
                style={primaryBtn}
              >
                {gmailSending ? "Sending..." : "Send next 50 through Gmail API"}
              </button>
            </div>

            <div style={{ fontSize: 13, opacity: 0.72 }}>
              Use the 1-email test first. After that, send in batches of 50. This avoids one massive request and makes failures easier to spot.
            </div>
          </div>
        ) : null}

        {gmailResult ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Last Gmail send result</div>
            <div style={gmailStatsGrid}>
              <SummaryCard label="Sent" value={String(gmailResult.sent?.length ?? 0)} />
              <SummaryCard label="Failed" value={String(gmailResult.failed?.length ?? 0)} />
              <SummaryCard label="Skipped" value={String(gmailResult.skipped?.length ?? 0)} />
              <SummaryCard label="Processed" value={String(gmailResult.processedCount ?? 0)} />
            </div>

            {gmailResult.failed?.length ? (
              <div style={{ ...errorBox, marginTop: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Failed emails</div>
                {gmailResult.failed.map((row) => (
                  <div key={`${row.key}-${row.to || "missing"}`} style={{ marginTop: 4 }}>
                    {row.to || row.key}: {row.error}
                  </div>
                ))}
              </div>
            ) : null}

            {gmailResult.skipped?.length ? (
              <div style={{ ...errorBox, marginTop: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Skipped emails</div>
                {gmailResult.skipped.map((row) => (
                  <div key={row.key} style={{ marginTop: 4 }}>
                    {row.key}: {row.reason}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

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
          drafts.map((draft, index) => {
            const openHref =
              draft.target_type === "lead"
                ? `/sales-hub/leads/${draft.target_id}`
                : draft.target_type === "customer"
                  ? `/customers/${draft.target_id}`
                  : `/suppliers`;

            const key = draftKey(draft, index);
            const alreadySent = gmailSentKeys.includes(key);

            return (
              <div key={`${draft.target_type}-${draft.target_id}`} style={draftCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900 }}>
                      {draft.company_name}
                      {alreadySent ? (
                        <span style={sentBadge}>Sent through Gmail</span>
                      ) : null}
                    </div>
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
  marginTop: 16,
};

const gmailStatsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
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

const gmailStatusLine: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.82,
};

const sentBadge: React.CSSProperties = {
  display: "inline-block",
  marginLeft: 8,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(0,160,80,0.15)",
  border: "1px solid rgba(0,160,80,0.22)",
  fontSize: 12,
  fontWeight: 900,
};
