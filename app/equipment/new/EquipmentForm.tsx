"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Equipment = {
  id: string;
  name: string | null;
  asset_number: string | null;
  type: string | null;
  capacity: string | null;
  status: string | null;
  certification_expires_on: string | null; // ISO date string
  notes: string | null;
};

export default function EquipmentForm({
  mode,
  equipment,
}: {
  mode: "create" | "edit";
  equipment?: Equipment;
}) {
  const router = useRouter();

  const [name, setName] = useState(equipment?.name ?? "");
  const [assetNumber, setAssetNumber] = useState(equipment?.asset_number ?? "");
  const [type, setType] = useState(equipment?.type ?? "");
  const [capacity, setCapacity] = useState(equipment?.capacity ?? "");
  const [status, setStatus] = useState(equipment?.status ?? "available");
  const [certExpiry, setCertExpiry] = useState(
    equipment?.certification_expires_on ?? ""
  );
  const [notes, setNotes] = useState(equipment?.notes ?? "");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!name.trim()) {
      setMsg("Name is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/equipment/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          id: equipment?.id ?? null,
          name: name.trim(),
          asset_number: assetNumber.trim() || null,
          type: type.trim() || null,
          capacity: capacity.trim() || null,
          status,
          certification_expires_on: certExpiry || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || "Save failed");
        return;
      }

      router.replace("/equipment");
      router.refresh();
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label style={labelStyle}>Name *</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. 60T Liebherr / Jekko / HIAB etc"
        style={inputStyle}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Asset number / Reg</label>
          <input
            value={assetNumber}
            onChange={(e) => setAssetNumber(e.target.value)}
            placeholder="e.g. SN25 XXG"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={inputStyle}
          >
            <option value="available">available</option>
            <option value="on_hire">on_hire</option>
            <option value="maintenance">maintenance</option>
            <option value="out_of_service">out_of_service</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Type</label>
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="e.g. Crane / HIAB / Trailer / Basket"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Capacity</label>
          <input
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="e.g. 60T"
            style={inputStyle}
          />
        </div>
      </div>

      <label style={labelStyle}>Certification expiry</label>
      <input
        type="date"
        value={certExpiry}
        onChange={(e) => setCertExpiry(e.target.value)}
        style={inputStyle}
      />

      <label style={labelStyle}>Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Maintenance notes, man riding expiry, etc"
        rows={5}
        style={{ ...inputStyle, resize: "vertical" }}
      />

      <button
        type="submit"
        disabled={loading || !name.trim()}
        style={{
          width: "100%",
          marginTop: 14,
          padding: "12px 14px",
          borderRadius: 10,
          border: "none",
          background: "#111",
          color: "white",
          fontSize: 15,
          cursor: loading || !name.trim() ? "not-allowed" : "pointer",
          opacity: loading || !name.trim() ? 0.7 : 1,
          fontWeight: 900,
        }}
      >
        {loading ? "Saving..." : mode === "create" ? "Save equipment" : "Update equipment"}
      </button>

      {msg && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(255,0,0,0.10)",
            border: "1px solid rgba(255,0,0,0.25)",
          }}
        >
          {msg}
        </div>
      )}
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginTop: 10,
  marginBottom: 6,
  fontWeight: 800,
  opacity: 0.85,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 16,
  background: "rgba(255,255,255,0.85)",
};
