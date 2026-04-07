"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TemplateRecord = {
  id: string;
  name: string | null;
  description: string | null;
  channel: string | null;
  goal: string | null;
  tone: string | null;
  service_focus: string | null;
  availability_note: string | null;
  custom_cta: string | null;
  subject_hint: string | null;
  body_hint: string | null;
  is_active: boolean | null;
};

const CHANNELS = ["email", "text", "linkedin"] as const;
const GOALS = ["introduction", "follow_up", "reactivation", "availability"] as const;
const TONES = ["professional", "friendly", "direct"] as const;

function templateDefaults(template?: TemplateRecord | null) {
  return {
    name: template?.name ?? "",
    description: template?.description ?? "",
    channel: template?.channel ?? "email",
    goal: template?.goal ?? "introduction",
    tone: template?.tone ?? "professional",
    service_focus: template?.service_focus ?? "",
    availability_note: template?.availability_note ?? "",
    custom_cta: template?.custom_cta ?? "",
    subject_hint: template?.subject_hint ?? "",
    body_hint: template?.body_hint ?? "",
    is_active: template?.is_active ?? true,
  };
}

export default function TemplateForm({
  mode,
  template,
}: {
  mode: "create" | "edit";
  template?: TemplateRecord | null;
}) {
  const router = useRouter();
  const defaults = useMemo(() => templateDefaults(template), [template]);

  const [name, setName] = useState(defaults.name);
  const [description, setDescription] = useState(defaults.description);
  const [channel, setChannel] = useState(defaults.channel);
  const [goal, setGoal] = useState(defaults.goal);
  const [tone, setTone] = useState(defaults.tone);
  const [serviceFocus, setServiceFocus] = useState(defaults.service_focus);
  const [availabilityNote, setAvailabilityNote] = useState(defaults.availability_note);
  const [customCta, setCustomCta] = useState(defaults.custom_cta);
  const [subjectHint, setSubjectHint] = useState(defaults.subject_hint);
  const [bodyHint, setBodyHint] = useState(defaults.body_hint);
  const [isActive, setIsActive] = useState(defaults.is_active);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(defaults.name);
    setDescription(defaults.description);
    setChannel(defaults.channel);
    setGoal(defaults.goal);
    setTone(defaults.tone);
    setServiceFocus(defaults.service_focus);
    setAvailabilityNote(defaults.availability_note);
    setCustomCta(defaults.custom_cta);
    setSubjectHint(defaults.subject_hint);
    setBodyHint(defaults.body_hint);
    setIsActive(defaults.is_active);
  }, [defaults]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Template name is required.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        channel,
        goal,
        tone,
        service_focus: serviceFocus.trim() || null,
        availability_note: availabilityNote.trim() || null,
        custom_cta: customCta.trim() || null,
        subject_hint: subjectHint.trim() || null,
        body_hint: bodyHint.trim() || null,
        is_active: isActive,
      };

      const endpoint =
        mode === "create"
          ? "/api/sales-templates/create"
          : `/api/sales-templates/${template?.id}/update`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to save template.");
      }

      const targetId = mode === "create" ? json?.id : template?.id;
      router.push(targetId ? `/sales-hub/templates/${targetId}` : "/sales-hub/templates");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to save template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 24 }}>
        {mode === "create" ? "Create template" : "Edit template"}
      </h2>

      {error ? <div style={errorBox}>{error}</div> : null}

      <div style={gridStyle}>
        <Field label="Template name *">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </Field>

        <Field label="Channel">
          <select value={channel} onChange={(e) => setChannel(e.target.value)} style={inputStyle}>
            {CHANNELS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Goal">
          <select value={goal} onChange={(e) => setGoal(e.target.value)} style={inputStyle}>
            {GOALS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tone">
          <select value={tone} onChange={(e) => setTone(e.target.value)} style={inputStyle}>
            {TONES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Service focus">
          <input
            value={serviceFocus}
            onChange={(e) => setServiceFocus(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Contract lift"
          />
        </Field>

        <Field label="Availability note">
          <input
            value={availabilityNote}
            onChange={(e) => setAvailabilityNote(e.target.value)}
            style={inputStyle}
            placeholder="e.g. GMK4080-1 available next week"
          />
        </Field>

        <Field label="Custom CTA">
          <input
            value={customCta}
            onChange={(e) => setCustomCta(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Reply with your next lift or delivery requirement"
          />
        </Field>

        <Field label="Subject hint">
          <input
            value={subjectHint}
            onChange={(e) => setSubjectHint(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Crane and transport support for upcoming work"
          />
        </Field>

        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ ...inputStyle, minHeight: 88, paddingTop: 12, paddingBottom: 12 }}
              placeholder="Internal notes about when this template should be used"
            />
          </Field>
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Body hint">
            <textarea
              value={bodyHint}
              onChange={(e) => setBodyHint(e.target.value)}
              style={{ ...inputStyle, minHeight: 180, paddingTop: 12, paddingBottom: 12 }}
              placeholder="Write the core outreach body you want campaigns and draft generation to use"
            />
          </Field>
        </div>

        <Field label="Status">
          <label style={checkWrap}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>{isActive ? "Active" : "Inactive"}</span>
          </label>
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving || !name.trim()} style={primaryBtn}>
          {saving
            ? mode === "create"
              ? "Saving template…"
              : "Updating template…"
            : mode === "create"
            ? "Create template"
            : "Update template"}
        </button>

        <a href="/sales-hub/templates" style={secondaryBtn}>
          Cancel
        </a>
      </div>
    </form>
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
    <div style={{ display: "grid", gap: 6 }}>
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

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  fontSize: 14,
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
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
};

const checkWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 42,
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};
