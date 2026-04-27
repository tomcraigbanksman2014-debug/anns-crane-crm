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

type DraftState = {
  asset_type: string;
  crane_id: string;
  vehicle_id: string;
  equipment_id: string;
  operator_id: string;
  source_type: string;
  supplier_id: string;
  purchase_order_id: string;
  item_name: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  agreed_cost: string;
  agreed_sell_rate: string;
  supplier_cost: string;
  supplier_reference: string;
  notes: string;
};

function currentAssetType(item: {
  asset_type?: string | null;
  crane_id?: string | null;
  vehicle_id?: string | null;
  equipment_id?: string | null;
}) {
  if (item.asset_type) return String(item.asset_type).toLowerCase();
  if (item.crane_id) return "crane";
  if (item.vehicle_id) return "vehicle";
  if (item.equipment_id) return "equipment";
  return "other";
}

function assetTypeLabel(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "crane") return "Crane";
  if (v === "vehicle") return "Vehicle";
  if (v === "other") return "Labour / Other";
  return "Lifting Equipment";
}

function selectedAssetValue(item: {
  crane_id?: string | null;
  vehicle_id?: string | null;
  equipment_id?: string | null;
}) {
  if (item.crane_id) return item.crane_id ?? "";
  if (item.vehicle_id) return item.vehicle_id ?? "";
  if (item.equipment_id) return item.equipment_id ?? "";
  return "";
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

  if (type === "crane") return ["CRANES", "CRANE REPAIR", "CRANE REPAIRS"];
  if (type === "vehicle") return ["TRANSPORT", "VEHICLES", "ESCORT", "ESCORTS", "TYRES", "VEHICLE REPAIRS"];
  if (type === "equipment") return ["RIGGING GEAR", "LOLER", "PLANT"];
  return [];
}

