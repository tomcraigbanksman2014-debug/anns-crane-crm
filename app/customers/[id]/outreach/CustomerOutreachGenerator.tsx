"use client";

import { useMemo, useState } from "react";
import {
  buildFormattedEmailHtml,
  normaliseDraftBody,
  normaliseDraftSubject,
  SHARED_EMAIL_SIGNATURE_TEXT,
} from "../../../lib/emailSignature";

type Channel = "email" | "text" | "linkedin";
type Goal = "introduction" | "follow_up" | "reactivation" | "availability";
type Tone = "professional" | "friendly" | "direct";

type Props = {
  customerId: string;
  customerCompany: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  defaultService: string;
};

export default function CustomerOutreachGenerator({
  customerId,
  customerCompany,
  customerEmail,
  customerPhone,
  defaultService,
}: Props) {
  const [channel, setChannel] = useState<Channel>("email");
  const [goal, setGoal] = useState<Goal>("follow_up");
  const [tone, setTone] = useState<Tone>("professional");
  const [serviceFocus, setServiceFocus] = useState(defaultService || "");
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [customCta, setCustomCta] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [provider, setProvider] = useState<string | null>(null);

  const pageOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  function setFeedback(text: string, toneValue: "error" | "success") {
    setMessage(text);
    setMessageTone(toneValue);
  }

  function clearFeedbackSoon() {
    window.setTimeout(() => setMessage(null), 1800);
  }

  function getPlainBody() {
    return normaliseDraftBody(body);
  }

  function getPlainBodyWithSignature() {
    const cleaned = getPlainBody();
    if (!cleaned) return SHARED_EMAIL_SIGNATURE_TEXT;
    return `${cleaned}\n\n${SHARED_EMAIL_SIGNATURE_TEXT}`;
  }

  function getHtmlBody() {
    return buildFormattedEmailHtml({
      body: getPlainBody(),
      origin: pageOrigin,
    });
  }

  function buildOutlookHref(includeBody = false) {
    const to = String(customerEmail ?? "").trim();
    if (!to) return "";

    const parts = [
      `to=${encodeURIComponent(to)}`,
      subject ? `subject=${encodeURIComponent(normaliseDraftSubject(subject))}` : "",
      includeBody ? `body=${encodeURIComponent(getPlainBody())}` : "",
    ].filter(Boolean);

    return `https://outlook.office.com/mail/deeplink/compose?${parts.join("&")}`;
  }

  async function generate() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/customers/${customerId}/generate-outreach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel,
          goal,
          tone,
          service_focus: serviceFocus || null,
          availability_note: availabilityNote || null,
          custom_cta: customCta || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFeedback(data?.error || "Could not generate outreach.", "error");
        setProvider(null);
        return;
      }

      setSubject(String(data?.draft?.subject ?? ""));
      setBody(String(data?.draft?.body ?? ""));
      setProvider(String(data?.meta?.provider ?? ""));
      setFeedback("Outreach generated.", "success");
      clearFeedbackSoon();
    } catch {
      setFeedback("Could not generate outreach.", "error");
      setProvider(null);
    } finally {
      setLoading(false);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copied.`, "success");
      clearFeedbackSoon();
    } catch {
      setFeedback(`Could not copy ${label.toLowerCase()}.`, "error");
    }
  }

  async function copyFormattedEmail() {
    const html = getHtmlBody();
    const plain = getPlainBodyWithSignature();

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

      setFeedback("Formatted email copied.", "success");
      clearFeedbackSoon();
    } catch {
      setFeedback("Could not copy formatted email.", "error");
    }
  }

  function openInOutlook() {
    const href = buildOutlookHref(false);
    if (!href) {
      setFeedback("No customer email saved.", "error");
      return;
    }

    window.open(href, "_blank", "noopener,noreferrer");
  }

  async function openInOutlookAndCopy() {
    await copyFormattedEmail();
    const href = buildOutlookHref(false);
    if (!href) return;
    window.setTimeout(() => {
      window.open(href, "_blank", "noopener,noreferrer");
    }, 120);
  }

  const fullText = channel === "email" && subject
    ? `Subject: ${normaliseDraftSubject(subject)}\n\n${getPlainBodyWithSignature()}`
    : getPlainBodyWithSignature();

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 24 }}>AI Outreach Generator</h2>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Generate review-ready outreach for {customerCompany || "this customer"} using their
        existing relationship history.
      </p>
      <p style={{ marginTop: 6, opacity: 0.72, fontSize: 14 }}>
        For branded emails with the AnnS logo and full shared-mailbox signoff, copy the formatted
        email and paste it into Outlook.
      </p>

      {message ? (
        <div style={messageTone === "success" ? successBox : errorBox}>{message}</div>
      ) : null}

      {provider ? (
        <div style={provider === "openai" ? successBox : warnBox}>
          Draft provider: <strong>{provider === "openai" ? "AI" : "Fallback"}</strong>
        </div>
      ) : null}

      <div style={gridStyle}>
        <Field label="Channel">
          <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} style={inputStyle}>
            <option value="email">Email</option>
            <option value="text">Text</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </Field>

        <Field label="Goal">
          <select value={goal} onChange={(e) => setGoal(e.target.value as Goal)} style={inputStyle}>
            <option value="follow_up">Relationship follow-up</option>
            <option value="reactivation">Reactivation</option>
            <option value="availability">Availability push</option>
            <option value="introduction">Reintroduction</option>
          </select>
        </Field>

        <Field label="Tone">
          <select value={tone} onChange={(e) => setTone(e.target.value as Tone)} style={inputStyle}>
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="direct">Direct</option>
          </select>
        </Field>

        <Field label="Service focus">
          <input
            value={serviceFocus}
            onChange={(e) => setServiceFocus(e.target.value)}
            style={inputStyle}
            placeholder="e.g. crane hire, HIAB transport, contract lift"
          />
        </Field>

        <Field label="Availability note">
          <input
            value={availabilityNote}
            onChange={(e) => setAvailabilityNote(e.target.value)}
            style={inputStyle}
            placeholder="e.g. MTK 35 available next week"
          />
        </Field>

        <Field label="Custom call to action">
          <input
            value={customCta}
            onChange={(e) => setCustomCta(e.target.value)}
            style={inputStyle}
            placeholder="Optional custom closing line"
          />
        </Field>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={generate} disabled={loading} style={primaryBtn}>
          {loading ? "Generating..." : "Generate outreach"}
        </button>

        {channel === "email" && customerEmail ? (
          <>
            <button type="button" onClick={openInOutlook} style={secondaryBtnButton}>
              Open in Outlook
            </button>
            <button type="button" onClick={openInOutlookAndCopy} style={secondaryBtnButton}>
              Open Outlook + copy email
            </button>
          </>
        ) : null}

        {customerPhone ? (
          <a href={`tel:${customerPhone}`} style={secondaryBtn}>
            Call customer
          </a>
        ) : null}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={previewCard}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Generated draft</div>

          {channel === "email" && subject ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Subject</div>
              <div style={{ marginTop: 4, fontWeight: 700, whiteSpace: "pre-wrap" }}>{normaliseDraftSubject(subject)}</div>
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={() => copyText(normaliseDraftSubject(subject), "Subject")} style={secondaryBtnButton}>
                  Copy subject
                </button>
              </div>
            </div>
          ) : null}

          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Body</div>
          <textarea
            value={getPlainBodyWithSignature()}
            readOnly
            style={textareaStyle}
            placeholder="Generated draft will appear here"
          />

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => copyText(getPlainBodyWithSignature(), "Body")} style={secondaryBtnButton}>
              Copy plain email
            </button>
            {channel === "email" ? (
              <button type="button" onClick={copyFormattedEmail} style={secondaryBtnButton}>
                Copy formatted email
              </button>
            ) : null}
            <button type="button" onClick={() => copyText(fullText, "Full draft")} style={secondaryBtnButton}>
              Copy full draft
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
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

const previewCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 12,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.72,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  outline: "none",
  fontSize: 15,
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 260,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.95)",
  outline: "none",
  fontSize: 15,
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
  background: "#fff",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.14)",
};

const secondaryBtnButton: React.CSSProperties = {
  ...secondaryBtn,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  background: "rgba(183, 28, 28, 0.1)",
  border: "1px solid rgba(183, 28, 28, 0.2)",
  color: "#7f1d1d",
  fontWeight: 700,
};

const successBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  background: "rgba(22, 163, 74, 0.1)",
  border: "1px solid rgba(22, 163, 74, 0.2)",
  color: "#166534",
  fontWeight: 700,
};

const warnBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  background: "rgba(217, 119, 6, 0.1)",
  border: "1px solid rgba(217, 119, 6, 0.2)",
  color: "#92400e",
  fontWeight: 700,
};
