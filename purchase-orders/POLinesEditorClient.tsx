"use client";

import { useMemo, useState } from "react";

type LineRow = {
  description: string;
  qty: string;
  unit_cost: string;
};

function emptyLine(): LineRow {
  return {
    description: "",
    qty: "1",
    unit_cost: "0",
  };
}

export default function POLinesEditorClient({
  fieldName,
  initialLines,
}: {
  fieldName: string;
  initialLines?: Array<{
    description?: string;
    qty?: string;
    unit_cost?: string;
  }>;
}) {
  const [lines, setLines] = useState<LineRow[]>(
    initialLines && initialLines.length > 0
      ? initialLines.map((line) => ({
          description: String(line.description ?? ""),
          qty: String(line.qty ?? "1"),
          unit_cost: String(line.unit_cost ?? "0"),
        }))
      : [emptyLine()]
  );

  const serialised = useMemo(() => JSON.stringify(lines), [lines]);

  const total = useMemo(() => {
    return lines.reduce((sum, line) => {
      const qty = Number(line.qty || 0) || 0;
      const unit = Number(line.unit_cost || 0) || 0;
      return sum + qty * unit;
    }, 0);
  }, [lines]);

  function updateLine(index: number, key: keyof LineRow, value: string) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, [key]: value } : line))
    );
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  return (
    <div style={wrapStyle}>
      <input type="hidden" name={fieldName} value={serialised} />

      <div style={headerStyle}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>PO Line Items</h3>
          <div style={{ fontSize: 13, opacity: 0.72, marginTop: 4 }}>
            Add crane hire, transport, labour or other supplier costs.
          </div>
        </div>

        <button type="button" onClick={addLine} style={secondaryBtn}>
          + Add line
        </button>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {lines.map((line, index) => {
          const qty = Number(line.qty || 0) || 0;
          const unit = Number(line.unit_cost || 0) || 0;
          const lineTotal = qty * unit;

          return (
            <div key={index} style={lineCard}>
              <div style={lineGrid}>
                <div style={{ display: "grid", gap: 6, gridColumn: "span 2" }}>
                  <label style={labelStyle}>Description</label>
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(index, "description", e.target.value)}
                    style={inputStyle}
                    placeholder="e.g. 50t mobile crane hire"
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Qty</label>
                  <input
                    type="number"
                    value={line.qty}
                    onChange={(e) => updateLine(index, "qty", e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Unit cost</label>
                  <input
                    type="number"
                    value={line.unit_cost}
                    onChange={(e) => updateLine(index, "unit_cost", e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Line total</label>
                  <div style={totalBox}>£{lineTotal.toFixed(2)}</div>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <button type="button" onClick={() => removeLine(index)} style={removeBtn}>
                  Remove line
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={summaryStyle}>
        Total: <strong>£{total.toFixed(2)}</strong>
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const lineCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const lineGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr 1fr",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  boxSizing: "border-box",
};

const totalBox: React.CSSProperties = {
  height: 40,
  display: "flex",
  alignItems: "center",
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.9)",
  fontWeight: 800,
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.80)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const removeBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,0,0,0.15)",
  background: "rgba(255,0,0,0.06)",
  color: "#b00020",
  fontWeight: 800,
  cursor: "pointer",
};

const summaryStyle: React.CSSProperties = {
  marginTop: 12,
  textAlign: "right",
  fontSize: 16,
  fontWeight: 700,
};
