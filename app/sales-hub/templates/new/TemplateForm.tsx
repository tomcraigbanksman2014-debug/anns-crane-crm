"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";

type Template = {
  id?: string;
  name?: string | null;
  description?: string | null;
  channel?: string | null;
  goal?: string | null;
  tone?: string | null;
  service_focus?: string | null;
  availability_note?: string | null;
  custom_cta?: string | null;
  subject_hint?: string | null;
  body_hint?: string | null;
  is_active?: boolean | null;
};

const CHANNELS = ["email", "text", "linkedin"];
const GOALS = ["introduction", "follow_up", "reactivation", "availability"];
const TONES = ["professional", "friendly", "direct"];

export default function TemplateForm({
  mode,
  template,
}: {
  mode: "create" | "edit";
  template?: Template | null;
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [channel, setChannel] = useState(template?.channel ?? "email");
  const [goal, setGoal] = useState(template?.goal ?? "introduction");
  const [tone, setTone] = useState(template?.tone ?? "professional");
  const [serviceFocus, setServiceFocus] = useState(template?.service_focus ?? "");
  const [availabilityNote, setAvailabilityNote] = useState(template?.availability_note ?? "");
  const [customCta, setCustomCta] = useState(template?.custom_cta ?? "");
  const [subjectHint, setSubjectHint] = useState(template?.subject_hint ?? "");
  const [bodyHint, setBodyHint] = useState(template?.body_hint ?? "");
  const [isActive, setIsActive] = useState(Boolean(template?.is_active ?? true));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!template) return;
    setName(template.name ?? "");
    setDescription(template.description ?? "");
    setChannel(template.channel ?? "email");
    setGoal(template.goal ?? "introduction");
    setTone(template.tone ?? "professional");
    setServiceFocus(template.service_focus ?? "");
    setAvailabilityNote(template.availability_note ?? "");
    setCustomCta(template.custom_cta ?? "");
    setSubjectHint(template.subject_hint ?? "");
    setBodyHint(template.body_hint ?? "");
    setIsActive(Boolean(template.is_active ?? true));
  }, [template]);

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

      if (mode === "create") {
        const res = await fetch("/api/sales-templates/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || "Failed to save template.");
        }

        router.push(`/sales-hub/templates/${data?.id ?? ""}`);
        router.refresh();
        return;
      }

      const res = await fetch(`/api/sales-templates/${template?.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to update template.");
      }

      router.push(`/sales-hub/templates/${template?.id}`);
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
            placeholder="e.g. crane hire, HIAB transport"
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

        <Field label="Custom CTA">
          <input
            value={customCta}
            onChange={(e) => setCustomCta(e.target.value)}
            style={inputStyle}
            placeholder="Optional closing line"
          />
        </Field>

        <Field label="Subject hint">
          <input
            value={subjectHint}
            onChange={(e) => setSubjectHint(e.target.value)}
            style={inputStyle}
            placeholder="Optional subject guidance"
          />
        </Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={textareaStyle}
          placeholder="Internal notes about when to use this template"
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Body hint</label>
        <textarea
          value={bodyHint}
          onChange={(e) => setBodyHint(e.target.value)}
          style={textareaStyle}
          placeholder="Optional guidance for message structure, angle or important points"
        />
      </div>

      <label style={checkboxRow}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>Template active</span>
      </label>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <button type="submit" disabled={saving} style={primaryBtn}>
          {saving ? "Saving..." : mode === "create" ? "Save template" : "Save changes"}
        </button>
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

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
  minHeight: 110,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
  resize: "vertical",
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginTop: 14,
  fontWeight: 700,
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

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};
