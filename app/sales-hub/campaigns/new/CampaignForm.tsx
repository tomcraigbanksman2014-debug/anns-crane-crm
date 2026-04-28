"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = {
  id?: string;
  name?: string | null;
  description?: string | null;
  status?: string | null;
  channel?: string | null;
  goal?: string | null;
  tone?: string | null;
  template_id?: string | null;
  service_focus?: string | null;
  availability_note?: string | null;
  scheduled_for?: string | null;
};

type TemplateOption = {
  id: string;
  name: string;
  channel?: string | null;
  goal?: string | null;
};

const STATUSES = ["Draft", "Active", "Completed", "Cancelled"];
const CHANNELS = ["email", "text", "linkedin"];
const GOALS = [
  { value: "introduction", label: "General introduction" },
  { value: "recent_customer_thank_you", label: "Recent customer thank-you" },
  { value: "supplier_cross_hire", label: "Supplier / cross-hire request" },
  { value: "dormant_recovery", label: "Dormant customer recovery" },
  { value: "quote_follow_up", label: "Quote follow-up" },
  { value: "cross_sell", label: "Cross-sell services" },
  { value: "availability", label: "Availability notice" },
  { value: "follow_up", label: "General follow up" },
  { value: "reactivation", label: "General reactivation" },
];
const TONES = ["professional", "friendly", "direct"];

function localDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

export default function CampaignForm({
  mode,
  campaign,
  templates,
}: {
  mode: "create" | "edit";
  campaign?: Campaign | null;
  templates: TemplateOption[];
}) {
  const router = useRouter();

  const [name, setName] = useState(campaign?.name ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [status, setStatus] = useState(campaign?.status ?? "Draft");
  const [channel, setChannel] = useState(campaign?.channel ?? "email");
  const [goal, setGoal] = useState(campaign?.goal ?? "introduction");
  const [tone, setTone] = useState(campaign?.tone ?? "professional");
  const [templateId, setTemplateId] = useState(campaign?.template_id ?? "");
  const [serviceFocus, setServiceFocus] = useState(campaign?.service_focus ?? "");
  const [availabilityNote, setAvailabilityNote] = useState(campaign?.availability_note ?? "");
  const [scheduledFor, setScheduledFor] = useState(localDateInputValue(campaign?.scheduled_for));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaign) return;
    setName(campaign.name ?? "");
    setDescription(campaign.description ?? "");
    setStatus(campaign.status ?? "Draft");
    setChannel(campaign.channel ?? "email");
    setGoal(campaign.goal ?? "introduction");
    setTone(campaign.tone ?? "professional");
    setTemplateId(campaign.template_id ?? "");
    setServiceFocus(campaign.service_focus ?? "");
    setAvailabilityNote(campaign.availability_note ?? "");
    setScheduledFor(localDateInputValue(campaign.scheduled_for));
  }, [campaign]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Campaign name is required.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        status,
        channel,
        goal,
        tone,
        template_id: templateId || null,
        service_focus: serviceFocus.trim() || null,
        availability_note: availabilityNote.trim() || null,
        scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      };

      if (mode === "create") {
        const res = await fetch("/api/sales-campaigns/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to save campaign.");

        router.push(`/sales-hub/campaigns/${data?.id ?? ""}`);
        router.refresh();
        return;
      }

      const res = await fetch(`/api/sales-campaigns/${campaign?.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to update campaign.");

      router.push(`/sales-hub/campaigns/${campaign?.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to save campaign.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 24 }}>
        {mode === "create" ? "Create campaign" : "Edit campaign"}
      </h2>

      {error ? <div style={errorBox}>{error}</div> : null}

      <div style={gridStyle}>
        <Field label="Campaign name *">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </Field>

        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
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
              <option key={item.value} value={item.value}>
                {item.label}
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

        <Field label="Template">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={inputStyle}>
            <option value="">No template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Service focus">
          <input
            value={serviceFocus}
            onChange={(e) => setServiceFocus(e.target.value)}
            style={inputStyle}
            placeholder="e.g. HIAB transport"
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

        <Field label="Scheduled for">
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={textareaStyle}
          placeholder="Internal notes for this campaign"
        />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <button type="submit" disabled={saving} style={primaryBtn}>
          {saving ? "Saving..." : mode === "create" ? "Save campaign" : "Save changes"}
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
