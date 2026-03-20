"use client";

import { useMemo, useState } from "react";

type Option = {
  value: string;
  label: string;
};

type AllocationDraft = {
  equipment_id: string;
  operator_id: string;
  source_type: "owned" | "cross_hire";
  supplier_id: string;
  purchase_order_id: string;
  item_name: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  agreed_cost: string;
  supplier_reference: string;
  notes: string;
};

function emptyRow(defaultDate = "", defaultStartTime = "", defaultEndTime = ""): AllocationDraft {
  return {
    equipment_id: "",
    operator_id: "",
    source_type: "owned",
    supplier_id: "",
    purchase_order_id: "",
    item_name: "",
    start_date: defaultDate,
    end_date: defaultDate,
    start_time: defaultStartTime,
    end_time: defaultEndTime,
    agreed_cost: "0",
    supplier_reference: "",
    notes: "",
  };
}

export default function EquipmentAllocationsCreate({
  fieldName = "equipment_allocations_json",
  equipmentOptions,
  operatorOptions,
  supplierOptions,
  purchaseOrderOptions,
  defaultDate = "",
  defaultStartTime = "",
  defaultEndTime = "",
  title = "Equipment Allocations",
}: {
  fieldName?: string;
  equipmentOptions: Option[];
  operatorOptions: Option[];
  supplierOptions: Option[];
  purchaseOrderOptions: Option[];
  defaultDate?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  title?: string;
}) {
  const [rows, setRows] = useState<AllocationDraft[]>([
    emptyRow(defaultDate, defaultStartTime, defaultEndTime),
  ]);

  const jsonValue = useMemo(() => JSON.stringify(rows), [rows]);

  function updateRow(index: number, key: keyof AllocationDraft, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(defaultDate, defaultStartTime, defaultEndTime)]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div style={wrapStyle}>
      <input type="hidden" name={fieldName} value={jsonValue} />

      <div style={topRow}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 22 }}>{title}</h2>
          <div style={{ opacity: 0.72 }}>
            Add one or more cranes, HIABs or cross-hired items now.
          </div>
        </div>

        <button type="button" onClick={addRow} style={secondaryBtn}>
          + Add equipment
        </button>
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {rows.map((row, index) => (
          <div key={index} style={rowCard}>
            <div style={rowTop}>
              <div style={{ fontWeight: 900 }}>Item {index + 1}</div>

              {rows.length > 1 ? (
                <button type="button" onClick={() => removeRow(index)} style={removeBtn}>
                  Remove
                </button>
              ) : null}
            </div>

            <div style={gridStyle}>
              <SelectField
                label="Equipment"
                value={row.equipment_id}
                options={equipmentOptions}
                onChange={(value) => updateRow(index, "equipment_id", value)}
              />

              <SelectField
                label="Operator"
                value={row.operator_id}
                options={operatorOptions}
                onChange={(value) => updateRow(index, "operator_id", value)}
              />

              <SelectField
                label="Source"
                value={row.source_type}
                options={[
                  { value: "owned", label: "Owned" },
                  { value: "cross_hire", label: "Cross Hire" },
                ]}
                onChange={(value) => updateRow(index, "source_type", value as "owned" | "cross_hire")}
              />

              <TextField
                label="Item name (optional)"
                value={row.item_name}
                onChange={(value) => updateRow(index, "item_name", value)}
              />

              <TextField
                label="Start date"
                type="date"
                value={row.start_date}
                onChange={(value) => updateRow(index, "start_date", value)}
              />

              <TextField
                label="End date"
                type="date"
                value={row.end_date}
                onChange={(value) => updateRow(index, "end_date", value)}
              />

              <TextField
                label="Start time"
                type="time"
                value={row.start_time}
                onChange={(value) => updateRow(index, "start_time", value)}
              />

              <TextField
                label="End time"
                type="time"
                value={row.end_time}
                onChange={(value) => updateRow(index, "end_time", value)}
              />

              <TextField
                label="Agreed cost"
                type="number"
                value={row.agreed_cost}
                onChange={(value) => updateRow(index, "agreed_cost", value)}
              />

              <TextField
                label="Supplier reference"
                value={row.supplier_reference}
                onChange={(value) => updateRow(index, "supplier_reference", value)}
              />

              {row.source_type === "cross_hire" ? (
                <>
                  <SelectField
                    label="Supplier"
                    value={row.supplier_id}
                    options={supplierOptions}
                    onChange={(value) => updateRow(index, "supplier_id", value)}
                  />

                  <SelectField
                    label="Purchase Order"
                    value={row.purchase_order_id}
                    options={purchaseOrderOptions}
                    onChange={(value) => updateRow(index, "purchase_order_id", value)}
                  />
                </>
              ) : null}

              <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  rows={3}
                  value={row.notes}
                  onChange={(e) => updateRow(index, "notes", e.target.value)}
                  style={textareaStyle}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">— Select —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
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

const rowCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const rowTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginBottom: 12,
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

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.70)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const removeBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,0,0,0.16)",
  background: "rgba(255,0,0,0.06)",
  color: "#b00020",
  fontWeight: 800,
  cursor: "pointer",
};
