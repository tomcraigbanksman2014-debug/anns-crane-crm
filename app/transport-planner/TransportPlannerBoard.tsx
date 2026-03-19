"use client";

import { useEffect, useState } from "react";

export default function TransportPlannerBoard() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const res = await fetch("/api/transport-planner/board");
    const data = await res.json();

    // ✅ FIX: DO NOT FILTER VEHICLES BY ASSIGNMENT
    setVehicles(data.vehicles || []);
    setJobs(data.jobs || []);
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Transport Planner</h2>

      <div style={{ display: "grid", gap: 12 }}>
        {vehicles.map((v) => (
          <div
            key={v.id}
            style={{
              padding: 12,
              border: "1px solid #ccc",
              borderRadius: 8,
            }}
          >
            <strong>{v.name}</strong> ({v.reg_number})
          </div>
        ))}
      </div>
    </div>
  );
}
