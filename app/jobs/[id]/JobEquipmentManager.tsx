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
  agreed_sell_rate?: number | null;
  supplier_cost?: number | null;
  supplier_reference?: string | null;
  notes?: string | null;
  cranes?: {
    id?: string;
    name?: string | null;
    reg_number?: string | null;
    capacity?: string | null;
  } | null;
  vehicles?: {
    id?: string;
    name?: string | null;
    reg_number?: string | null;
  } | null;
  equipment?: {
    id?: string;
    name?: string | null;
    asset_number?: string | null;
  } | null;
  operators?: {
    id?: string;
    full_name?: string | null;
  } | null;
  suppliers?: {
    id?: string;
    company_name?: string | null;
    category?: string | null;
  } | null;
  purchase_orders?: {
    id?: string;
    po_number?: string | null;
    status?: string | null;
  } | null;
};

function currentAssetType(item: {
  crane_id?: string | null;
  vehicle_id?: string | null;
  equipment_id?: string | null;
}) {
  if (item.crane_id) return "crane";
  if (item.vehicle_id) return "vehicle";
  if (item.equipment_id) return "equipment";
  return "other";
}

function assetTypeLabel(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "crane") return "Crane";
  if (v === "vehicle") return "Vehicle";
  if (v === "other") return "Other";
  return "Lifting Equipment";
}

function selectedAssetValue(item: {
  crane_id?: string | null;
  vehicle_id?: string | null;
  equipment_id?: string | null;
}) {
  const type = currentAssetType(item);
  if (type === "crane") return item.crane_id ?? "";
  if (type === "vehicle") return item.vehicle_id ?? "";
  if (type === "equipment") return item.equipment_id ?? "";
  return "";
}

function selectedAssetName(item: Allocation) {
  const type = currentAssetType(item);

  if (type === "crane") {
    return item.cranes?.name ?? item.item_name ?? "Crane";
  }
  if (type === "vehicle") {
    return item.vehicles?.name ?? item.item_name ?? "Vehicle";
  }
  if (type === "equipment") {
    return item.equipment?.name ?? item.item_name ?? "Equipment";
  }
  return item.item_name ?? "Other";
}

