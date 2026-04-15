"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildQuoteNotes,
  DEFAULT_HIRE_TERMS_TEXT,
  getEmptyStructuredQuoteFields,
  parseQuoteNotes,
  StructuredQuoteFields,
} from "./quoteTemplate";

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
  const parsed = useMemo(
    () => parseQuoteNotes(quote?.notes ?? null),
    [quote?.notes]
  );

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
  const [fields, setFields] = useState<StructuredQuoteFields>(
    parsed.fields ?? getEmptyStructuredQuoteFields()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof StructuredQuoteFields>(key: K, value: StructuredQuoteFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

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

      const notes = buildQuoteNotes(fields);

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
        router.push(`/quotes/${quote?.id}`);
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

      {!parsed.isStructured && parsed.rawNotes ? (
        <div style={infoBox}>
          This quote was using the old notes-only format. The editor has pulled the existing text into <strong>Additional quote notes</strong> so you can re-save it in the new quote PDF layout.
        </div>
      ) : null}

      <div style={gridStyle}>
        <Field label="Customer">
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
        </Field>

        <Field label="Status">
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
        </Field>

        <Field label="Quote date">
          <input
            type="date"
            value={quoteDate}
            onChange={(e) => setQuoteDate(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Valid until">
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Amount">
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
            placeholder="0.00"
          />
        </Field>

        <Field label="Subject">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={inputStyle}
            placeholder="Quote subject"
          />
        </Field>
      </div>

      <SectionTitle title="Quote layout details" />
      <div style={gridStyle}>
        <Field label="Contact name">
          <input
            value={fields.contactName}
            onChange={(e) => updateField("contactName", e.target.value)}
            style={inputStyle}
            placeholder="Dan Roberts"
          />
        </Field>

        <Field label="Contact tel">
          <input
            value={fields.contactPhone}
            onChange={(e) => updateField("contactPhone", e.target.value)}
            style={inputStyle}
            placeholder="Contact number"
          />
        </Field>

        <Field label="Date & time of project">
          <textarea
            value={fields.projectDateTime}
            onChange={(e) => updateField("projectDateTime", e.target.value)}
            rows={3}
            style={textareaStyle}
            placeholder={"TBC, Minimum 2 day hire\nWeekday working"}
          />
        </Field>

        <Field label="Site location">
          <textarea
            value={fields.siteLocation}
            onChange={(e) => updateField("siteLocation", e.target.value)}
            rows={3}
            style={textareaStyle}
            placeholder="Trehafod Culvert – Updated Quote"
          />
        </Field>

        <Field label="Hire type">
          <textarea
            value={fields.hireType}
            onChange={(e) => updateField("hireType", e.target.value)}
            rows={3}
            style={textareaStyle}
            placeholder="Contract lift (subject to CPA contract lift term and conditions)"
          />
        </Field>

        <Field label="Location">
          <textarea
            value={fields.workLocation}
            onChange={(e) => updateField("workLocation", e.target.value)}
            rows={3}
            style={textareaStyle}
            placeholder="Actual working location / site address"
          />
        </Field>

        <Field label="Date(s)">
          <textarea
            value={fields.workDates}
            onChange={(e) => updateField("workDates", e.target.value)}
            rows={3}
            style={textareaStyle}
            placeholder="Week commencing 20th April 2026"
          />
        </Field>

        <Field label="Duration">
          <textarea
            value={fields.duration}
            onChange={(e) => updateField("duration", e.target.value)}
            rows={3}
            style={textareaStyle}
            placeholder="Min hire of 2 days"
          />
        </Field>

        <Field label="Working hours / pattern">
          <textarea
            value={fields.workingHours}
            onChange={(e) => updateField("workingHours", e.target.value)}
            rows={3}
            style={textareaStyle}
            placeholder={"8 hours per day (including a 30-minute break)\nWeekday working"}
          />
        </Field>

        <Field label="Cost summary">
          <textarea
            value={fields.costSummary}
            onChange={(e) => updateField("costSummary", e.target.value)}
            rows={3}
            style={textareaStyle}
            placeholder="£7,500.00 per day + VAT"
          />
        </Field>
      </div>

      <div style={{ ...fieldWrap, marginTop: 12 }}>
        <label style={labelStyle}>To supply</label>
        <textarea
          value={fields.toSupply}
          onChange={(e) => updateField("toSupply", e.target.value)}
          rows={5}
          style={textareaStyle}
          placeholder="What is being supplied"
        />
      </div>

      <div style={{ ...fieldWrap, marginTop: 12 }}>
        <label style={labelStyle}>Scope of work</label>
        <textarea
          value={fields.scopeOfWork}
          onChange={(e) => updateField("scopeOfWork", e.target.value)}
          rows={6}
          style={textareaStyle}
          placeholder="Full description of the works"
        />
      </div>

      <div style={{ ...fieldWrap, marginTop: 12 }}>
        <label style={labelStyle}>Breakdown of current charges / rates</label>
        <textarea
          value={fields.breakdown}
          onChange={(e) => updateField("breakdown", e.target.value)}
          rows={6}
          style={textareaStyle}
          placeholder={"Use one line per row in this format:\nQty | Description | Rate\n\nExample:\n1x | Cancelled contract lift, Wednesday 8th April – same day cancellation | £2,500.00 Excluding VAT"}
        />
      </div>

      <div style={gridStyleWide}>
        <Field label="Additional equipment & personnel">
          <textarea
            value={fields.additionalEquipment}
            onChange={(e) => updateField("additionalEquipment", e.target.value)}
            rows={8}
            style={textareaStyle}
            placeholder={"One item per line\nAdditional crane mats\nAP / Lifting Supervisor"}
          />
        </Field>

        <Field label="Included under full CPA terms">
          <textarea
            value={fields.includedItems}
            onChange={(e) => updateField("includedItems", e.target.value)}
            rows={8}
            style={textareaStyle}
            placeholder={"One item per line\nAll lifting accessories and rigging\nPlanning and supervision to meet full CPA obligations"}
          />
        </Field>
      </div>

      <div style={{ ...fieldWrap, marginTop: 12 }}>
        <label style={labelStyle}>Additional quote notes</label>
        <textarea
          value={fields.additionalNotes}
          onChange={(e) => updateField("additionalNotes", e.target.value)}
          rows={6}
          style={textareaStyle}
          placeholder="Extra wording to appear above the standard terms"
        />
      </div>

      <div style={{ ...fieldWrap, marginTop: 12 }}>
        <label style={labelStyle}>Payment terms</label>
        <input
          value={fields.paymentTerms}
          onChange={(e) => updateField("paymentTerms", e.target.value)}
          style={inputStyle}
          placeholder="30 days from Month End"
        />
      </div>

      <div style={termsInfoBox}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Standard terms included automatically in every quote PDF</div>
        <div style={termsPreview}>{DEFAULT_HIRE_TERMS_TEXT}</div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving} style={buttonStyle}>
          {saving ? "Saving..." : isEdit ? "Save quote" : "Create quote"}
        </button>

        <a href={isEdit ? `/quotes/${quote?.id}` : "/quotes"} style={secondaryBtnStyle}>
          Cancel
        </a>
      </div>
    </form>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 style={{ marginTop: 20, marginBottom: 12, fontSize: 20 }}>{title}</h2>;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={fieldWrap}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
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

const gridStyleWide: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 12,
  alignItems: "start",
  marginTop: 12,
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

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 96,
  lineHeight: 1.45,
  fontFamily: "inherit",
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
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.25)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const infoBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.12)",
  lineHeight: 1.45,
};

const termsInfoBox: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.12)",
};

const termsPreview: React.CSSProperties = {
  marginTop: 4,
  maxHeight: 220,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  fontSize: 12,
  lineHeight: 1.45,
  background: "rgba(255,255,255,0.7)",
  borderRadius: 10,
  padding: 12,
};
