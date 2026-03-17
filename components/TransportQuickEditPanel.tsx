"use client";

import { useState } from "react";

export default function TransportQuickEditPanel({
  job,
  vehicles,
  operators,
  onClose,
}: any) {
  const [loading, setLoading] = useState(false);

  async function handleSave(formData: FormData) {
    setLoading(true);

    await fetch(`/api/transport-jobs/${job.id}`, {
      method: "POST",
      body: formData,
    });

    window.location.reload();
  }

  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={header}>
          <h2>Edit Transport</h2>
          <button onClick={onClose}>✕</button>
        </div>

        <form action={handleSave} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="id" value={job.id} />

          <label>Vehicle</label>
          <select name="vehicle_id" defaultValue={job.vehicle_id}>
            <option value="">—</option>
            {vehicles.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.reg_number})
              </option>
            ))}
          </select>

          <label>Driver</label>
          <select name="operator_id" defaultValue={job.operator_id}>
            <option value="">—</option>
            {operators.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.full_name}
              </option>
            ))}
          </select>

          <label>Status</label>
          <select name="status" defaultValue={job.status}>
            <option value="planned">Planned</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>

          <label>Collection Time</label>
          <input type="time" name="collection_time" defaultValue={job.collection_time || ""} />

          <label>Delivery Time</label>
          <input type="time" name="delivery_time" defaultValue={job.delivery_time || ""} />

          <label>Notes</label>
          <textarea name="notes" defaultValue={job.notes || ""} />

          <button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 999,
};

const panel: React.CSSProperties = {
  width: 400,
  background: "#fff",
  padding: 20,
  height: "100%",
  overflowY: "auto",
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 20,
};
