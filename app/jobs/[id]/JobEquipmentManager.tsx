"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Option = {
  value: string;
  label: string;
};

type Allocation = {
  id: string;
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
  supplier_reference?: string | null;
  notes?: string | null;
  equipment?: { name?: string | null; asset_number?: string | null } | null;
  operators?: { full_name?: string | null } | null;
  suppliers?: { company_name?: string | null } | null;
  purchase_orders?: { po_number?: string | null; status?: string | null } | null;
};

export default function JobEquipmentManager({
  jobId,
  initialAllocations,
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

  const [draft, setDraft] = useState({
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
    agreed_cost: "0",
    supplier_reference: "",
    notes: "",
  });

  const purchaseOrderOptionsFiltered = useMemo(() => {
    if (!draft.supplier_id) return purchaseOrderOptions;
    return purchaseOrderOptions;
  }, [draft.supplier_id, purchaseOrderOptions]);

  async function addAllocation() {
    setAdding(true);
    setMessage("");

    try {
      const res = await fetch("/api/job-equipment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
          ...draft,
          agreed_cost: Number(draft.agreed_cost || 0),
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage(json?.error || "Could not add equipment allocation.");
        return;
      }

      setAllocations((prev) => [...prev, json.allocation]);
      setDraft({
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
        agreed_cost: "0",
        supplier_reference: "",
        notes: "",
      });
      setMessage("Equipment allocation added.");
      router.refresh();
    } catch {
      setMessage("Could not add equipment allocation.");
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
      router.refresh();
    } catch {
      setMessage("Could not update allocation.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteAllocation(id: string) {
    const ok = window.confirm("Delete this equipment allocation?");
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
            Add multiple cranes, HIABs or cross-hired equipment to a single job.
          </div>
        </div>
      </div>

      {message ? <div style={messageBox}>{message}</div> : null}

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {allocations.length === 0 ? (
          <div style={emptyStyle}>No equipment allocations added yet.</div>
        ) : (
          allocations.map((item) => (
            <div key={item.id} style={allocationCard}>
              <div style={gridStyle}>
                <SelectField
                  label="Equipment"
                  value={item.equipment_id ?? ""}
                  options={equipmentOptions}
                  onChange={(value) => updateAllocation(item.id, { ...item, equipment_id: value || null })}
                  disabled={savingId === item.id}
                />
                <SelectField
                  label="Operator"
                  value={item.operator_id ?? ""}
                  options={operatorOptions}
                  onChange={(value) => updateAllocation(item.id, { ...item, operator_id: value || null })}
                  disabled={savingId === item.id}
                />
                <SelectField
                  label="Source"
                  value={item.source_type ?? "owned"}
                  options={[
                    { value: "owned", label: "Owned" },
                    { value: "cross_hire", label: "Cross Hire" },
                  ]}
                  onChange={(value) => updateAllocation(item.id, { ...item, source_type: value || "owned" })}
                  disabled={savingId === item.id}
                />
                <TextField
                  label="Item name"
                  value={item.item_name ?? ""}
                  onChange={(value) => updateAllocation(item.id, { ...item, item_name: value || null })}
                  disabled={savingId === item.id}
                />
                <TextField
                  label="Start date"
                  value={item.start_date ?? ""}
                  type="date"
                  onChange={(value) => updateAllocation(item.id, { ...item, start_date: value || null })}
                  disabled={savingId === item.id}
                />
                <TextField
                  label="End date"
                  value={item.end_date ?? ""}
                  type="date"
                  onChange={(value) => updateAllocation(item.id, { ...item, end_date: value || null })}
                  disabled={savingId === item.id}
                />
                <TextField
                  label="Start time"
                  value={item.start_time ?? ""}
                  onChange={(value) => updateAllocation(item.id, { ...item, start_time: value || null })}
                  disabled={savingId === item.id}
                />
                <TextField
                  label="End time"
                  value={item.end_time ?? ""}
                  onChange={(value) => updateAllocation(item.id, { ...item, end_time: value || null })}
                  disabled={savingId === item.id}
                />
                <TextField
                  label="Agreed cost"
                  value={String(item.agreed_cost ?? 0)}
                  type="number"
                  onChange={(value) => updateAllocation(item.id, { ...item, agreed_cost: Number(value || 0) })}
                  disabled={savingId === item.id}
                />
                <TextField
                  label="Supplier reference"
                  value={item.supplier_reference ?? ""}
                  onChange={(value) => updateAllocation(item.id, { ...item, supplier_reference: value || null })}
                  disabled={savingId === item.id}
                />

                {(item.source_type ?? "owned") === "cross_hire" ? (
                  <>
                    <SelectField
                      label="Supplier"
                      value={item.supplier_id ?? ""}
                      options={supplierOptions}
                      onChange={(value) => updateAllocation(item.id, { ...item, supplier_id: value || null })}
                      disabled={savingId === item.id}
                    />
                    <SelectField
                      label="Purchase order"
                      value={item.purchase_order_id ?? ""}
                      options={purchaseOrderOptions}
                      onChange={(value) => updateAllocation(item.id, { ...item, purchase_order_id: value || null })}
                      disabled={savingId === item.id}
                    />
                  </>
                ) : null}

                <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    value={item.notes ?? ""}
                    onChange={(e) => updateAllocation(item.id, { ...item, notes: e.target.value || null })}
                    rows={3}
                    style={textareaStyle}
                    disabled={savingId === item.id}
                  />
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, opacity: 0.72 }}>
                  {item.equipment?.name ?? item.item_name ?? "Equipment"} •{" "}
                  {item.operators?.full_name ?? "No operator"} •{" "}
                  {item.suppliers?.company_name ?? "Owned"}
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
          ))
        )}
      </div>

      <div style={{ ...allocationCard, marginTop: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>Add equipment allocation</h3>

        <div style={gridStyle}>
          <SelectField
            label="Equipment"
            value={draft.equipment_id}
            options={equipmentOptions}
            onChange={(value) => setDraft((prev) => ({ ...prev, equipment_id: value }))}
          />
          <SelectField
            label="Operator"
            value={draft.operator_id}
            options={operatorOptions}
            onChange={(value) => setDraft((prev) => ({ ...prev, operator_id: value }))}
          />
          <SelectField
            label="Source"
            value={draft.source_type}
            options={[
              { value: "owned", label: "Owned" },
              { value: "cross_hire", label: "Cross Hire" },
            ]}
            onChange={(value) => setDraft((prev) => ({ ...prev, source_type: value || "owned" }))}
          />
          <TextField
            label="Item name"
            value={draft.item_name}
            onChange={(value) => setDraft((prev) => ({ ...prev, item_name: value }))}
          />
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
          <TextField
            label="Start time"
            value={draft.start_time}
            onChange={(value) => setDraft((prev) => ({ ...prev, start_time: value }))}
          />
          <TextField
            label="End time"
            value={draft.end_time}
            onChange={(value) => setDraft((prev) => ({ ...prev, end_time: value }))}
          />
          <TextField
            label="Agreed cost"
            value={draft.agreed_cost}
            type="number"
            onChange={(value) => setDraft((prev) => ({ ...prev, agreed_cost: value }))}
          />
          <TextField
            label="Supplier reference"
            value={draft.supplier_reference}
            onChange={(value) => setDraft((prev) => ({ ...prev, supplier_reference: value }))}
          />

          {draft.source_type === "cross_hire" ? (
            <>
              <SelectField
                label="Supplier"
                value={draft.supplier_id}
                options={supplierOptions}
                onChange={(value) => setDraft((prev) => ({ ...prev, supplier_id: value }))}
              />
              <SelectField
                label="Purchase order"
                value={draft.purchase_order_id}
                options={purchaseOrderOptionsFiltered}
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
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
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
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
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

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  boxSizing: "border-box",
  resize: "vertical",
};

const saveBtn: React.CSSProperties = {
  padding: "10px 16px",
  background: "#111",
  color: "#fff",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
};

const deleteBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,0,0,0.16)",
  background: "rgba(255,0,0,0.06)",
  color: "#b00020",
  fontWeight: 800,
  cursor: "pointer",
};

const messageBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,170,0,0.14)",
  border: "1px solid rgba(255,170,0,0.24)",
  fontWeight: 700,
};

const emptyStyle: React.CSSProperties = {
  opacity: 0.65,
};
