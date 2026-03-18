"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Option = {
  value: string;
  label: string;
  category?: string | null;
};

type Allocation = {
  id: string;
  asset_type?: string | null;
  crane_id?: string | null;
  vehicle_id?: string | null;
  equipment_id?: string | null;
  operator_id?: string | null;
  source_type?: string | null;
  supplier_id?: string | null;
  purchase_order_id?: string | null;
  item_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  agreed_cost?: number | null;
  supplier_cost?: number | null;
  supplier_reference?: string | null;
  notes?: string | null;
};

function filterSuppliersByAssetType(assetType: string, options: Option[]) {
  if (assetType === "other") return options;
  return options;
}

export default function JobEquipmentManager({
  jobId,
  initialAllocations,
  craneOptions,
  vehicleOptions,
  equipmentOptions,
  operatorOptions,
  supplierOptions,
  purchaseOrderOptions,
}: any) {
  const router = useRouter();

  const [allocations, setAllocations] = useState(initialAllocations || []);

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
      {allocations.map((item: Allocation) => {
        const assetType = item.asset_type || "equipment";

        return (
          <div key={item.id}>

            {/* ✅ FIXED OTHER HANDLING */}
            <select
              value={assetType}
              onChange={(e) => {
                const value = e.target.value;

                if (value === "other") {
                  updateAllocation(item.id, {
                    ...item,
                    asset_type: "other",
                    crane_id: null,
                    vehicle_id: null,
                    equipment_id: null,
                    item_name:
                      item.item_name && item.item_name.trim().length > 0
                        ? item.item_name
                        : "Hired Item",
                    supplier_id: null,
                  });
                } else {
                  updateAllocation(item.id, {
                    ...item,
                    asset_type: value,
                    supplier_id: null,
                  });
                }
              }}
            >
              <option value="crane">Crane</option>
              <option value="vehicle">Vehicle</option>
              <option value="equipment">Lifting Equipment</option>
              <option value="other">Other</option>
            </select>

            {/* Supplier (ALL SHOW WHEN OTHER) */}
            <select
              value={item.supplier_id || ""}
              onChange={(e) =>
                updateAllocation(item.id, {
                  ...item,
                  supplier_id: e.target.value || null,
                })
              }
            >
              <option value="">— Select —</option>
              {filterSuppliersByAssetType(assetType, supplierOptions).map(
                (s: Option) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                )
              )}
            </select>

          </div>
        );
      })}
    </div>
  );
}
