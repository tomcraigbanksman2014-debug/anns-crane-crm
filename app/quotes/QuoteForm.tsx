"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  buildQuoteNotes,
  DEFAULT_CONTRACT_TERMS_TEXT,
  DEFAULT_HIRE_TERMS_TEXT,
  DEFAULT_PAYMENT_TERMS,
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
  const parsed = useMemo(() => parseQuoteNotes(quote?.notes ?? null), [quote?.notes]);

  const [clientId, setClientId] = useState(quote?.client_id ?? "");
  const [status, setStatus] = useState<"Draft" | "Sent" | "Accepted" | "Rejected">(
    quote?.status ?? "Draft"
  );
  const [quoteDate, setQuoteDate] = useState(
    quote?.quote_date ?? new Date().toISOString().slice(0, 10)
  );
  const [validUntil, setValidUntil] = useState(quote?.valid_until ?? "");
  const [amount, setAmount] = useState(quote?.amount != null ? String(quote.amount) : "");
  const [subject, setSubject] = useState(quote?.subject ?? "");
  const [fields, setFields] = useState<StructuredQuoteFields>(
    parsed.fields ?? getEmptyStructuredQuoteFields()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof StructuredQuoteFields>(key: K, value: StructuredQuoteFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("Customer is required");
      return;
    }

    try {
      setSaving(true);

      const url = isEdit ? `/api/quotes/${quote?.id}/update` : `/api/quotes/create`;
      const notes = buildQuoteNotes(fields);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    <form onSubmit={onSubmit} style={pageCardStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>{isEdit ? "Edit quote" : "New quote"}</h1>
          <p style={subtitleStyle}>
            Fill the quote once and the PDF will use the same structure, pricing area and legal terms each time.
          </p>
        </div>
        <div style={pillStyle}>Legal terms added automatically</div>
      </div>

      {error ? <div style={errorBoxStyle}>{error}</div> : null}

      {!parsed.isStructured && parsed.rawNotes ? (
        <div style={infoBoxStyle}>
          This quote was using the old notes-only format. The old text has been carried into
          <strong> Additional quote notes</strong> so you can tidy it up and save it in the new layout.
        </div>
      ) : null}

      <SectionCard
        title="1. Basic quote details"
        description="Core details shown on the quote list, detail page and PDF header."
      >
        <div style={compactGridStyle}>
          <Field label="Customer">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={inputStyle}>
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
              onChange={(e) => setStatus(e.target.value as "Draft" | "Sent" | "Accepted" | "Rejected")}
              style={inputStyle}
            >
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Accepted">Accepted</option>
              <option value="Rejected">Rejected</option>
            </select>
          </Field>

          <Field label="Quote date">
            <input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Valid until">
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={inputStyle} />
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

          <Field label="Subject / quote reference">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={inputStyle}
              placeholder="Updated quote for Trehafod Culvert"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="2. Contact and project setup"
        description="These fields feed the top half of the quote PDF."
      >
        <div style={compactGridStyle}>
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
              placeholder="07400 000000"
            />
          </Field>

          <Field label="Date & time of project">
            <textarea
              value={fields.projectDateTime}
              onChange={(e) => updateField("projectDateTime", e.target.value)}
              rows={3}
              style={textareaShortStyle}
              placeholder={"TBC, Minimum 2 day hire\nWeekday working"}
            />
          </Field>

          <Field label="Site location">
            <textarea
              value={fields.siteLocation}
              onChange={(e) => updateField("siteLocation", e.target.value)}
              rows={3}
              style={textareaShortStyle}
              placeholder="Trehafod Culvert – Updated Quote"
            />
          </Field>

          <Field label="Hire type">
            <textarea
              value={fields.hireType}
              onChange={(e) => updateField("hireType", e.target.value)}
              rows={3}
              style={textareaShortStyle}
              placeholder="Contract lift (subject to CPA contract lift term and conditions)"
            />
          </Field>

          <Field label="Location">
            <textarea
              value={fields.workLocation}
              onChange={(e) => updateField("workLocation", e.target.value)}
              rows={3}
              style={textareaShortStyle}
              placeholder="Actual working location / site address"
            />
          </Field>

          <Field label="Date(s)">
            <textarea
              value={fields.workDates}
              onChange={(e) => updateField("workDates", e.target.value)}
              rows={3}
              style={textareaShortStyle}
              placeholder="Week commencing 20th April 2026"
            />
          </Field>

          <Field label="Duration">
            <textarea
              value={fields.duration}
              onChange={(e) => updateField("duration", e.target.value)}
              rows={3}
              style={textareaShortStyle}
              placeholder="Minimum 2 day hire"
            />
          </Field>

          <Field label="Working pattern">
            <textarea
              value={fields.workingHours}
              onChange={(e) => updateField("workingHours", e.target.value)}
              rows={3}
              style={textareaShortStyle}
              placeholder={"8 hours per day (including a 30-minute break)\nWeekday working"}
            />
          </Field>

          <Field label="Cost summary shown near the top">
            <textarea
              value={fields.costSummary}
              onChange={(e) => updateField("costSummary", e.target.value)}
              rows={3}
              style={textareaShortStyle}
              placeholder="£7,500.00 per day + VAT"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="3. Main quote wording"
        description="These are the big text sections the customer reads first."
      >
        <div style={stackStyle}>
          <Field label="To supply">
            <textarea
              value={fields.toSupply}
              onChange={(e) => updateField("toSupply", e.target.value)}
              rows={4}
              style={textareaStyle}
              placeholder="What is being supplied"
            />
          </Field>

          <Field label="Scope of work">
            <textarea
              value={fields.scopeOfWork}
              onChange={(e) => updateField("scopeOfWork", e.target.value)}
              rows={6}
              style={textareaStyle}
              placeholder="Full description of the works"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="4. Rates and extras"
        description="Use one row per line for the breakdown."
      >
        <div style={stackStyle}>
          <Field label="Breakdown of current charges / rates">
            <textarea
              value={fields.breakdown}
              onChange={(e) => updateField("breakdown", e.target.value)}
              rows={7}
              style={textareaStyle}
              placeholder={"Use one line per row in this format:\nQty | Description | Rate\n\nExample:\n1x | Cancelled contract lift, Wednesday 8th April – same day cancellation | £2,500.00 Excluding VAT"}
            />
          </Field>

          <div style={twoColStyle}>
            <Field label="Additional equipment & personnel">
              <textarea
                value={fields.additionalEquipment}
                onChange={(e) => updateField("additionalEquipment", e.target.value)}
                rows={6}
                style={textareaStyle}
                placeholder={"One item per line\nAdditional crane mats\nAP / Lifting Supervisor"}
              />
            </Field>

            <Field label="Included under full CPA terms">
              <textarea
                value={fields.includedItems}
                onChange={(e) => updateField("includedItems", e.target.value)}
                rows={6}
                style={textareaStyle}
                placeholder={"One item per line\nAll lifting accessories and rigging\nPlanning and supervision to meet full CPA obligations"}
              />
            </Field>
          </div>

          <div style={twoColStyle}>
            <Field label="Additional quote notes">
              <textarea
                value={fields.additionalNotes}
                onChange={(e) => updateField("additionalNotes", e.target.value)}
                rows={5}
                style={textareaStyle}
                placeholder="Extra wording to appear before the fixed legal terms"
              />
            </Field>

            <Field label="Payment terms">
              <input
                value={fields.paymentTerms}
                onChange={(e) => updateField("paymentTerms", e.target.value)}
                style={inputStyle}
                placeholder={DEFAULT_PAYMENT_TERMS}
              />
            </Field>
          </div>
        </div>
      </SectionCard>

      <details style={detailsStyle}>
        <summary style={summaryStyle}>View the fixed legal wording included in every quote PDF</summary>
        <div style={legalGridStyle}>
          <div style={legalBoxStyle}>
            <div style={legalTitleStyle}>Short-form hire terms</div>
            <pre style={legalPreStyle}>{DEFAULT_HIRE_TERMS_TEXT}</pre>
          </div>
          <div style={legalBoxStyle}>
            <div style={legalTitleStyle}>Full CPA / contract lifting small print</div>
            <pre style={legalPreStyle}>{DEFAULT_CONTRACT_TERMS_TEXT}</pre>
          </div>
        </div>
      </details>

      <div style={buttonRowStyle}>
        <button type="submit" disabled={saving} style={primaryButtonStyle}>
          {saving ? "Saving..." : isEdit ? "Save quote" : "Create quote"}
        </button>
        <a href={isEdit ? `/quotes/${quote?.id}` : "/quotes"} style={secondaryButtonStyle}>
          Cancel
        </a>
      </div>
    </form>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section style={sectionCardStyle}>
      <div style={sectionHeaderStyle}>
        <div style={sectionTitleStyle}>{title}</div>
        <div style={sectionDescriptionStyle}>{description}</div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

const pageCardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.22)",
  padding: 18,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.45)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  display: "grid",
  gap: 16,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 34,
  lineHeight: 1.1,
};