function money(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return `£${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

function toCostString(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function parseCost(value: string) {
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normaliseCategory(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function getAllowedSupplierCategories(assetType: string) {
  const type = String(assetType ?? "").trim().toLowerCase();

  if (type === "crane") {
    return ["CRANES", "CRANE REPAIR", "CRANE REPAIRS"];
  }

  if (type === "vehicle") {
    return ["TRANSPORT", "VEHICLES", "ESCORT", "ESCORTS", "TYRES", "VEHICLE REPAIRS"];
  }

  if (type === "equipment") {
    return ["RIGGING GEAR", "LOLER", "PLANT"];
  }

  return [];
}

function filterSuppliersByAssetType(assetType: string, options: Option[]) {
  const type = String(assetType ?? "").toLowerCase();

  if (type === "other") {
    return options;
  }

  const allowed = getAllowedSupplierCategories(type);

  const filtered = options.filter((option) =>
    allowed.includes(normaliseCategory(option.category))
  );

  return filtered.length > 0 ? filtered : options;
}

function getReturnedAllocation(json: any): Allocation | null {
  return json?.item ?? json?.allocation ?? null;
}

function buildTimeOptions() {
  const options: Option[] = [];
  const mins = ["00", "15", "30", "45"];

  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    for (const mm of mins) {
      const value = `${hh}:${mm}`;
      options.push({ value, label: value });
    }
  }

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
  defaultDate,
  defaultStartTime,
  defaultEndTime,
}: {
  jobId: string;
  initialAllocations: Allocation[];
  craneOptions: Option[];
  vehicleOptions: Option[];
  equipmentOptions: Option[];
  operatorOptions: Option[];
  supplierOptions: Option[];
  purchaseOrderOptions: Option[];
  defaultDate?: string | null;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
}) {
  const router = useRouter();
  const timeOptions = useMemo(() => buildTimeOptions(), []);

  const [allocations, setAllocations] = useState<Allocation[]>(initialAllocations ?? []);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [costDrafts, setCostDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      (initialAllocations ?? []).map((item) => [
        item.id,
        toCostString(item.supplier_cost ?? item.agreed_cost),
      ])
    )
  );

  const [sellDrafts, setSellDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      (initialAllocations ?? []).map((item) => [
        item.id,
        toCostString(item.agreed_sell_rate ?? item.agreed_cost),
      ])
    )
  );

  const [itemNameDrafts, setItemNameDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      (initialAllocations ?? []).map((item) => [
        item.id,
        String(item.item_name ?? ""),
      ])
    )
  );

  const [draft, setDraft] = useState({
    asset_type: "crane",
    crane_id: "",
    vehicle_id: "",
    equipment_id: "",
    operator_id: "",
    source_type: "owned",
    supplier_id: "",
    purchase_order_id: "",
    item_name: "",
    start_date: defaultDate ?? "",
    end_date: defaultDate ?? "",
    start_time: defaultStartTime ?? "",
    end_time: defaultEndTime ?? "",
    agreed_cost: "0.00",
    agreed_sell_rate: "0.00",
    supplier_cost: "0.00",
    supplier_reference: "",
    notes: "",
  });

  const totals = useMemo(() => {
    const totalCost = allocations.reduce(
      (sum, item) => sum + Number(item.supplier_cost ?? item.agreed_cost ?? 0),
      0
    );
    const totalSell = allocations.reduce(
      (sum, item) => sum + Number(item.agreed_sell_rate ?? item.agreed_cost ?? 0),
      0
    );
    const cranes = allocations.filter((a) => currentAssetType(a) === "crane").length;
    const vehicles = allocations.filter((a) => currentAssetType(a) === "vehicle").length;
    const equipment = allocations.filter((a) => currentAssetType(a) === "equipment").length;
    const other = allocations.filter((a) => currentAssetType(a) === "other").length;
    return { totalCost, totalSell, cranes, vehicles, equipment, other };
  }, [allocations]);

  function getOptionsForAssetType(assetType: string) {
    if (assetType === "crane") return craneOptions;
    if (assetType === "vehicle") return vehicleOptions;
    if (assetType === "equipment") return equipmentOptions;
    return [];
  }

  function clearAssetIdsForType() {
    return {
      crane_id: "",
      vehicle_id: "",
      equipment_id: "",
    };
  }

  function apiAssetPatch(assetType: string, selectedId: string) {
    return {
      crane_id: assetType === "crane" ? selectedId || null : null,
      vehicle_id: assetType === "vehicle" ? selectedId || null : null,
      equipment_id: assetType === "equipment" ? selectedId || null : null,
    };
  }

  async function addAllocation() {
    setAdding(true);
    setMessage("");

    try {
      const supplierCost = parseCost(draft.supplier_cost || draft.agreed_cost);
      const agreedSellRate = parseCost(draft.agreed_sell_rate);

      const res = await fetch("/api/job-equipment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
          crane_id: draft.asset_type === "crane" ? draft.crane_id || null : null,
          vehicle_id: draft.asset_type === "vehicle" ? draft.vehicle_id || null : null,
          equipment_id: draft.asset_type === "equipment" ? draft.equipment_id || null : null,
          operator_id: draft.operator_id || null,
          source_type: draft.source_type,
          supplier_id: draft.source_type === "cross_hire" ? draft.supplier_id || null : null,
          purchase_order_id:
            draft.source_type === "cross_hire" ? draft.purchase_order_id || null : null,
          item_name: draft.item_name || null,
          start_date: draft.start_date || null,
          end_date: draft.end_date || null,
          start_time: draft.start_time || null,
          end_time: draft.end_time || null,
          agreed_cost: supplierCost,
          agreed_sell_rate: agreedSellRate,
          supplier_cost: supplierCost,
          supplier_reference: draft.supplier_reference || null,
          notes: draft.notes || null,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage(json?.error || "Could not add allocation.");
        return;
      }

      const allocation = getReturnedAllocation(json);

      if (!allocation) {
        setMessage("Allocation added but response was incomplete.");
        router.refresh();
        return;
      }

      setAllocations((prev) => [...prev, allocation]);
      setCostDrafts((prev) => ({
        ...prev,
        [allocation.id]: toCostString(allocation.supplier_cost ?? allocation.agreed_cost),
      }));
      setSellDrafts((prev) => ({
        ...prev,
        [allocation.id]: toCostString(allocation.agreed_sell_rate ?? allocation.agreed_cost),
      }));
      setItemNameDrafts((prev) => ({
        ...prev,
        [allocation.id]: String(allocation.item_name ?? ""),
      }));

      setDraft({
        asset_type: "crane",
        crane_id: "",
        vehicle_id: "",
        equipment_id: "",
        operator_id: "",
        source_type: "owned",
        supplier_id: "",
        purchase_order_id: "",
        item_name: "",
        start_date: defaultDate ?? "",
        end_date: defaultDate ?? "",
        start_time: defaultStartTime ?? "",
        end_time: defaultEndTime ?? "",
        agreed_cost: "0.00",
        agreed_sell_rate: "0.00",
        supplier_cost: "0.00",
        supplier_reference: "",
        notes: "",
      });

      setMessage("Allocation added.");
      router.refresh();
    } catch {
      setMessage("Could not add allocation.");
    } finally {
      setAdding(false);
    }
  }

  async function updateAllocation(id: string, patch: Record<string, any>) {
    setSavingId(id);
    setMessage("");

    try {
      const res = await fetch(`/api/job-equipment/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage(json?.error || "Could not update allocation.");
        return;
      }

      const allocation = getReturnedAllocation(json);

      if (!allocation) {
        setMessage("Allocation updated but response was incomplete.");
        router.refresh();
        return;
      }

      setAllocations((prev) =>
        prev.map((item) => (item.id === id ? allocation : item))
      );

      setCostDrafts((prev) => ({
        ...prev,
        [id]: toCostString(allocation.supplier_cost ?? allocation.agreed_cost),
      }));
      setSellDrafts((prev) => ({
        ...prev,
        [id]: toCostString(allocation.agreed_sell_rate ?? allocation.agreed_cost),
      }));
      setItemNameDrafts((prev) => ({
        ...prev,
        [id]: String(allocation.item_name ?? ""),
      }));

      router.refresh();
    } catch {
      setMessage("Could not update allocation.");
    } finally {
      setSavingId(null);
    }
  }

  async function commitCost(id: string, item: Allocation) {
    const raw = costDrafts[id] ?? toCostString(item.supplier_cost ?? item.agreed_cost);
    const parsed = parseCost(raw);

    await updateAllocation(id, {
      agreed_cost: parsed,
      supplier_cost: parsed,
    });
  }

  async function commitSellRate(id: string) {
    const raw = sellDrafts[id] ?? "0.00";
    const parsed = parseCost(raw);

    await updateAllocation(id, {
      agreed_sell_rate: parsed,
    });
  }

  async function commitItemName(id: string, item: Allocation) {
    const raw = String(itemNameDrafts[id] ?? item.item_name ?? "").trim();
    await updateAllocation(id, {
      item_name: raw.length > 0 ? raw : null,
    });
  }

  async function deleteAllocation(id: string) {
    const ok = window.confirm("Delete this allocation?");
    if (!ok) return;

    setSavingId(id);
    setMessage("");

    try {
      const res = await fetch(`/api/job-equipment/${id}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage(json?.error || "Could not delete allocation.");
        return;
      }

      setAllocations((prev) => prev.filter((item) => item.id !== id));
      setCostDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setSellDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setItemNameDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      router.refresh();
    } catch {
      setMessage("Could not delete allocation.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div style={wrapStyle}>
      <div style={topRow}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 22 }}>
            Equipment Allocations
          </h2>
          <div style={{ opacity: 0.72 }}>
            Add multiple cranes, vehicles, lifting equipment or other hired items to one job.
          </div>
        </div>

        <div style={totalsBox}>
          <div style={totalsText}>Cranes: {totals.cranes}</div>
          <div style={totalsText}>Vehicles: {totals.vehicles}</div>
          <div style={totalsText}>Equipment: {totals.equipment}</div>
          <div style={totalsText}>Other: {totals.other}</div>
          <div style={totalsStrong}>Sell total: {money(totals.totalSell)}</div>
          <div style={totalsStrong}>Cost total: {money(totals.totalCost)}</div>
        </div>
      </div>

      {message ? <div style={messageBox}>{message}</div> : null}

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {allocations.length === 0 ? (
          <div style={emptyStyle}>No equipment allocations added yet.</div>
        ) : (
          allocations.map((item) => {
            const assetType = currentAssetType(item);
            const assetOptions = getOptionsForAssetType(assetType);
            const filteredSupplierOptions = filterSuppliersByAssetType(
              assetType,
              supplierOptions
            );

            return (
              <div key={item.id} style={allocationCard}>
                <div style={gridStyle}>
                  <SelectField
                    label="Asset type"
                    value={assetType}
                    options={[
                      { value: "crane", label: "Crane" },
                      { value: "vehicle", label: "Vehicle" },
                      { value: "equipment", label: "Lifting Equipment" },
                      { value: "other", label: "Other" },
                    ]}
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        ...(value === "other"
                          ? {
                              crane_id: null,
                              vehicle_id: null,
                              equipment_id: null,
                              item_name: item.item_name || "Hired Item",
                            }
                          : apiAssetPatch(value || "equipment", "")),
                        supplier_id: null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  {assetType !== "other" ? (
                    <SelectField
                      label={assetTypeLabel(assetType)}
                      value={selectedAssetValue(item)}
                      options={assetOptions}
                      onChange={(value) =>
                        updateAllocation(item.id, apiAssetPatch(assetType, value))
                      }
                      disabled={savingId === item.id}
                    />
                  ) : (
                    <TextField
                      label="Other item"
                      value={itemNameDrafts[item.id] ?? String(item.item_name ?? "")}
                      onChange={(value) =>
                        setItemNameDrafts((prev) => ({
                          ...prev,
                          [item.id]: value,
                        }))
                      }
                      onBlur={() => commitItemName(item.id, item)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          await commitItemName(item.id, item);
                        }
                      }}
                      disabled={savingId === item.id}
                    />
                  )}

                  <SelectField
                    label="Operator"
                    value={item.operator_id ?? ""}
                    options={operatorOptions}
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        operator_id: value || null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  <SelectField
                    label="Source"
                    value={item.source_type ?? "owned"}
                    options={[
                      { value: "owned", label: "Owned" },
                      { value: "cross_hire", label: "Cross Hire" },
                    ]}
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        source_type: value || "owned",
                        supplier_id: value === "cross_hire" ? item.supplier_id : null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  {assetType !== "other" ? (
                    <TextField
                      label="Item name"
                      value={itemNameDrafts[item.id] ?? String(item.item_name ?? "")}
                      onChange={(value) =>
                        setItemNameDrafts((prev) => ({
                          ...prev,
                          [item.id]: value,
                        }))
                      }
                      onBlur={() => commitItemName(item.id, item)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          await commitItemName(item.id, item);
                        }
                      }}
                      disabled={savingId === item.id}
                    />
                  ) : null}

                  <TextField
                    label="Start date"
                    value={item.start_date ?? ""}
                    type="date"
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        start_date: value || null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  <TextField
                    label="End date"
                    value={item.end_date ?? ""}
                    type="date"
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        end_date: value || null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  <SelectField
                    label="Start time"
                    value={item.start_time ?? ""}
                    options={timeOptions}
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        start_time: value || null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  <SelectField
                    label="End time"
                    value={item.end_time ?? ""}
                    options={timeOptions}
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        end_time: value || null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  <TextField
                    label="Charge rate"
                    value={
                      sellDrafts[item.id] ??
                      toCostString(item.agreed_sell_rate ?? item.agreed_cost)
                    }
                    type="text"
                    inputMode="decimal"
                    onChange={(value) =>
                      setSellDrafts((prev) => ({ ...prev, [item.id]: value }))
                    }
                    onBlur={() => commitSellRate(item.id)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        await commitSellRate(item.id);
                      }
                    }}
                    disabled={savingId === item.id}
                  />

                  <TextField
                    label="Supplier cost"
                    value={
                      costDrafts[item.id] ??
                      toCostString(item.supplier_cost ?? item.agreed_cost)
                    }
                    type="text"
                    inputMode="decimal"
                    onChange={(value) =>
                      setCostDrafts((prev) => ({ ...prev, [item.id]: value }))
                    }
                    onBlur={() => commitCost(item.id, item)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        await commitCost(item.id, item);
                      }
                    }}
                    disabled={savingId === item.id}
                  />

                  <TextField
                    label="Supplier reference"
                    value={item.supplier_reference ?? ""}
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        supplier_reference: value || null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  {(item.source_type ?? "owned") === "cross_hire" ? (
                    <>
                      <SelectField
                        label="Supplier"
                        value={item.supplier_id ?? ""}
                        options={filteredSupplierOptions}
                        onChange={(value) =>
                          updateAllocation(item.id, {
                            supplier_id: value || null,
                          })
                        }
                        disabled={savingId === item.id}
                      />

                      <SelectField
                        label="Purchase order"
                        value={item.purchase_order_id ?? ""}
                        options={purchaseOrderOptions}
                        onChange={(value) =>
                          updateAllocation(item.id, {
                            purchase_order_id: value || null,
                          })
                        }
                        disabled={savingId === item.id}
                      />
                    </>
                  ) : null}

                  <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                    <label style={labelStyle}>Notes</label>
                    <textarea
                      value={item.notes ?? ""}
                      onChange={(e) =>
                        updateAllocation(item.id, {
                          notes: e.target.value || null,
                        })
                      }
                      rows={3}
                      style={textareaStyle}
                      disabled={savingId === item.id}
                    />
                  </div>
                </div>

                <div style={footerRow}>
                  <div style={{ fontSize: 13, opacity: 0.72 }}>
                    {assetTypeLabel(assetType)} • {selectedAssetName(item)} •{" "}
                    {item.operators?.full_name ?? "No operator"} •{" "}
                    {item.suppliers?.company_name ?? "No supplier"} • Sell{" "}
                    {money(item.agreed_sell_rate ?? item.agreed_cost)} • Cost{" "}
                    {money(item.supplier_cost ?? item.agreed_cost)}
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteAllocation(item.id)}
                    style={deleteBtn}
                    disabled={savingId === item.id}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ ...allocationCard, marginTop: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>Add allocation</h3>

        <div style={gridStyle}>
          <SelectField
            label="Asset type"
            value={draft.asset_type}
            options={[
              { value: "crane", label: "Crane" },
              { value: "vehicle", label: "Vehicle" },
              { value: "equipment", label: "Lifting Equipment" },
              { value: "other", label: "Other" },
            ]}
            onChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                asset_type: value || "crane",
                ...clearAssetIdsForType(),
                supplier_id: "",
                item_name: value === "other" ? prev.item_name || "Hired Item" : prev.item_name,
              }))
            }
          />

          {draft.asset_type !== "other" ? (
            <SelectField
              label={assetTypeLabel(draft.asset_type)}
              value={selectedAssetValue(draft)}
              options={getOptionsForAssetType(draft.asset_type)}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  ...apiAssetPatch(prev.asset_type, value),
                }))
              }
            />
          ) : (
            <TextField
              label="Other item"
              value={draft.item_name}
              onChange={(value) =>
                setDraft((prev) => ({ ...prev, item_name: value }))
              }
            />
          )}

          <SelectField
            label="Operator"
            value={draft.operator_id}
            options={operatorOptions}
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, operator_id: value }))
            }
          />

          <SelectField
            label="Source"
            value={draft.source_type}
            options={[
              { value: "owned", label: "Owned" },
              { value: "cross_hire", label: "Cross Hire" },
            ]}
            onChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                source_type: value || "owned",
                supplier_id: value === "cross_hire" ? prev.supplier_id : "",
              }))
            }
          />

          {draft.asset_type !== "other" ? (
            <TextField
              label="Item name"
              value={draft.item_name}
              onChange={(value) =>
                setDraft((prev) => ({ ...prev, item_name: value }))
              }
            />
          ) : null}

          <TextField
            label="Start date"
            value={draft.start_date}
            type="date"
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, start_date: value }))
            }
          />

          <TextField
            label="End date"
            value={draft.end_date}
            type="date"
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, end_date: value }))
            }
          />

          <SelectField
            label="Start time"
            value={draft.start_time}
            options={timeOptions}
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, start_time: value }))
            }
          />

          <SelectField
            label="End time"
            value={draft.end_time}
            options={timeOptions}
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, end_time: value }))
            }
          />

          <TextField
            label="Charge rate"
            value={draft.agreed_sell_rate}
            type="text"
            inputMode="decimal"
            onChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                agreed_sell_rate: value,
              }))
            }
          />

          <TextField
            label="Supplier cost"
            value={draft.supplier_cost}
            type="text"
            inputMode="decimal"
            onChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                supplier_cost: value,
                agreed_cost: value,
              }))
            }
          />

          <TextField
            label="Supplier reference"
            value={draft.supplier_reference}
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, supplier_reference: value }))
            }
          />

          {draft.source_type === "cross_hire" ? (
            <>
              <SelectField
                label="Supplier"
                value={draft.supplier_id}
                options={filterSuppliersByAssetType(draft.asset_type, supplierOptions)}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, supplier_id: value }))
                }
              />

              <SelectField
                label="Purchase order"
                value={draft.purchase_order_id}
                options={purchaseOrderOptions}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, purchase_order_id: value }))
                }
              />
            </>
          ) : null}

          <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              rows={3}
              value={draft.notes}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, notes: e.target.value }))
              }
              style={textareaStyle}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={addAllocation}
            style={saveBtn}
            disabled={adding}
          >
            {adding ? "Adding..." : "Add allocation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
        disabled={disabled}
      >
        <option value="">— Select —</option>
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  disabled,
  onBlur,
  onKeyDown,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  disabled?: boolean;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void | Promise<void>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        type={type}
        inputMode={inputMode}
        style={inputStyle}
        disabled={disabled}
      />
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  marginTop: 18,
  padding: 18,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const topRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const totalsBox: React.CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "center",
  flexWrap: "wrap",
};

const totalsText: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  opacity: 0.78,
};

const totalsStrong: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
};

const allocationCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const footerRow: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
  resize: "vertical",
};

const saveBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const deleteBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  color: "#b00020",
  fontWeight: 900,
  border: "1px solid rgba(255,0,0,0.16)",
  cursor: "pointer",
};

const messageBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontWeight: 700,
};

const emptyStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 10,
  background: "rgba(255,255,255,0.4)",
  border: "1px solid rgba(0,0,0,0.06)",
  opacity: 0.75,
};
