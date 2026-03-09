"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type EntryType = "call" | "email" | "note";

type Props = {
  customerId: string;
  initialType?: EntryType;
  initialSubject?: string;
};

export default function AddCorrespondenceForm({
  customerId,
  initialType = "note",
  initialSubject = "",
}: Props) {
  const router = useRouter();

  const [entryType, setEntryType] = useState<EntryType>(initialType);
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntryType(initialType);
  }, [initialType]);

  useEffect(() => {
    setSubject(initialSubject);
  }, [initialSubject]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!message.trim()) {
      setError("Message is required");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch(`/api/customers/${customerId}/correspondence/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entry_type: entryType,
          subject,
          message,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error ?? "Failed to save correspondence");
        return;
      }

      setEntryType(initialType);
      setSubject(initialSubject);
      setMessage("");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save correspondence");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={cardStyle}>
      <h2 style={{ marginTop: 0, marginBottom: 14, fontSize: 22 }}>
        Add correspondence
      </h2>

      {error && <div style={errorBox}>{error}</div>}

      <div style={fieldWrap}>
        <label style={labelStyle}>Type</label>
        <select
          value={entryType}
          onChange={(e) => setEntryType(e.target.value as EntryType)}
          style={inputStyle}
        >
          <option value="note">Note</option>
          <option value="call">Call</option>
          <option value="email">Email</option>
        </select>
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Optional subject"
          style={inputStyle}
        />
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter note, call summary, or email details"
          rows={6}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      <button type="submit" disabled={saving} style={buttonStyle}>
        {saving ? "Saving..." : "Save correspondence"}
      </button>
    </form>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.7)",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
