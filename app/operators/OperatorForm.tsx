"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type OperatorFormData = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  notes?: string | null;
};

export default function OperatorForm({
  mode,
  operatorId,
  initial,
}: {
  mode: "create" | "edit";
  operatorId?: string;
  initial?: OperatorFormData | null;
}) {
  const router = useRouter();

  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    try {
      const url =
        mode === "create" ? "/api/operators" : `/api/operators/${operatorId}`;

      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone,
          status,
          notes,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not save operator.");
        return;
      }

      router.push("/operators");
      router.refresh();
    } catch {
      setMsg("Could not save operator.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={formWrap}>
      <div style={gridStyle}>
        <Field
          label="Full name"
          value={fullName}
          onChange={setFullName}
          required
        />
        <Field
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
        />
        <Field
          label="Phone"
          value={phone}
          onChange={setPhone}
          type="tel"
        />

        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={inputStyle}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          style={textAreaStyle}
        />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button type="submit" disabled={saving} style={saveBtn}>
          {saving
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
            ? "Create operator"
            : "Save operator"}
        </button>

        <a href="/operators" style={cancelBtn}>
          Cancel
        </a>
      </div>

      {msg ? <div style={msgStyle}>{msg}</div> : null}
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
        required={required}
      />
    </div>
  );
}

const formWrap: React.CSSProperties = {
  marginTop: 16,
  padding: 18,
  borderRadius: 14,
  background: "rgba(255,255,255,0.18)",
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.78,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
};

const textAreaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
  resize: "vertical",
};

const saveBtn: React.CSSProperties = {
  padding: "10px 16px",
  background: "#111",
  color: "#fff",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
};

const cancelBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 16px",
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  textDecoration: "none",
  fontWeight: 800,
};

const msgStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  fontWeight: 700,
  color: "#b00020",
};
