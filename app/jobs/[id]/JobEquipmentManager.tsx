"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JobEquipmentManager({ initialAllocations = [] }: any) {
  const router = useRouter();

  const [allocations, setAllocations] = useState(initialAllocations);

  const [draftNames, setDraftNames] = useState<Record<string, string>>(
    Object.fromEntries(
      initialAllocations.map((a: any) => [a.id, a.item_name || ""])
    )
  );

  async function updateAllocation(id: string, patch: any) {
    await fetch(`/api/job-equipment/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    router.refresh();
  }

  return (
    <div>
      {allocations.map((item: any) => (
        <div key={item.id} style={{ marginBottom: 12 }}>

          {/* ✅ FIXED INPUT (NO MORE BROKEN TYPING) */}
          <input
            value={draftNames[item.id] ?? ""}
            onChange={(e) =>
              setDraftNames((prev) => ({
                ...prev,
                [item.id]: e.target.value,
              }))
            }
            onBlur={() =>
              updateAllocation(item.id, {
                ...item,
                item_name:
                  draftNames[item.id] && draftNames[item.id].trim().length > 0
                    ? draftNames[item.id]
                    : null,
              })
            }
            style={{
              width: "100%",
              height: 40,
              padding: "0 10px",
              borderRadius: 8,
              border: "1px solid #ccc",
            }}
          />
        </div>
      ))}
    </div>
  );
}
