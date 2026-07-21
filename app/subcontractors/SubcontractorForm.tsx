import type { CSSProperties } from "react";
import ServerSubmitButton from "../components/ServerSubmitButton";

type Subcontractor = {
  id?: string;
  full_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: string | null;
  status?: string | null;
  base_postcode?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  town_city?: string | null;
  county?: string | null;
  standard_day_rate?: number | string | null;
  standard_hourly_rate?: number | string | null;
  pay_basis?: string | null;
  subcontractor_payment_type?: string | null;
  payroll_notes?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  card_notes?: string | null;
  notes?: string | null;
  has_login?: boolean | null;
};

export default function SubcontractorForm({
  action,
  initial,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial?: Subcontractor | null;
  submitLabel: string;
}) {
  const init = initial ?? {};

  return (
    <form action={action} style={{ display: "grid", gap: 16 }}>
      {init.id ? <input type="hidden" name="id" value={init.id} /> : null}
      <input type="hidden" name="employment_type" value="subcontractor" />
      <input type="hidden" name="has_login" value="false" />

      <section style={sectionCard}>
        <h2 style={sectionTitle}>Basic details</h2>
        <div style={grid3}>
          <Field label="Full name" name="full_name" defaultValue={init.full_name ?? ""} required />
          <Field label="Company name" name="company_name" defaultValue={init.company_name ?? ""} />
          <Field label="Role / trade" name="role" defaultValue={init.role ?? ""} placeholder="e.g. Slinger / Mobile Crane Operator" />
          <Field label="Phone" name="phone" defaultValue={init.phone ?? ""} />
          <Field label="Email" name="email" defaultValue={init.email ?? ""} type="email" />
          <SelectField
            label="Status"
            name="status"
            defaultValue={String(init.status ?? "active")}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </div>
      </section>

      <section style={sectionCard}>
        <h2 style={sectionTitle}>Location</h2>
        <div style={grid3}>
          <Field label="Base postcode" name="base_postcode" defaultValue={init.base_postcode ?? ""} />
          <Field label="Address line 1" name="address_line_1" defaultValue={init.address_line_1 ?? ""} />
          <Field label="Address line 2" name="address_line_2" defaultValue={init.address_line_2 ?? ""} />
          <Field label="Town / city" name="town_city" defaultValue={init.town_city ?? ""} />
          <Field label="County" name="county" defaultValue={init.county ?? ""} />
        </div>
      </section>

      <section style={sectionCard}>
        <h2 style={sectionTitle}>Pay details</h2>
        <div style={grid3}>
          <SelectField
            label="Pay basis"
            name="pay_basis"
            defaultValue={String(init.pay_basis ?? "day_rate")}
            options={[
              { value: "day_rate", label: "Day rate" },
              { value: "hourly", label: "Hourly" },
              { value: "fixed", label: "Fixed" },
              { value: "other", label: "Other" },
            ]}
          />
          <Field label="Standard day rate" name="standard_day_rate" defaultValue={toMoney(init.standard_day_rate)} type="number" step="0.01" />
          <Field label="Standard hourly rate" name="standard_hourly_rate" defaultValue={toMoney(init.standard_hourly_rate)} type="number" step="0.01" />
          <SelectField
            label="How paid"
            name="subcontractor_payment_type"
            defaultValue={String(init.subcontractor_payment_type ?? "")}
            options={[
              { value: "", label: "Select payment type" },
              { value: "limited_company_invoice", label: "Limited company - invoice" },
              { value: "sole_trader_invoice", label: "Sole trader - invoice" },
              { value: "paye", label: "PAYE" },
              { value: "cis_20", label: "CIS 20%" },
              { value: "cis_30", label: "CIS 30%" },
              { value: "other", label: "Other / confirm with office" },
            ]}
          />
        </div>
        <TextAreaField label="Payroll notes" name="payroll_notes" defaultValue={init.payroll_notes ?? ""} rows={4} />
      </section>

      <section style={sectionCard}>
        <h2 style={sectionTitle}>Emergency contact and qualifications</h2>
        <div style={grid3}>
          <Field label="Emergency contact name" name="emergency_contact_name" defaultValue={init.emergency_contact_name ?? ""} />
          <Field label="Emergency contact phone" name="emergency_contact_phone" defaultValue={init.emergency_contact_phone ?? ""} />
        </div>
        <TextAreaField label="Card / certification notes" name="card_notes" defaultValue={init.card_notes ?? ""} rows={4} />
        <TextAreaField label="General notes" name="notes" defaultValue={init.notes ?? ""} rows={4} />
      </section>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <ServerSubmitButton style={primaryBtn} pendingText="Saving…">
          {submitLabel}
        </ServerSubmitButton>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          This is an office-created assignable subcontractor record. No CRM login is created.
        </div>
      </div>
    </form>
  );
}

function toMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  placeholder,
  step,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  step?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        type={type}
        required={required}
        placeholder={placeholder}
        step={step}
        style={inputStyle}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select name={name} defaultValue={defaultValue} style={inputStyle}>
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
  rows,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows: number;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea name={name} defaultValue={defaultValue} rows={rows} style={textareaStyle} />
    </div>
  );
}

const sectionCard: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.40)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  display: "grid",
  gap: 12,
};

const sectionTitle: CSSProperties = {
  margin: 0,
  fontSize: 22,
};

const grid3: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.78,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  resize: "vertical",
  minHeight: 110,
};

const primaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};
