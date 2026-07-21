"use client";

import { useState } from "react";

type AppSettings = {
  id?: string;
  business_name?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  vat_number?: string | null;
  company_number?: string | null;

  invoice_prefix?: string | null;
  invoice_next_number?: number | null;
  payment_terms_days?: number | null;
  bank_name?: string | null;
  bank_sort_code?: string | null;
  bank_account_number?: string | null;
  bank_iban?: string | null;
  bank_swift?: string | null;
  invoice_footer?: string | null;

  allow_staff_create_bookings?: boolean | null;
  allow_staff_create_customers?: boolean | null;
  allow_staff_view_invoices?: boolean | null;
};

export default function SettingsForm({
  settings,
}: {
  settings: AppSettings | null;
}) {
  const [businessName, setBusinessName] = useState(settings?.business_name ?? "ANNS CRANE HIRE LTD");
  const [businessAddress, setBusinessAddress] = useState(
    settings?.business_address ?? "6 Bay Street\nSwansea, SA1 8LB\nUnited Kingdom"
  );
  const [businessPhone, setBusinessPhone] = useState(settings?.business_phone ?? "01792 641 653");
  const [businessEmail, setBusinessEmail] = useState(settings?.business_email ?? "info@annscranehire.co.uk");
  const [vatNumber, setVatNumber] = useState(settings?.vat_number ?? "GB 475188652");
  const [companyNumber, setCompanyNumber] = useState(settings?.company_number ?? "15895379");

  const [invoicePrefix, setInvoicePrefix] = useState(settings?.invoice_prefix ?? "SI");
  const [invoiceNextNumber, setInvoiceNextNumber] = useState(
    settings?.invoice_next_number != null ? String(settings.invoice_next_number) : "1"
  );
  const [paymentTermsDays, setPaymentTermsDays] = useState(
    settings?.payment_terms_days != null ? String(settings.payment_terms_days) : "30"
  );
  const [bankName, setBankName] = useState(settings?.bank_name ?? "Ultimate Finance Ltd");
  const [bankSortCode, setBankSortCode] = useState(settings?.bank_sort_code ?? "30-15-99");
  const [bankAccountNumber, setBankAccountNumber] = useState(settings?.bank_account_number ?? "13622760");
  const [bankIban, setBankIban] = useState(settings?.bank_iban ?? "GB87 LOYD 3015 9913 6227 60");
  const [bankSwift, setBankSwift] = useState(settings?.bank_swift ?? "LOYDGB21021");
  const [invoiceFooter, setInvoiceFooter] = useState(
    settings?.invoice_footer ??
      "We reserve the right to charge interest on late paid invoices at the rate of 8% above bank base rates under the Late Payment of Commercial Debts (Interest) Act 1998.\nQueries raised more than 7 days after the invoice date will not be considered."
  );

  const [allowStaffCreateBookings, setAllowStaffCreateBookings] = useState(
    settings?.allow_staff_create_bookings ?? true
  );
  const [allowStaffCreateCustomers, setAllowStaffCreateCustomers] = useState(
    settings?.allow_staff_create_customers ?? true
  );
  const [allowStaffViewInvoices, setAllowStaffViewInvoices] = useState(
    settings?.allow_staff_view_invoices ?? true
  );

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);

    try {
      const payload = {
        business_name: businessName.trim() || null,
        business_address: businessAddress.trim() || null,
        business_phone: businessPhone.trim() || null,
        business_email: businessEmail.trim() || null,
        vat_number: vatNumber.trim() || null,
        company_number: companyNumber.trim() || null,

        invoice_prefix: invoicePrefix.trim() || "SI",
        invoice_next_number: Math.max(1, Number(invoiceNextNumber || 1)),
        payment_terms_days: Number(paymentTermsDays || 30),
        bank_name: bankName.trim() || null,
        bank_sort_code: bankSortCode.trim() || null,
        bank_account_number: bankAccountNumber.trim() || null,
        bank_iban: bankIban.trim() || null,
        bank_swift: bankSwift.trim() || null,
        invoice_footer: invoiceFooter.trim() || null,

        allow_staff_create_bookings: allowStaffCreateBookings,
        allow_staff_create_customers: allowStaffCreateCustomers,
        allow_staff_view_invoices: allowStaffViewInvoices,
      };

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || "Could not save settings.");
        return;
      }

      setMsg("Settings saved.");
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={card}>
      {msg && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: msg === "Settings saved."
              ? "rgba(0,180,120,0.10)"
              : "rgba(255,0,0,0.10)",
            border: msg === "Settings saved."
              ? "1px solid rgba(0,180,120,0.25)"
              : "1px solid rgba(255,0,0,0.25)",
          }}
        >
          {msg}
        </div>
      )}

      <Section title="Business Settings">
        <div style={grid12}>
          <Field span={6} label="Business name">
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={input} />
          </Field>

          <Field span={3} label="Phone">
            <input value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} style={input} />
          </Field>

          <Field span={3} label="Business email">
            <input value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} style={input} />
          </Field>

          <Field span={6} label="Business address">
            <textarea value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} style={textarea} />
          </Field>

          <Field span={3} label="VAT number">
            <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} style={input} />
          </Field>

          <Field span={3} label="Company number">
            <input value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} style={input} />
          </Field>
        </div>
      </Section>

      <Section title="Invoice Settings">
        <div style={grid12}>
          <Field span={3} label="Invoice prefix">
            <input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} style={input} />
          </Field>

          <Field span={3} label="Next invoice number">
            <input value={invoiceNextNumber} onChange={(e) => setInvoiceNextNumber(e.target.value)} style={input} />
          </Field>

          <Field span={3} label="Payment terms (days)">
            <input value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} style={input} />
          </Field>

          <Field span={3} label="Bank name">
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} style={input} />
          </Field>

          <Field span={3} label="Sort code">
            <input value={bankSortCode} onChange={(e) => setBankSortCode(e.target.value)} style={input} />
          </Field>

          <Field span={3} label="Account number">
            <input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} style={input} />
          </Field>

          <Field span={3} label="IBAN">
            <input value={bankIban} onChange={(e) => setBankIban(e.target.value)} style={input} />
          </Field>

          <Field span={3} label="SWIFT">
            <input value={bankSwift} onChange={(e) => setBankSwift(e.target.value)} style={input} />
          </Field>

          <Field span={12} label="Invoice footer">
            <textarea value={invoiceFooter} onChange={(e) => setInvoiceFooter(e.target.value)} style={textarea} />
          </Field>
        </div>
      </Section>

      <Section title="System Settings">
        <div style={{ display: "grid", gap: 12 }}>
          <CheckRow
            label="Allow staff to create bookings"
            checked={allowStaffCreateBookings}
            onChange={setAllowStaffCreateBookings}
          />
          <CheckRow
            label="Allow staff to create customers"
            checked={allowStaffCreateCustomers}
            onChange={setAllowStaffCreateCustomers}
          />
          <CheckRow
            label="Allow staff to view invoices"
            checked={allowStaffViewInvoices}
            onChange={setAllowStaffViewInvoices}
          />
        </div>
      </Section>

      <div style={{ marginTop: 18 }}>
        <button type="submit" disabled={saving} style={primaryBtn}>
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={sectionStyle}>
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span: number;
}) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.35)",
        border: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span style={{ fontWeight: 800 }}>{label}</span>
    </label>
  );
}

const card: React.CSSProperties = {
  display: "grid",
  gap: 16,
};

const sectionStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const grid12: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const input: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
};

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 120,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
  resize: "vertical",
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "white",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};
