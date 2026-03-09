"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Customer = {
  id: string;
  company_name: string | null;
};

type Quote = {
  id: string;
  client_id: string;
  status: "Draft" | "Sent" | "Accepted" | "Rejected";
  quote_date: string | null;
  valid_until: string | null;
  amount: number | null;
  subject: string | null;
  notes: string | null;
};

type Props =
  | {
      mode: "create";
      customers: Customer[];
      quote?: never;
    }
  | {
      mode: "edit";
      customers: Customer[];
      quote: Quote;
    };

export default function QuoteForm(props: Props) {
  const router = useRouter();

  const isEdit = props.mode === "edit";
  const quote = isEdit ? props.quote : null;

  const [clientId, setClientId] = useState(quote?.client_id ?? "");
  const [status, setStatus] = useState<"Draft" | "Sent" | "Accepted" | "Rejected">(
    quote?.status ?? "Draft"
  );
  const [quoteDate, setQuoteDate] = useState(
    quote?.quote_date ?? new Date().toISOString().slice(0, 10)
  );
  const [validUntil, setValidUntil] = useState(quote?.valid_until ?? "");
  const [amount, setAmount] = useState(
    quote?.amount != null ? String(quote.amount) : ""
  );
  const [subject, setSubject] = useState(quote?.subject ?? "");
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("Customer is required");
      return;
    }

    try {
      setSaving(true);

      const url = isEdit
        ? `/api/quotes/${quote?.id}/update`
        : `/api/quotes/create`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          status,
          quote_date: quoteDate,
          valid_until: validUntil || null,
          amount: amount || null,
          subject,
          notes,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error ?? "Failed to save quote");
        return;
      }

      if (isEdit) {
        router.refresh();
      } else {
        router.push(`/quotes/${json?.id}`);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to save quote");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={cardStyle}>
      <h1 style={{ marginTop: 0, marginBottom: 16, fontSize: 32 }}>
        {isEdit ? "Edit quote" : "New quote"}
      </h1>

      {error && <div style={errorBox}>{error}</div>}

      <div style={gridStyle}>
        <div style={fieldWrap}>
          <label style={labelStyle}>Customer</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select customer</option>
            {props.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name || c.id}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>Status</label>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "Draft" | "Sent" | "Accepted" | "Rejected")
            }
            style={inputStyle}
          >
            <option value="Draft">Draft</option>
            <option value="Sent">Sent</option>
            <option value="Accepted">Accepted</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>Quote date</label>
          <input
            type="date"
            value={quoteDate}
            onChange={(e) => setQuoteDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>Valid until</label>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>Amount</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
            placeholder="0.00"
          />
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={inputStyle}
            placeholder="Quote subject"
          />
        </div>
      </div>

      <div style={{ ...fieldWrap, marginTop: 12 }}>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          style={{ ...inputStyle, resize: "vertical", minHeight: 180 }}
          placeholder="Quote details, scope, terms, notes"
        />
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving} style={buttonStyle}>
          {saving ? "Saving..." : isEdit ? "Save quote" : "Create quote"}
        </button>

        <a href="/quotes" style={secondaryBtnStyle}>
          Cancel
        </a>
      </div>
    </form>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
  alignItems: "start",
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "10px 12px",
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.25)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 700,
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
