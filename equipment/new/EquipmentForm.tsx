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
  certification_expires_on: string | null;
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
  const [msgType, setMsgType] = useState<"error" | "success">("error");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!name.trim()) {
      setMsgType("error");
      setMsg("Name is required");
      return;
    }

    setLoading(true);
    try {
      const endpoint =
        mode === "create"
          ? "/api/equipment"
          : `/api/equipment/${encodeURIComponent(equipment!.id)}`;

      const method = mode === "create" ? "POST" : "PATCH";

      const payload = {
        name: name.trim(),
        asset_number: assetNumber.trim() || null,
        type: type.trim() || null,
        capacity: capacity.trim() || null,
        status: status.trim().toLowerCase() || "available",
        certification_expires_on: certExpiry || null,
        notes: notes.trim() || null,
      };

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsgType("error");
        setMsg(data?.error || "Could not save equipment.");
        return;
      }

      setMsgType("success");
      setMsg(mode === "create" ? "Equipment saved." : "Equipment updated.");

      router.replace("/equipment");
      router.refresh();
    } catch {
      setMsgType("error");
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
        placeholder="e.g. 60t test crane"
        style={inputStyle}
      />

      <div style={grid2}>
        <div>
          <label style={labelStyle}>Asset number</label>
          <input
            value={assetNumber}
            onChange={(e) => setAssetNumber(e.target.value)}
            placeholder="e.g. db455sg"
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
            <option value="available">Available</option>
            <option value="on_hire">On Hire</option>
            <option value="maintenance">Maintenance</option>
            <option value="out_of_service">Out of Service</option>
          </select>
        </div>
      </div>

      <div style={grid3}>
        <div>
          <label style={labelStyle}>Type</label>
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="e.g. Crane"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Capacity</label>
          <input
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="e.g. 40t"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Certification expiry</label>
          <input
            type="date"
            value={certExpiry}
            onChange={(e) => setCertExpiry(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <label style={labelStyle}>Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        rows={5}
        style={textareaStyle}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          type="submit"
          disabled={loading || !name.trim()}
          style={submitBtn}
        >
          {loading
            ? "Saving..."
            : mode === "create"
            ? "Save equipment"
            : "Update equipment"}
        </button>

        <a href="/equipment" style={cancelBtn}>
          Cancel
        </a>
      </div>

      {msg && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background:
              msgType === "success"
                ? "rgba(0,180,120,0.10)"
                : "rgba(255,0,0,0.10)",
            border:
              msgType === "success"
                ? "1px solid rgba(0,180,120,0.25)"
                : "1px solid rgba(255,0,0,0.25)",
          }}
        >
          {msg}
        </div>
      )}
    </form>
  );
}

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 12,
};

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
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 120,
};

const submitBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "white",
  fontSize: 15,
  cursor: "pointer",
  fontWeight: 900,
};

const cancelBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};
