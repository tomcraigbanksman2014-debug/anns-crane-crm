"use client";

import { useMemo, useState } from "react";

type SupplierOption = {
  value: string;
  label: string;
  category?: string | null;
};

type SupplierLink = {
  supplier_id?: string | null;
  supplier_display_name?: string | null;
  supplier_category?: string | null;
  supplier_reference?: string | null;
  service_description?: string | null;
  supplier_cost?: number | string | null;
  notes?: string | null;
  is_primary?: boolean;
};

function emptyRow(): SupplierLink {
  return {
    supplier_id: "",
    supplier_display_name: "",
    supplier_category: "",
    supplier_reference: "",
    service_description: "",
    supplier_cost: "",
    notes: "",
    is_primary: false,
  };
}

function toCostString(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

export default function MultiSupplierFields({
  supplierOptions,
  initialLinks,
  title = "Suppliers / subcontractors",
  help = "Add every supplier, subcontractor or cross-hire company connected to this job. Tick the main supplier to keep old planner, PO and invoice logic working.",
}: {
  supplierOptions: SupplierOption[];
  initialLinks?: SupplierLink[];
  title?: string;
  help?: string;
}) {
  const preparedInitialRows = useMemo(() => {
    const rows = (initialLinks ?? []).map((row) => ({
      ...emptyRow(),
      ...row,
      supplier_id: row.supplier_id ?? (row.supplier_display_name ? "other" : ""),
      supplier_cost: toCostString(row.supplier_cost),
      is_primary: Boolean(row.is_primary),
    }));

    if (rows.length === 0) return [{ ...emptyRow(), is_primary: true }];
    if (!rows.some((row) => row.is_primary)) rows[0].is_primary = true;
    return rows;
  }, [initialLinks]);

  const [rows, setRows] = useState<SupplierLink[]>(preparedInitialRows);

  function updateRow(index: number, patch: Partial<SupplierLink>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function setPrimary(index: number) {
    setRows((current) => current.map((row, rowIndex) => ({ ...row, is_primary: rowIndex === index })));
  }

  function addRow() {
    setRows((current) => [...current, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((current) => {
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      if (next.length === 0) return [{ ...emptyRow(), is_primary: true }];
      if (!next.some((row) => row.is_primary)) next[0] = { ...next[0], is_primary: true };
      return next;
    });
  }

  function supplierMeta(value: string | null | undefined) {
    return supplierOptions.find((option) => option.value === value) ?? null;
  }

  return (
    <section style={sectionStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h3 style={headingStyle}>{title}</h3>
          <p style={helpStyle}>{help}</p>
        </div>
        <button type="button" onClick={addRow} style={secondaryButtonStyle}>
          Add supplier
        </button>
      </div>

      <input type="hidden" name="supplier_link_count" value={rows.length} />

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {rows.map((row, index) => {
          const selectedSupplier = supplierMeta(row.supplier_id);
          const isOther = row.supplier_id === "other" || (!row.supplier_id && row.supplier_display_name);
          const displayName = isOther ? row.supplier_display_name ?? "" : selectedSupplier?.label ?? row.supplier_display_name ?? "";
          const category = selectedSupplier?.category ?? row.supplier_category ?? "";

          return (
            <div key={index} style={rowStyle}>
              <div style={rowHeaderStyle}>
                <div style={{ fontWeight: 900 }}>Supplier #{index + 1}</div>
                <label style={primaryLabelStyle}>
                  <input
                    type="radio"
                    checked={Boolean(row.is_primary)}
                    onChange={() => setPrimary(index)}
                    style={{ marginRight: 6 }}
                  />
                  Main supplier
                </label>
              </div>

              <div style={gridStyle}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Supplier</span>
                  <select
                    name={`supplier_link_supplier_id_${index}`}
                    value={row.supplier_id ?? ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      const nextSupplier = supplierMeta(nextValue);
                      updateRow(index, {
                        supplier_id: nextValue,
                        supplier_display_name: nextValue === "other" ? row.supplier_display_name ?? "" : nextSupplier?.label ?? "",
                        supplier_category: nextValue === "other" ? row.supplier_category ?? "" : nextSupplier?.category ?? "",
                      });
                    }}
                    style={inputStyle}
                  >
                    <option value="">— Select supplier —</option>
                    {supplierOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    <option value="other">Other / one-off supplier</option>
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Supplier display/name</span>
                  <input
                    name={`supplier_link_supplier_display_name_${index}`}
                    value={displayName}
                    onChange={(event) => updateRow(index, { supplier_display_name: event.target.value })}
                    style={inputStyle}
                    placeholder="Company name"
                    readOnly={!isOther && Boolean(row.supplier_id)}
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Type / category</span>
                  <input
                    name={`supplier_link_supplier_category_${index}`}
                    value={category}
                    onChange={(event) => updateRow(index, { supplier_category: event.target.value })}
                    style={inputStyle}
                    placeholder="e.g. Crane hire / haulage / labour"
                    readOnly={!isOther && Boolean(row.supplier_id)}
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Supplier reference</span>
                  <input
                    name={`supplier_link_supplier_reference_${index}`}
                    value={row.supplier_reference ?? ""}
                    onChange={(event) => updateRow(index, { supplier_reference: event.target.value })}
                    style={inputStyle}
                    placeholder="PO / booking / supplier ref"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Cost</span>
                  <input
                    name={`supplier_link_supplier_cost_${index}`}
                    value={row.supplier_cost == null ? "" : String(row.supplier_cost)}
                    onChange={(event) => updateRow(index, { supplier_cost: event.target.value })}
                    style={inputStyle}
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                  />
                </label>

                <label style={{ ...fieldStyle, gridColumn: "span 2" }}>
                  <span style={labelStyle}>What they are supplying / service description</span>
                  <input
                    name={`supplier_link_service_description_${index}`}
                    value={row.service_description ?? ""}
                    onChange={(event) => updateRow(index, { service_description: event.target.value })}
                    style={inputStyle}
                    placeholder="e.g. 100t mobile crane, pilot car, labour, low loader"
                  />
                </label>
              </div>

              <label style={{ ...fieldStyle, marginTop: 10 }}>
                <span style={labelStyle}>Notes</span>
                <textarea
                  name={`supplier_link_notes_${index}`}
                  value={row.notes ?? ""}
                  onChange={(event) => updateRow(index, { notes: event.target.value })}
                  rows={2}
                  style={textareaStyle}
                  placeholder="Internal supplier notes"
                />
              </label>

              <input type="hidden" name={`supplier_link_is_primary_${index}`} value={row.is_primary ? "true" : "false"} />

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button type="button" onClick={() => removeRow(index)} style={dangerButtonStyle}>
                  Remove supplier
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 18,
  padding: 16,
  background: "#fff",
  boxShadow: "0 8px 22px rgba(15,23,42,0.05)",
};

const headingStyle: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 900 };
const helpStyle: React.CSSProperties = { margin: "6px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.45 };

const rowStyle: React.CSSProperties = {
  border: "1px solid rgba(15,23,42,0.08)",
  borderRadius: 14,
  padding: 12,
  background: "#f8fafc",
};

const rowHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginBottom: 10,
  flexWrap: "wrap",
};

const primaryLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", fontWeight: 800, fontSize: 13 };

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 10,
};

const fieldStyle: React.CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 900, color: "#334155" };

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.14)",
  padding: "9px 10px",
  fontSize: 14,
  background: "#fff",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 74,
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 999,
  padding: "9px 13px",
  fontWeight: 900,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(220,38,38,0.2)",
  background: "rgba(220,38,38,0.08)",
  color: "#991b1b",
  borderRadius: 999,
  padding: "7px 11px",
  fontWeight: 900,
  cursor: "pointer",
};
