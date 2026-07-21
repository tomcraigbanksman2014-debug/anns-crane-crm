"use client";

import { useState } from "react";

export default function EquipmentArchiveButton({
  equipmentId,
  archived,
}: {
  equipmentId: string;
  archived: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;

    const action = archived ? "restore" : "archive";
    const confirmed = window.confirm(
      archived
        ? "Restore this equipment?"
        : "Archive this equipment? It will be hidden from active dropdowns."
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      const res = await fetch(`/api/equipment/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ equipmentId }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        window.alert(json?.error || `Could not ${action} equipment.`);
        return;
      }

      window.location.reload();
    } catch {
      window.alert(`Could not ${action} equipment.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      style={archived ? restoreBtn : archiveBtn}
    >
      {busy ? "Working..." : archived ? "Restore" : "Archive"}
    </button>
  );
}

const archiveBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  color: "#8b0000",
  border: "1px solid rgba(255,0,0,0.18)",
  fontWeight: 800,
  cursor: "pointer",
};

const restoreBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.12)",
  color: "#0b7a4b",
  border: "1px solid rgba(0,180,120,0.18)",
  fontWeight: 800,
  cursor: "pointer",
};