const subtitleStyle: CSSProperties = {
  margin: "8px 0 0 0",
  color: "#475569",
  maxWidth: 760,
  lineHeight: 1.45,
};

const pillStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.6)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
  fontSize: 13,
};

const errorBoxStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(239, 68, 68, 0.12)",
  border: "1px solid rgba(239, 68, 68, 0.28)",
};

const infoBoxStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.58)",
  border: "1px solid rgba(0,0,0,0.08)",
  lineHeight: 1.45,
};

const sectionCardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 16,
  padding: 16,
  display: "grid",
  gap: 14,
};

const sectionHeaderStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
};

const sectionDescriptionStyle: CSSProperties = {
  color: "#475569",
  fontSize: 14,
};

const compactGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  alignItems: "start",
};

const twoColStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
  alignItems: "start",
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#1f2937",
};

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "10px 12px",
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#ffffff",
  fontSize: 14,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 120,
  resize: "vertical",
  lineHeight: 1.45,
  fontFamily: "inherit",
};

const textareaShortStyle: CSSProperties = {
  ...textareaStyle,
  minHeight: 94,
};

const detailsStyle: CSSProperties = {
  background: "rgba(255,255,255,0.5)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 16,
  padding: 14,
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 15,
};

const legalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const legalBoxStyle: CSSProperties = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  padding: 12,
  display: "grid",
  gap: 8,
};

const legalTitleStyle: CSSProperties = {
  fontWeight: 900,
  fontSize: 14,
};

const legalPreStyle: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
  fontSize: 12,
  lineHeight: 1.45,
  maxHeight: 260,
  overflow: "auto",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  padding: "11px 16px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "11px 16px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.5)",
  color: "#111827",
  fontWeight: 900,
  textDecoration: "none",
};
