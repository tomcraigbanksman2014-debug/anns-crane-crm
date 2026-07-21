"use client";

import { useState } from "react";

export default function CustomerArchiveButton({
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
      archived ? "/api/customers/restore" : "/api/customers/archive",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: id }),
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
