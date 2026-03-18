```tsx
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

function assetTypeLabel(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "crane") return "Crane";
  if (v === "vehicle") return "Vehicle";
  if (v === "other") return "Other";
  return "Lifting Equipment";
}

function selectedAssetValue(item: {
  asset_type?: string | null;
  crane_id?: string | null;
  vehicle_id?: string | null;
  equipment_id?: string | null;
}) {
  const type = String(item.asset_type ?? "equipment").toLowerCase();
  if (type === "crane") return item.crane_id ?? "";
  if (type === "vehicle") return item.vehicle_id ?? "";
  if (type === "other") return "";
  return item.equipment_id ?? "";
}

function selectedAssetName(item: Allocation) {
  if (item.asset_type === "crane") {
    return item.cranes?.name ?? item.item_name ?? "Crane";
  }
  if (item.asset_type === "vehicle") {
    return item.vehicles?.name ?? item.item_name ?? "Vehicle";
  }
  if (item.asset_type === "other") {
    return item.item_name ?? "Other";
  }
  return item.equipment?.name ?? item.item_name ?? "Equipment";
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
    supplier_cost: "0.00",
    supplier_reference: "",
    notes: "",
  });

  const totals = useMemo(() => {
    const total = allocations.reduce(
      (sum, item) => sum + Number(item.supplier_cost ?? item.agreed_cost ?? 0),
      0
    );
    const cranes = allocations.filter((a) => a.asset_type === "crane").length;
    const vehicles = allocations.filter((a) => a.asset_type === "vehicle").length;
    const equipment = allocations.filter((a) => a.asset_type === "equipment").length;
    const other = allocations.filter((a) => a.asset_type === "other").length;
    return { total, cranes, vehicles, equipment, other };
  }, [allocations]);

  function getOptionsForAssetType(assetType: string) {
    if (assetType === "crane") return craneOptions;
    if (assetType === "vehicle") return vehicleOptions;
    if (assetType === "other") return [];
    return equipmentOptions;
  }

  function normaliseAssetPatch(assetType: string, selectedId: string) {
    return {
      asset_type: assetType,
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

      const res = await fetch("/api/job-equipment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
          ...draft,
          agreed_cost: supplierCost,
          supplier_cost: supplierCost,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage(json?.error || "Could not add allocation.");
        return;
      }

      setAllocations((prev) => [...prev, json.allocation]);
      setCostDrafts((prev) => ({
        ...prev,
        [json.allocation.id]: toCostString(
          json.allocation.supplier_cost ?? json.allocation.agreed_cost
        ),
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

      setAllocations((prev) =>
        prev.map((item) => (item.id === id ? json.allocation : item))
      );

      setCostDrafts((prev) => ({
        ...prev,
        [id]: toCostString(json.allocation.supplier_cost ?? json.allocation.agreed_cost),
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
      ...item,
      agreed_cost: parsed,
      supplier_cost: parsed,
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
          <div style={totalsStrong}>Allocated cost: {money(totals.total)}</div>
        </div>
      </div>

      {message ? <div style={messageBox}>{message}</div> : null}

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {allocations.length === 0 ? (
          <div style={emptyStyle}>No equipment allocations added yet.</div>
        ) : (
          allocations.map((item) => {
            const assetType = String(item.asset_type ?? "equipment");
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
                        ...item,
                        ...normaliseAssetPatch(value || "equipment", ""),
                        supplier_id: null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  {assetType !== "other" ? (
                    <SelectField
                      label={assetTypeLabel(item.asset_type)}
                      value={selectedAssetValue(item)}
                      options={assetOptions}
                      onChange={(value) =>
                        updateAllocation(item.id, {
                          ...item,
                          ...normaliseAssetPatch(assetType, value),
                        })
                      }
                      disabled={savingId === item.id}
                    />
                  ) : (
                    <TextField
                      label="Other item"
                      value={item.item_name ?? ""}
                      onChange={(value) =>
                        updateAllocation(item.id, {
                          ...item,
                          item_name: value || null,
                        })
                      }
                      disabled={savingId === item.id}
                    />
                  )}

                  <SelectField
                    label="Operator"
                    value={item.operator_id ?? ""}
                    options={operatorOptions}
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        ...item,
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
                        ...item,
                        source_type: value || "owned",
                        supplier_id: value === "cross_hire" ? item.supplier_id : null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  {assetType !== "other" ? (
                    <TextField
                      label="Item name"
                      value={item.item_name ?? ""}
                      onChange={(value) =>
                        updateAllocation(item.id, {
                          ...item,
                          item_name: value || null,
                        })
                      }
                      disabled={savingId === item.id}
                    />
                  ) : null}

                  <TextField
                    label="Start date"
                    value={item.start_date ?? ""}
                    type="date"
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        ...item,
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
                        ...item,
                        end_date: value || null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  <TextField
                    label="Start time"
                    value={item.start_time ?? ""}
                    type="time"
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        ...item,
                        start_time: value || null,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  <TextField
                    label="End time"
                    value={item.end_time ?? ""}
                    type="time"
                    onChange={(value) =>
                      updateAllocation(item.id, {
                        ...item,
                        end_time: value || null,
                      })
                    }
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
                        ...item,
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
                            ...item,
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
                            ...item,
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
                          ...item,
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
                    {assetTypeLabel(item.asset_type)} • {selectedAssetName(item)} •{" "}
                    {item.operators?.full_name ?? "No operator"} •{" "}
                    {item.suppliers?.company_name ?? "No supplier"} • Cost{" "}
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
                ...normaliseAssetPatch(value || "crane", ""),
                supplier_id: "",
                asset_type: value || "crane",
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
                  ...normaliseAssetPatch(prev.asset_type, value),
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

          <TextField
            label="Start time"
            value={draft.start_time}
            type="time"
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, start_time: value }))
            }
          />

          <TextField
            label="End time"
            value={draft.end_time}
            type="time"
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, end_time: value }))
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
  color: "#8b0000",
  fontWeight: 900,
  border: "1px solid rgba(255,0,0,0.20)",
  cursor: "pointer",
};

const emptyStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const messageBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.20)",
  color: "#0b57d0",
  fontWeight: 800,
};
```
