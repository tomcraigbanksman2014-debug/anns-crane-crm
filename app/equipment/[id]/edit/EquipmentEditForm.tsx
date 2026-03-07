"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function EquipmentEditForm({
  equipment,
}: {
  equipment: any;
}) {
  const router = useRouter();

  const [name, setName] = useState(equipment?.name ?? "");
  const [assetNumber, setAssetNumber] = useState(equipment?.asset_number ?? "");
  const [type, setType] = useState(equipment?.type ?? "");
  const [capacity, setCapacity] = useState(equipment?.capacity ?? "");
  const [status, setStatus] = useState(equipment?.status ?? "Available");
  const [notes, setNotes] = useState(equipment?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!name.trim()) {
      setMsg("Equipment name is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/equipment/${encodeURIComponent(equipment.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          asset_number: assetNumber.trim() || null,
          type: type.trim() || null,
          capacity: capacity.trim() || null,
          status: status || "Available",
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not save equipment.");
        return;
      }

      router.replace("/equipment");
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={card}>
      {msg && <div style={errorBox}>{msg}</div>}

      <div style={grid12}>
        <Field span={6} label="Name *">
          <input value={name} onChange={(e) => setName(e.target.value)} style={input} />
        </Field>

        <Field span={6} label="Asset number">
          <input value={assetNumber} onChange={(e) => setAssetNumber(e.target.value)} style={input} />
        </Field>

        <Field span={4} label="Type">
          <input value={type} onChange={(e) => setType(e.target.value)} style={input} />
        </Field>

        <Field span={4} label="Capacity">
          <input value={capacity} onChange={(e) => setCapacity(e.target.value)} style={input} />
        </Field>

        <Field span={4} label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
            <option>Available</option>
            <option>Booked later today</option>
            <option>Unavailable</option>
            <option>In Service</option>
          </select>
        </Field>

        <Field span={12} label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={textarea} />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving} style={primaryBtn}>
          {saving ? "Saving..." : "Save changes"}
        </button>

        <a href="/equipment" style={secondaryBtn}>
          Cancel
        </a>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span: number;
}) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const card: React.CSSProperties = {
  width: "min(1150px, 95vw)",
  margin: "0 auto",
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const grid12: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 12,
  marginTop: 12,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const input: React.CSSProperties = {
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

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 140,
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
  padding: "12px 16px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "white",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
