"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

export default function JobAllocations({ jobId }: { jobId: string }) {
  const supabase = createClient();

  const [assetType, setAssetType] = useState("crane");
  const [cranes, setCranes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);

  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [
      { data: cranes },
      { data: vehicles },
      { data: equipment },
      { data: operators },
    ] = await Promise.all([
      supabase.from("cranes").select("*").eq("status", "available"),
      supabase.from("vehicles").select("*"),
      supabase.from("equipment").select("*"),
      supabase.from("operators").select("*"),
    ]);

    setCranes(cranes || []);
    setVehicles(vehicles || []);
    setEquipment(equipment || []);
    setOperators(operators || []);
  }

  async function addAllocation(e: any) {
    e.preventDefault();

    const payload: any = {
      job_id: jobId,
      asset_type: assetType,
    };

    if (assetType === "crane") payload.crane_id = selectedId;
    if (assetType === "vehicle") payload.vehicle_id = selectedId;
    if (assetType === "equipment") payload.equipment_id = selectedId;

    const { error } = await supabase.from("job_allocations").insert(payload);

    if (error) {
      alert(error.message);
    } else {
      alert("Added");
      setSelectedId("");
    }
  }

  function getOptions() {
    if (assetType === "crane") return cranes;
    if (assetType === "vehicle") return vehicles;
    return equipment;
  }

  return (
    <div style={card}>
      <h3>Equipment Allocations</h3>

      <form onSubmit={addAllocation} style={{ display: "grid", gap: 10 }}>
        <select
          value={assetType}
          onChange={(e) => setAssetType(e.target.value)}
        >
          <option value="crane">Crane</option>
          <option value="vehicle">Vehicle</option>
          <option value="equipment">Lifting Equipment</option>
        </select>

        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">Select</option>
          {getOptions().map((x) => (
            <option key={x.id} value={x.id}>
              {x.name || x.asset_number || x.reg_number}
            </option>
          ))}
        </select>

        <button type="submit" style={btn}>
          Add allocation
        </button>
      </form>
    </div>
  );
}

const card = {
  background: "#fff",
  padding: 16,
  borderRadius: 10,
};

const btn = {
  background: "#111",
  color: "#fff",
  padding: 10,
  borderRadius: 8,
};
