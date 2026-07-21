"use client";

import { useState } from "react";

export default function SupplierArchiveButton({
  id,
  archived,
}: {
  id: string;
  archived: boolean;
}) {
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);

    const res = await fetch(
      archived ? "/api/suppliers/restore" : "/api/suppliers/archive",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: id }),
      }
    );

    if (!res.ok) {
      alert("Failed");
    } else {
      window.location.reload();
    }

    setLoading(false);
  }

  return (
    <button onClick={run} disabled={loading}>
      {archived ? "Restore" : "Archive"}
    </button>
  );
}
