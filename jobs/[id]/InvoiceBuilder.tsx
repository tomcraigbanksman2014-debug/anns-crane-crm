"use client";

import { useEffect, useMemo, useState } from "react";

type InvoiceLine = {
  description: string;
  qty: string;
  unit_price: string;
};

function money(n: number) {
  return `£${n.toFixed(2)}`;
}

function num(v: string) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function clean(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function buildDefaultLines({
  craneName,
  operatorName,
  siteName,
  jobDate,
}: {
  craneName?: string | null;
  operatorName?: string | null;
  siteName?: string | null;
  jobDate?: string | null;
}) {
  const formattedDate = jobDate
    ? new Date(jobDate).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const mainDescriptionParts = [
    craneName ? `${craneName} crane hire` : "Crane hire",
    operatorName ? `Operator: ${operatorName}` : "",
    siteName ? `Site: ${siteName}` : "",
    formattedDate ? `Date: ${formattedDate}` : "",
  ].filter(Boolean);

  return [
    {
      description: mainDescriptionParts.join("\n"),
      qty: "1",
      unit_price: "0",
    },
    {
      description: "Lift supervisor / slinger / support labour",
      qty: "1",
      unit_price: "0",
    },
    {
      description: "Travel / transport / mobilisation",
      qty: "1",
      unit_price: "0",
    },
    {
      description: "Mats / ancillary equipment",
      qty: "1",
      unit_price: "0",
    },
  ];
}

function buildDefaultNotes({
  jobNumber,
  siteName,
  siteAddress,
  customerName,
  craneName,
  operatorName,
}: {
  jobNumber?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  customerName?: string | null;
  craneName?: string | null;
  operatorName?: string | null;
}) {
  const parts = [
    jobNumber ? `Reference: Job ${jobNumber}` : "",
    customerName ? `Customer: ${customerName}` : "",
    craneName ? `Crane: ${craneName}` : "",
    operatorName ? `Operator: ${operatorName}` : "",
    siteName ? `Site: ${siteName}` : "",
    siteAddress ? `Address: ${siteAddress}` : "",
  ].filter(Boolean);

  return parts.join("\n");
}

export default function InvoiceBuilder({
  jobId,
  jobNumber,
  customerName,
  craneName,
  operatorName,
  siteName,
  siteAddress,
  jobDate,
}: {
  jobId: string;
  jobNumber?: string | null;
  customerName?: string | null;
  craneName?: string | null;
  operatorName?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  jobDate?: string | null;
}) {
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [vatRate, setVatRate] = useState("20");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    setLines(
      buildDefaultLines({
        craneName,
        operatorName,
        siteName,
        jobDate,
      })
    );

    setInvoiceNotes(
      buildDefaultNotes({
        jobNumber,
        siteName,
        siteAddress,
        customerName,
        craneName,
        operatorName,
      })
    );
  }, [jobNumber, customerName, craneName, operatorName, siteName, siteAddress, jobDate]);

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, line) => sum + num(line.qty) * num(line.unit_price), 0),
    [lines]
  );

  const vat = subtotal * (num(vatRate) / 100);
  const total = subtotal + vat;

  function updateLine(index: number, key: keyof InvoiceLine, value: string) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, [key]: value } : line))
    );
  }

  function addLine() {
    setLines((prev) => [...prev, { description: "", qty: "1", unit_price: "0" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function resetTemplate() {
    setLines(
      buildDefaultLines({
        craneName,
        operatorName,
        siteName,
        jobDate,
      })
    );

    setInvoiceNotes(
      buildDefaultNotes({
        jobNumber,
        siteName,
        siteAddress,
        customerName,
        craneName,
        operatorName,
      })
    );
  }

  async function generate() {
    setSaving(true);
    setMsg("");
    setGenerated(false);

    try {
      const res = await fetch(`/api/jobs/${jobId}/invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lines,
          vat_rate: vatRate,
          invoice_notes: invoiceNotes,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not generate invoice.");
        return;
      }

      setGenerated(true);
      setMsg(`Invoice generated: ${data.invoice_number}`);
    } catch {
      setMsg("Could not generate invoice.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 22 }}>Invoice Builder</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={resetTemplate} style={secondaryBtn}>
            Reset template
          </button>

          <a
            href={`/jobs/${jobId}/invoice/print`}
            target="_blank"
            style={secondaryBtnLink}
          >
            Open Invoice PDF
          </a>
        </div>
      </div>

      <div
        style={{
          marginBottom: 12,
          padding: 12,
          borderRadius: 10,
          background: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(0,0,0,0.08)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <div><strong>Customer:</strong> {clean(customerName) || "—"}</div>
        <div><strong>Crane:</strong> {clean(craneName) || "—"}</div>
        <div><strong>Operator:</strong> {clean(operatorName) || "—"}</div>
        <div><strong>Site:</strong> {clean(siteName) || "—"}</div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {lines.map((line, index) => (
          <div
            key={index}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) 110px 140px auto",
              gap: 10,
              alignItems: "start",
            }}
          >
            <textarea
              value={line.description}
              onChange={(e) => updateLine(index, "description", e.target.value)}
              placeholder="Description"
              rows={4}
              style={textAreaStyle}
            />
            <input
              value={line.qty}
              onChange={(e) => updateLine(index, "qty", e.target.value)}
              type="number"
              step="0.01"
              placeholder="Qty"
              style={inputStyle}
            />
            <input
              value={line.unit_price}
              onChange={(e) => updateLine(index, "unit_price", e.target.value)}
              type="number"
              step="0.01"
              placeholder="Unit price"
              style={inputStyle}
            />
            <button type="button" onClick={() => removeLine(index)} style={removeBtn}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <button type="button" onClick={addLine} style={secondaryBtn}>
          + Add line
        </button>
      </div>

      <div style={{ ...gridStyle, marginTop: 14 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>VAT %</label>
          <input
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            type="number"
            step="0.01"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Invoice notes</label>
        <textarea
          value={invoiceNotes}
          onChange={(e) => setInvoiceNotes(e.target.value)}
          rows={5}
          style={textAreaStyle}
        />
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
        <div><strong>Subtotal:</strong> {money(subtotal)}</div>
        <div><strong>VAT:</strong> {money(vat)}</div>
        <div><strong>Total:</strong> {money(total)}</div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button type="button" onClick={generate} disabled={saving} style={saveBtn}>
          {saving ? "Generating..." : "Generate Invoice"}
        </button>

        {generated ? (
          <a href={`/jobs/${jobId}/invoice/print`} target="_blank" style={secondaryBtnLink}>
            Open Invoice PDF
          </a>
        ) : null}
      </div>

      {msg ? <div style={msgStyle}>{msg}</div> : null}
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

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.78,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
};

const textAreaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
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

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.70)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtnLink: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.70)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
};

const removeBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,0,0,0.16)",
  background: "rgba(255,0,0,0.06)",
  color: "#b00020",
  fontWeight: 800,
  cursor: "pointer",
};

const msgStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  fontWeight: 700,
};