function filterSuppliersByAssetType(assetType: string, options: Option[]) {
  const type = String(assetType ?? "").toLowerCase();

  if (type === "other") return options;

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

function buildEmptyDraft(
  defaultDate?: string | null,
  defaultStartTime?: string | null,
  defaultEndTime?: string | null
): DraftState {
  return {
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
  };
}

function buildDraftFromAllocation(item: Allocation): DraftState {
  return {
    asset_type: currentAssetType(item),
    crane_id: item.crane_id ?? "",
    vehicle_id: item.vehicle_id ?? "",
    equipment_id: item.equipment_id ?? "",
    operator_id: item.operator_id ?? "",
    source_type: item.source_type ?? "owned",
    supplier_id: item.supplier_id ?? "",
    purchase_order_id: item.purchase_order_id ?? "",
    item_name: String(item.item_name ?? ""),
    start_date: item.start_date ?? "",
    end_date: item.end_date ?? "",
    start_time: item.start_time ?? "",
    end_time: item.end_time ?? "",
    agreed_cost: toCostString(item.agreed_cost),
    agreed_sell_rate: toCostString(item.agreed_sell_rate ?? item.agreed_cost),
    supplier_cost: toCostString(item.supplier_cost ?? item.agreed_cost),
    supplier_reference: String(item.supplier_reference ?? ""),
    notes: String(item.notes ?? ""),
  };
}

function allocationDisplayName(item: Allocation) {
  const assetType = currentAssetType(item);

  if (assetType === "crane") return item.cranes?.name || item.item_name || "Crane";
  if (assetType === "vehicle") return item.vehicles?.name || item.item_name || "Vehicle";
  if (assetType === "equipment") return item.equipment?.name || item.item_name || "Equipment";
  return item.item_name || "Labour / Other";
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

  const [draft, setDraft] = useState<DraftState>(
    buildEmptyDraft(defaultDate, defaultStartTime, defaultEndTime)
  );

  const [rowDrafts, setRowDrafts] = useState<Record<string, DraftState>>(
    Object.fromEntries(
      (initialAllocations ?? []).map((item) => [item.id, buildDraftFromAllocation(item)])
    )
  );

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

  function clearAssetIds() {
    return {
      crane_id: "",
      vehicle_id: "",
      equipment_id: "",
    };
  }

  function apiAssetPatch(assetType: string, selectedId: string) {
    return {
      asset_type: assetType,
      crane_id: assetType === "crane" ? selectedId || null : null,
      vehicle_id: assetType === "vehicle" ? selectedId || null : null,
      equipment_id: assetType === "equipment" ? selectedId || null : null,
    };
  }

  function updateRowDraft(id: string, patch: Partial<DraftState>) {
    setRowDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...patch,
      },
    }));
  }

  function useAllocationAsTemplate(item: Allocation) {
    setDraft(buildDraftFromAllocation(item));
    setMessage(
      "Allocation copied into the add section. Change the operator/subcontractor and dates, then click Add allocation."
    );
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  function setLabourPreset(label: string) {
    setDraft((prev) => ({
      ...prev,
      asset_type: "other",
      ...clearAssetIds(),
      item_name: label,
    }));
  }

  function startSubcontractorAllocation() {
    setDraft((prev) => ({
      ...prev,
      asset_type: "other",
      ...clearAssetIds(),
      source_type: "owned",
      supplier_id: "",
      purchase_order_id: "",
      item_name: prev.item_name || "Subcontractor Operator",
      notes:
        prev.notes ||
        "Subcontractor labour. Add the agreed job-specific cost in the Subcontractor / supplier cost field.",
    }));
    setMessage(
      "Subcontractor row ready. Select the subcontractor in Operator / subcontractor, add the dates, then enter what we are paying them in Subcontractor / supplier cost."
    );
    window.setTimeout(() => {
      document.getElementById("add-allocation-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  async function addAllocation() {
    setAdding(true);
    setMessage("");

    try {
      const supplierCost = parseCost(draft.supplier_cost || draft.agreed_cost);
      const agreedSellRate = parseCost(draft.agreed_sell_rate);

      const res = await fetch("/api/job-equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          asset_type: draft.asset_type,
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
      setRowDrafts((prev) => ({
        ...prev,
        [allocation.id]: buildDraftFromAllocation(allocation),
      }));

      setDraft(buildEmptyDraft(defaultDate, defaultStartTime, defaultEndTime));
      setMessage("Allocation added.");
      router.refresh();
    } catch {
      setMessage("Could not add allocation.");
    } finally {
      setAdding(false);
    }
  }

  async function saveAllocation(id: string) {
    const row = rowDrafts[id];
    if (!row) return;

    setSavingId(id);
    setMessage("");

    try {
      const supplierCost = parseCost(row.supplier_cost || row.agreed_cost);
      const agreedSellRate = parseCost(row.agreed_sell_rate);

      const res = await fetch(`/api/job-equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_type: row.asset_type,
          crane_id: row.asset_type === "crane" ? row.crane_id || null : null,
          vehicle_id: row.asset_type === "vehicle" ? row.vehicle_id || null : null,
          equipment_id: row.asset_type === "equipment" ? row.equipment_id || null : null,
          operator_id: row.operator_id || null,
          source_type: row.source_type,
          supplier_id: row.source_type === "cross_hire" ? row.supplier_id || null : null,
          purchase_order_id:
            row.source_type === "cross_hire" ? row.purchase_order_id || null : null,
          item_name: row.item_name || null,
          start_date: row.start_date || null,
          end_date: row.end_date || null,
          start_time: row.start_time || null,
          end_time: row.end_time || null,
          agreed_cost: supplierCost,
          agreed_sell_rate: agreedSellRate,
          supplier_cost: supplierCost,
          supplier_reference: row.supplier_reference || null,
          notes: row.notes || null,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage(json?.error || "Could not save allocation.");
        return;
      }

      const allocation = getReturnedAllocation(json);

      if (!allocation) {
        setMessage("Allocation saved but response was incomplete.");
        router.refresh();
        return;
      }

      setAllocations((prev) => prev.map((item) => (item.id === id ? allocation : item)));
      setRowDrafts((prev) => ({
        ...prev,
        [id]: buildDraftFromAllocation(allocation),
      }));

      setMessage("Allocation saved.");
      router.refresh();
    } catch {
      setMessage("Could not save allocation.");
    } finally {
      setSavingId(null);
    }
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
      setRowDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      setMessage("Allocation deleted.");
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
            Allocations & Labour
          </h2>
          <div style={{ opacity: 0.72 }}>
            Add cranes, equipment, vehicles, labour-only rows, subcontractors, and split labour across different days.
          </div>
        </div>

        <div style={topActions}>
          <div style={totalsBox}>
            <div style={totalsText}>Cranes: {totals.cranes}</div>
            <div style={totalsText}>Vehicles: {totals.vehicles}</div>
            <div style={totalsText}>Equipment: {totals.equipment}</div>
            <div style={totalsText}>Labour / Other: {totals.other}</div>
            <div style={totalsStrong}>Sell total: {money(totals.totalSell)}</div>
            <div style={totalsStrong}>Cost total: {money(totals.totalCost)}</div>
          </div>

          <button type="button" onClick={startSubcontractorAllocation} style={subcontractorBtn}>
            Assign subcontractor
          </button>
        </div>
      </div>

      <div style={helpBox}>
        Use <strong>Assign subcontractor</strong> when an outside operator, slinger, AP, lift supervisor or labour-only person is covering part of the job.
        Enter <strong>Charge rate</strong> as what we are charging the customer and <strong>Subcontractor / supplier cost</strong> as what we are paying out on this job.
        For multi-day jobs with different labour each day, keep the crane allocation as one row and add separate labour rows for each operator/date range.
      </div>

      {message ? <div style={messageBox}>{message}</div> : null}

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {allocations.length === 0 ? (
          <div style={emptyStyle}>No allocations added yet.</div>
        ) : (
          allocations.map((item) => {
            const row = rowDrafts[item.id] ?? buildDraftFromAllocation(item);
            const assetType = row.asset_type;
            const assetOptions = getOptionsForAssetType(assetType);
            const filteredSupplierOptions = filterSuppliersByAssetType(assetType, supplierOptions);

            return (
              <div key={item.id} style={allocationCard}>
                <div style={gridStyle}>
                  <SelectField
                    label="Asset type"
                    value={row.asset_type}
                    options={[
                      { value: "crane", label: "Crane" },
                      { value: "vehicle", label: "Vehicle" },
                      { value: "equipment", label: "Lifting Equipment" },
                      { value: "other", label: "Labour / Other" },
                    ]}
                    onChange={(value) =>
                      updateRowDraft(item.id, {
                        asset_type: value || "crane",
                        ...clearAssetIds(),
                        supplier_id: "",
                        item_name: value === "other" ? row.item_name || "Labour" : row.item_name,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  {row.asset_type !== "other" ? (
                    <SelectField
                      label={assetTypeLabel(row.asset_type)}
                      value={selectedAssetValue(row)}
                      options={assetOptions}
                      onChange={(value) =>
                        updateRowDraft(item.id, {
                          ...apiAssetPatch(row.asset_type, value),
                        })
                      }
                      disabled={savingId === item.id}
                    />
                  ) : (
                    <TextField
                      label="Labour / other item"
                      value={row.item_name}
                      onChange={(value) => updateRowDraft(item.id, { item_name: value })}
                      disabled={savingId === item.id}
                    />
                  )}

                  <SelectField
                    label="Operator / subcontractor"
                    value={row.operator_id}
                    options={operatorOptions}
                    onChange={(value) => updateRowDraft(item.id, { operator_id: value })}
                    disabled={savingId === item.id}
                  />

                  <SelectField
                    label="Source"
                    value={row.source_type}
                    options={[
                      { value: "owned", label: "Owned / internal" },
                      { value: "cross_hire", label: "Cross-hire / supplier" },
                    ]}
                    onChange={(value) =>
                      updateRowDraft(item.id, {
                        source_type: value || "owned",
                        supplier_id: value === "cross_hire" ? row.supplier_id : "",
                        purchase_order_id: value === "cross_hire" ? row.purchase_order_id : "",
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  {row.asset_type !== "other" ? (
                    <TextField
                      label="Item name / role"
                      value={row.item_name}
                      onChange={(value) => updateRowDraft(item.id, { item_name: value })}
                      disabled={savingId === item.id}
                    />
                  ) : null}

                  <TextField
                    label="Start date"
                    value={row.start_date}
                    type="date"
                    onChange={(value) => updateRowDraft(item.id, { start_date: value })}
                    disabled={savingId === item.id}
                  />

                  <TextField
                    label="End date"
                    value={row.end_date}
                    type="date"
                    onChange={(value) => updateRowDraft(item.id, { end_date: value })}
                    disabled={savingId === item.id}
                  />

                  <SelectField
                    label="Start time"
                    value={row.start_time}
                    options={timeOptions}
                    onChange={(value) => updateRowDraft(item.id, { start_time: value })}
                    disabled={savingId === item.id}
                  />

                  <SelectField
                    label="End time"
                    value={row.end_time}
                    options={timeOptions}
                    onChange={(value) => updateRowDraft(item.id, { end_time: value })}
                    disabled={savingId === item.id}
                  />

                  <TextField
                    label="Charge rate"
                    value={row.agreed_sell_rate}
                    type="text"
                    inputMode="decimal"
                    onChange={(value) => updateRowDraft(item.id, { agreed_sell_rate: value })}
                    disabled={savingId === item.id}
                  />

                  <TextField
                    label="Subcontractor / supplier cost"
                    value={row.supplier_cost}
                    type="text"
                    inputMode="decimal"
                    onChange={(value) =>
                      updateRowDraft(item.id, {
                        supplier_cost: value,
                        agreed_cost: value,
                      })
                    }
                    disabled={savingId === item.id}
                  />

                  <TextField
                    label="Supplier / subcontractor reference"
                    value={row.supplier_reference}
                    onChange={(value) => updateRowDraft(item.id, { supplier_reference: value })}
                    disabled={savingId === item.id}
                  />

                  {row.source_type === "cross_hire" ? (
                    <>
                      <SelectField
                        label="Supplier company"
                        value={row.supplier_id}
                        options={filteredSupplierOptions}
                        onChange={(value) => updateRowDraft(item.id, { supplier_id: value })}
                        disabled={savingId === item.id}
                      />

                      <SelectField
                        label="Purchase order"
                        value={row.purchase_order_id}
                        options={purchaseOrderOptions}
                        onChange={(value) => updateRowDraft(item.id, { purchase_order_id: value })}
                        disabled={savingId === item.id}
                      />
                    </>
                  ) : null}

                  <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                    <label style={labelStyle}>Notes</label>
                    <textarea
                      value={row.notes}
                      onChange={(e) => updateRowDraft(item.id, { notes: e.target.value })}
                      rows={3}
                      style={textareaStyle}
                      disabled={savingId === item.id}
                    />
                  </div>
                </div>

                <div style={footerRow}>
                  <div style={{ fontSize: 13, opacity: 0.72 }}>
                    {assetTypeLabel(assetType)} • {allocationDisplayName(item)} •{" "}
                    {item.operators?.full_name ?? "No operator"} •{" "}
                    {item.suppliers?.company_name ?? (assetType === "other" ? "Labour/subcontractor row" : "No supplier")} • Sell{" "}
                    {money(item.agreed_sell_rate ?? item.agreed_cost)} • Cost{" "}
                    {money(item.supplier_cost ?? item.agreed_cost)}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => useAllocationAsTemplate(item)}
                      style={templateBtn}
                      disabled={savingId === item.id}
                    >
                      Use as template
                    </button>

                    <button
                      type="button"
                      onClick={() => saveAllocation(item.id)}
                      style={saveBtn}
                      disabled={savingId === item.id}
                    >
                      {savingId === item.id ? "Saving..." : "Save changes"}
                    </button>

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
              </div>
            );
          })
        )}
      </div>

      <div id="add-allocation-section" style={{ ...allocationCard, marginTop: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>Add allocation</h3>

        <div style={presetRow}>
          <span style={presetLabel}>Quick labour / subcontractor rows:</span>
          <button type="button" style={subcontractorPresetBtn} onClick={startSubcontractorAllocation}>
            Assign subcontractor
          </button>
          <button type="button" style={presetBtn} onClick={() => setLabourPreset("Slinger")}>
            Slinger
          </button>
          <button type="button" style={presetBtn} onClick={() => setLabourPreset("Lift Supervisor")}>
            Lift Supervisor
          </button>
          <button type="button" style={presetBtn} onClick={() => setLabourPreset("Appointed Person")}>
            Appointed Person
          </button>
          <button type="button" style={presetBtn} onClick={() => setLabourPreset("Operator Only")}>
            Operator Only
          </button>
          <button type="button" style={presetBtn} onClick={() => setLabourPreset("Labour Only")}>
            Labour Only
          </button>
        </div>

        <div style={miniHelpBox}>
          Subcontractor/operator costs are job-specific. Use the cost field for what we pay them on this job; use charge rate for what we charge the customer.
        </div>

        <div style={gridStyle}>
          <SelectField
            label="Asset type"
            value={draft.asset_type}
            options={[
              { value: "crane", label: "Crane" },
              { value: "vehicle", label: "Vehicle" },
              { value: "equipment", label: "Lifting Equipment" },
              { value: "other", label: "Labour / Other" },
            ]}
            onChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                asset_type: value || "crane",
                ...clearAssetIds(),
                supplier_id: "",
                purchase_order_id: "",
                item_name: value === "other" ? prev.item_name || "Labour" : prev.item_name,
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
              label="Labour / other item"
              value={draft.item_name}
              onChange={(value) => setDraft((prev) => ({ ...prev, item_name: value }))}
            />
          )}

          <SelectField
            label="Operator / subcontractor"
            value={draft.operator_id}
            options={operatorOptions}
            onChange={(value) => setDraft((prev) => ({ ...prev, operator_id: value }))}
          />

          <SelectField
            label="Source"
            value={draft.source_type}
            options={[
              { value: "owned", label: "Owned / internal" },
              { value: "cross_hire", label: "Cross-hire / supplier" },
            ]}
            onChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                source_type: value || "owned",
                supplier_id: value === "cross_hire" ? prev.supplier_id : "",
                purchase_order_id: value === "cross_hire" ? prev.purchase_order_id : "",
              }))
            }
          />

          {draft.asset_type !== "other" ? (
            <TextField
              label="Item name / role"
              value={draft.item_name}
              onChange={(value) => setDraft((prev) => ({ ...prev, item_name: value }))}
            />
          ) : null}

          <TextField
            label="Start date"
            value={draft.start_date}
            type="date"
            onChange={(value) => setDraft((prev) => ({ ...prev, start_date: value }))}
          />

          <TextField
            label="End date"
            value={draft.end_date}
            type="date"
            onChange={(value) => setDraft((prev) => ({ ...prev, end_date: value }))}
          />

          <SelectField
            label="Start time"
            value={draft.start_time}
            options={timeOptions}
            onChange={(value) => setDraft((prev) => ({ ...prev, start_time: value }))}
          />

          <SelectField
            label="End time"
            value={draft.end_time}
            options={timeOptions}
            onChange={(value) => setDraft((prev) => ({ ...prev, end_time: value }))}
          />

          <TextField
            label="Charge rate"
            value={draft.agreed_sell_rate}
            type="text"
            inputMode="decimal"
            onChange={(value) => setDraft((prev) => ({ ...prev, agreed_sell_rate: value }))}
          />

          <TextField
            label="Subcontractor / supplier cost"
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
            label="Supplier / subcontractor reference"
            value={draft.supplier_reference}
            onChange={(value) => setDraft((prev) => ({ ...prev, supplier_reference: value }))}
          />

          {draft.source_type === "cross_hire" ? (
            <>
              <SelectField
                label="Supplier company"
                value={draft.supplier_id}
                options={filterSuppliersByAssetType(draft.asset_type, supplierOptions)}
                onChange={(value) => setDraft((prev) => ({ ...prev, supplier_id: value }))}
              />

              <SelectField
                label="Purchase order"
                value={draft.purchase_order_id}
                options={purchaseOrderOptions}
                onChange={(value) => setDraft((prev) => ({ ...prev, purchase_order_id: value }))}
              />
            </>
          ) : null}

          <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              rows={3}
              value={draft.notes}
              onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
              style={textareaStyle}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={addAllocation} style={saveBtn} disabled={adding}>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
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

const topActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "wrap",
};

const helpBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontSize: 13,
  fontWeight: 700,
};

const miniHelpBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "9px 11px",
  borderRadius: 10,
  background: "rgba(255,170,0,0.10)",
  border: "1px solid rgba(255,170,0,0.18)",
  fontSize: 13,
  fontWeight: 700,
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

const presetRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 12,
};

const presetLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  opacity: 0.75,
};

const presetBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.86)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
};

const subcontractorPresetBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 999,
  background: "rgba(255,170,0,0.16)",
  color: "#111",
  fontWeight: 900,
  border: "1px solid rgba(255,170,0,0.30)",
  cursor: "pointer",
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

const subcontractorBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,170,0,0.16)",
  color: "#111",
  fontWeight: 900,
  border: "1px solid rgba(255,170,0,0.30)",
  cursor: "pointer",
};

const templateBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.86)",
  color: "#111",
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.10)",
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
  padding: "12px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px dashed rgba(0,0,0,0.10)",
  opacity: 0.75,
};
