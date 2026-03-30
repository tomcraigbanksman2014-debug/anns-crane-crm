"use client";

import { useState } from "react";

type Channel = "email" | "text" | "linkedin";
type Goal = "introduction" | "follow_up" | "reactivation" | "availability";
type Tone = "professional" | "friendly" | "direct";

export default function OutreachGenerator({
  leadId,
  defaultService,
  leadCompany,
  doNotContact,
}: {
  leadId: string;
  defaultService: string;
  leadCompany: string;
  doNotContact: boolean;
}) {
  const [channel, setChannel] = useState<Channel>("email");
  const [goal, setGoal] = useState<Goal>("introduction");
  const [tone, setTone] = useState<Tone>("professional");
  const [serviceFocus, setServiceFocus] = useState(defaultService || "");
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [customCta, setCustomCta] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function generate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sales-leads/${leadId}/generate-outreach`, {
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
        setError(data?.error || "Could not generate outreach.");
        return;
      }

      setSubject(String(data?.draft?.subject ?? ""));
      setBody(String(data?.draft?.body ?? ""));
    } catch {
      setError("Could not generate outreach.");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setError(`${label} copied.`);
      setTimeout(() => setError(null), 1800);
    } catch {
      setError(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 24 }}>Outreach Generator</h2>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Generate review-ready outreach for {leadCompany || "this lead"}.
      </p>

      {doNotContact ? (
        <div style={warnBox}>
          This lead is marked <strong>Do Not Contact</strong>. Remove that flag before generating outreach.
        </div>
      ) : null}

      {error ? (
        <div
          style={
            error === "Subject copied." || error === "Body copied."
              ? successBox
              : errorBox
          }
        >
          {error}
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
            <option value="introduction">Introduction</option>
            <option value="follow_up">Follow-up</option>
            <option value="reactivation">Reactivation</option>
            <option value="availability">Availability push</option>
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
            placeholder="e.g. MTK 35 available tomorrow"
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
        <button
          type="button"
          onClick={generate}
          disabled={loading || doNotContact}
          style={primaryBtn}
        >
          {loading ? "Generating..." : "Generate outreach"}
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={previewCard}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Generated draft</div>

          {channel === "email" && subject ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Subject</div>
              <div style={{ marginTop: 4, fontWeight: 700, whiteSpace: "pre-wrap" }}>{subject}</div>
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={() => copyText(subject, "Subject")} style={secondaryBtn}>
                  Copy subject
                </button>
              </div>
            </div>
          ) : null}

          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Body</div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={textareaStyle}
            placeholder="Generated draft will appear here"
          />

          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={() => copyText(body, "Body")} style={secondaryBtn}>
              Copy body
            </button>
          </div>
        </div>
      </div>
    </div>
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

const warnBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,180,0,0.16)",
  border: "1px solid rgba(255,180,0,0.18)",
};
