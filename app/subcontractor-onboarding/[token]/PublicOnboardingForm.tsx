"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Qualification = {
  id: string;
  qualification_name: string;
  issuer: string;
  certificate_number: string;
  issue_date: string;
  expiry_date: string;
  notes: string;
};

type UploadedDocument = {
  id: string;
  category: string;
  original_filename: string;
  qualification_name?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  size_bytes?: number | null;
};

type FormDataShape = Record<string, any> & {
  qualifications: Qualification[];
  declaration_accepted: boolean;
};

const EMPTY_QUALIFICATION = (id = crypto.randomUUID()): Qualification => ({
  id,
  qualification_name: "",
  issuer: "",
  certificate_number: "",
  issue_date: "",
  expiry_date: "",
  notes: "",
});

export default function PublicOnboardingForm({
  token,
  initialData,
  initialDocuments,
  initialStatus,
  returnMessage,
}: {
  token: string;
  initialData: Record<string, any>;
  initialDocuments: UploadedDocument[];
  initialStatus: string;
  returnMessage?: string | null;
}) {
  const [data, setData] = useState<FormDataShape>({
    full_name: "",
    company_name: "",
    role: "",
    phone: "",
    email: "",
    base_postcode: "",
    address_line_1: "",
    address_line_2: "",
    town_city: "",
    county: "",
    business_type: "",
    company_registration_number: "",
    utr_number: "",
    vat_number: "",
    preferred_payment_type: "",
    national_insurance_number: "",
    right_to_work_confirmed: false,
    working_terms_accepted: false,
    bank_account_name: "",
    bank_sort_code: "",
    bank_account_number: "",
    insurance_provider: "",
    insurance_policy_number: "",
    insurance_cover_amount: "",
    insurance_expiry_date: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    notes: "",
    declaration_name: "",
    declaration_accepted: false,
    ...initialData,
    qualifications:
      Array.isArray(initialData?.qualifications) && initialData.qualifications.length
        ? initialData.qualifications
        : [EMPTY_QUALIFICATION("initial-qualification")],
  });
  const [documents, setDocuments] = useState<UploadedDocument[]>(initialDocuments || []);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<"save" | "submit" | "upload" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const editable = useMemo(
    () => ["invite_sent", "in_progress", "changes_required"].includes(status),
    [status]
  );

  function updateField(name: string, value: any) {
    setData((current) => ({ ...current, [name]: value }));
  }

  function updateQualification(id: string, name: keyof Qualification, value: string) {
    setData((current) => ({
      ...current,
      qualifications: current.qualifications.map((item) =>
        item.id === id ? { ...item, [name]: value } : item
      ),
    }));
  }

  function addQualification() {
    setData((current) => ({
      ...current,
      qualifications: [...current.qualifications, EMPTY_QUALIFICATION()],
    }));
  }

  function removeQualification(id: string) {
    setData((current) => ({
      ...current,
      qualifications:
        current.qualifications.length > 1
          ? current.qualifications.filter((item) => item.id !== id)
          : [EMPTY_QUALIFICATION()],
    }));
  }

  async function save(action: "save" | "submit") {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/subcontractor-onboarding/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Could not save the form.");
      setStatus(result.status);
      setMessage(result.message || (action === "submit" ? "Submitted." : "Progress saved."));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught: any) {
      setError(caught?.message || "Could not save the form.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy("");
    }
  }

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file") as File | null;
    if (!file || file.size < 1) {
      setError("Choose a document to upload.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("The maximum file size is 5 MB.");
      return;
    }

    setBusy("upload");
    setError("");
    setMessage("");

    try {
      const signResponse = await fetch(
        `/api/subcontractor-onboarding/${encodeURIComponent(token)}/documents/sign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
          }),
        }
      );
      const signed = await signResponse.json();
      if (!signResponse.ok) throw new Error(signed?.error || "Could not prepare the upload.");

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error("Secure upload is not configured.");

      const browserClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: uploadError } = await browserClient.storage
        .from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType: file.type,
        });
      if (uploadError) throw uploadError;

      const completeResponse = await fetch(
        `/api/subcontractor-onboarding/${encodeURIComponent(token)}/documents/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upload_intent_id: signed.upload_intent_id,
            path: signed.path,
            category: String(formData.get("category") || "other"),
            original_filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            qualification_name: String(formData.get("qualification_name") || ""),
            issue_date: String(formData.get("issue_date") || ""),
            expiry_date: String(formData.get("expiry_date") || ""),
          }),
        }
      );
      const complete = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(complete?.error || "Could not record the document.");

      setDocuments((current) => [complete.document, ...current]);
      form.reset();
      setMessage("Document uploaded.");
    } catch (caught: any) {
      setError(caught?.message || "Could not upload the document.");
    } finally {
      setBusy("");
    }
  }

  async function removeDocument(documentId: string) {
    if (!confirm("Remove this uploaded document?")) return;
    setError("");
    try {
      const response = await fetch(
        `/api/subcontractor-onboarding/${encodeURIComponent(token)}/documents/${encodeURIComponent(documentId)}`,
        { method: "DELETE" }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Could not remove the document.");
      setDocuments((current) => current.filter((item) => item.id !== documentId));
      setMessage("Document removed.");
    } catch (caught: any) {
      setError(caught?.message || "Could not remove the document.");
    }
  }

  if (!editable) {
    return (
      <div className="locked-card">
        <h2>{status === "approved" ? "Onboarding approved" : "Submitted for review"}</h2>
        <p>
          {status === "approved"
            ? "Your subcontractor record has been approved by AnnS Crane Hire."
            : "Your information has been submitted and is now locked while the office reviews it."}
        </p>
        <style jsx>{styles}</style>
      </div>
    );
  }

  return (
    <div className="form-wrap">
      {returnMessage ? (
        <div className="changes-box">
          <strong>Changes requested by AnnS Crane Hire</strong>
          <div>{returnMessage}</div>
        </div>
      ) : null}
      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <Section title="Your details">
        <div className="grid three">
          <Field label="Full name *" value={data.full_name} onChange={(v) => updateField("full_name", v)} />
          <Field label="Company / trading name" value={data.company_name} onChange={(v) => updateField("company_name", v)} />
          <Field label="Role / trade *" value={data.role} onChange={(v) => updateField("role", v)} placeholder="e.g. Slinger / Mobile Crane Operator" />
          <Field label="Mobile number *" value={data.phone} onChange={(v) => updateField("phone", v)} type="tel" />
          <Field label="Email address *" value={data.email} onChange={(v) => updateField("email", v)} type="email" />
          <Field label="National Insurance number *" value={data.national_insurance_number} onChange={(v) => updateField("national_insurance_number", v.toUpperCase())} placeholder="e.g. AB 12 34 56 C" />
        </div>
      </Section>

      <Section title="Right to work">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={Boolean(data.right_to_work_confirmed)}
            onChange={(event) => updateField("right_to_work_confirmed", event.target.checked)}
          />
          <span>I confirm that I have the legal right to work in the United Kingdom *</span>
        </label>
      </Section>

      <Section title="Home / business address">
        <div className="grid three">
          <Field label="Address line 1 *" value={data.address_line_1} onChange={(v) => updateField("address_line_1", v)} />
          <Field label="Address line 2" value={data.address_line_2} onChange={(v) => updateField("address_line_2", v)} />
          <Field label="Town / city *" value={data.town_city} onChange={(v) => updateField("town_city", v)} />
          <Field label="County" value={data.county} onChange={(v) => updateField("county", v)} />
          <Field label="Postcode *" value={data.base_postcode} onChange={(v) => updateField("base_postcode", v)} />
        </div>
      </Section>

      <Section title="Business, tax and payment details">
        <div className="grid three">
          <SelectField
            label="How do you trade? *"
            value={data.business_type}
            onChange={(v) => {
              updateField("business_type", v);
              if (v === "limited_company") updateField("preferred_payment_type", "limited_company_invoice");
              if (v === "sole_trader") updateField("preferred_payment_type", "sole_trader_invoice");
              if (v === "paye_cis") updateField("preferred_payment_type", "");
            }}
            options={[
              ["", "Select how you trade"],
              ["limited_company", "Limited company"],
              ["sole_trader", "Sole trader"],
              ["paye_cis", "PAYE / CIS subcontractor"],
              ["partnership", "Partnership"],
              ["other", "Other"],
            ]}
          />

          <SelectField
            label="How will you be paid? *"
            value={data.preferred_payment_type}
            onChange={(v) => updateField("preferred_payment_type", v)}
            options={[
              ["", "Select payment method"],
              ["limited_company_invoice", "Limited company - invoice"],
              ["sole_trader_invoice", "Sole trader - invoice"],
              ["paye", "PAYE"],
              ["cis_20", "CIS - 20% deduction"],
              ["cis_30", "CIS - 30% deduction"],
              ["other", "Other / confirm with office"],
            ]}
          />

          {data.business_type === "limited_company" ? (
            <Field
              label="Company registration number *"
              value={data.company_registration_number}
              onChange={(v) => updateField("company_registration_number", v)}
            />
          ) : null}

          {data.business_type === "limited_company" ||
          data.business_type === "sole_trader" ||
          data.business_type === "paye_cis" ||
          data.preferred_payment_type === "cis_20" ||
          data.preferred_payment_type === "cis_30" ? (
            <Field label="UTR number *" value={data.utr_number} onChange={(v) => updateField("utr_number", v)} />
          ) : null}

          {data.business_type === "limited_company" ||
          data.business_type === "sole_trader" ||
          data.business_type === "partnership" ? (
            <Field label="VAT number (if registered)" value={data.vat_number} onChange={(v) => updateField("vat_number", v)} />
          ) : null}
        </div>
        <p className="help">
          Limited companies and sole traders are paid against a valid invoice and completed, signed timesheet. Payment is made every other Friday in line with AnnS Crane Hire&apos;s payment cycle.
        </p>
      </Section>

      <Section title="Bank details">
        <div className="privacy-note">These details are stored securely and are visible only to authorised office users.</div>
        <div className="grid three">
          <Field label="Account name *" value={data.bank_account_name} onChange={(v) => updateField("bank_account_name", v)} autoComplete="name" />
          <Field label="Sort code *" value={data.bank_sort_code} onChange={(v) => updateField("bank_sort_code", v)} placeholder="00-00-00" inputMode="numeric" />
          <Field label="Account number *" value={data.bank_account_number} onChange={(v) => updateField("bank_account_number", v)} inputMode="numeric" />
        </div>
      </Section>

      <Section title="Insurance">
        <div className="grid three">
          <Field label="Insurance provider" value={data.insurance_provider} onChange={(v) => updateField("insurance_provider", v)} />
          <Field label="Policy number" value={data.insurance_policy_number} onChange={(v) => updateField("insurance_policy_number", v)} />
          <Field label="Cover amount" value={data.insurance_cover_amount} onChange={(v) => updateField("insurance_cover_amount", v)} placeholder="e.g. £5 million" />
          <Field label="Insurance expiry date" value={data.insurance_expiry_date} onChange={(v) => updateField("insurance_expiry_date", v)} type="date" />
        </div>
      </Section>

      <Section title="Qualifications and cards">
        <p className="help">Add each relevant licence, card or qualification. You can upload supporting documents below.</p>
        <div className="qualification-list">
          {data.qualifications.map((qualification, index) => (
            <div className="qualification-card" key={qualification.id}>
              <div className="qualification-heading">
                <strong>Qualification {index + 1}</strong>
                <button type="button" className="link-button danger" onClick={() => removeQualification(qualification.id)}>Remove</button>
              </div>
              <div className="grid three">
                <Field label="Qualification / card name" value={qualification.qualification_name} onChange={(v) => updateQualification(qualification.id, "qualification_name", v)} placeholder="e.g. CPCS A40 Slinger Signaller" />
                <Field label="Issuer" value={qualification.issuer} onChange={(v) => updateQualification(qualification.id, "issuer", v)} placeholder="e.g. CPCS / NPORS" />
                <Field label="Certificate / card number" value={qualification.certificate_number} onChange={(v) => updateQualification(qualification.id, "certificate_number", v)} />
                <Field label="Issue date" value={qualification.issue_date} onChange={(v) => updateQualification(qualification.id, "issue_date", v)} type="date" />
                <Field label="Expiry date" value={qualification.expiry_date} onChange={(v) => updateQualification(qualification.id, "expiry_date", v)} type="date" />
                <Field label="Notes / categories" value={qualification.notes} onChange={(v) => updateQualification(qualification.id, "notes", v)} />
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="secondary-button" onClick={addQualification}>+ Add another qualification</button>
      </Section>

      <Section title="Upload documents">
        <p className="help">Accepted formats: PDF, JPG, PNG or WEBP. Maximum 5 MB per file, 12 documents and 40 MB total.</p>
        <form onSubmit={uploadDocument} className="upload-form">
          <div className="grid three">
            <SelectFieldUncontrolled
              label="Document type"
              name="category"
              options={[
                ["driving_licence", "Driving licence / photo ID"],
                ["qualification", "Qualification / CPCS / NPORS card"],
                ["insurance", "Insurance certificate"],
                ["company_document", "Company / tax document"],
                ["other", "Other"],
              ]}
            />
            <UncontrolledField label="Qualification name (where relevant)" name="qualification_name" />
            <UncontrolledField label="Issue date" name="issue_date" type="date" />
            <UncontrolledField label="Expiry date" name="expiry_date" type="date" />
            <div className="field file-field">
              <label>Choose document *</label>
              <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
            </div>
          </div>
          <button className="secondary-button" type="submit" disabled={busy === "upload"}>
            {busy === "upload" ? "Uploading…" : "Upload document"}
          </button>
        </form>

        <div className="document-list">
          {documents.length === 0 ? <div className="empty">No documents uploaded yet.</div> : null}
          {documents.map((document) => (
            <div className="document-row" key={document.id}>
              <div>
                <strong>{document.original_filename}</strong>
                <div className="document-meta">
                  {document.category.replace(/_/g, " ")}
                  {document.qualification_name ? ` • ${document.qualification_name}` : ""}
                  {document.expiry_date ? ` • Expires ${document.expiry_date}` : ""}
                </div>
              </div>
              <button type="button" className="link-button danger" onClick={() => removeDocument(document.id)}>Remove</button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Emergency contact and additional information">
        <div className="grid three">
          <Field label="Emergency contact name *" value={data.emergency_contact_name} onChange={(v) => updateField("emergency_contact_name", v)} />
          <Field label="Emergency contact phone *" value={data.emergency_contact_phone} onChange={(v) => updateField("emergency_contact_phone", v)} type="tel" />
        </div>
        <div className="field textarea-field">
          <label>Anything else AnnS should know</label>
          <textarea value={data.notes} onChange={(event) => updateField("notes", event.target.value)} rows={5} />
        </div>
      </Section>

      <Section title="Declaration">
        <div className="declaration-text">
          I confirm that the information and documents supplied are accurate and complete. I understand that AnnS Crane Hire may verify the information and that approval is required before I can be assigned to work.
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={Boolean(data.working_terms_accepted)}
            onChange={(event) => updateField("working_terms_accepted", event.target.checked)}
          />
          <span>I accept AnnS Crane Hire&apos;s working, timesheet and payment terms *</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={Boolean(data.declaration_accepted)} onChange={(event) => updateField("declaration_accepted", event.target.checked)} />
          <span>I agree to the declaration above *</span>
        </label>
        <div className="grid two">
          <Field label="Type your full name as your signature *" value={data.declaration_name} onChange={(v) => updateField("declaration_name", v)} />
          <div className="signature-note">Your submission date and time will be recorded when you press Submit for review.</div>
        </div>
      </Section>

      <div className="sticky-actions">
        <button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => save("save")}>
          {busy === "save" ? "Saving…" : "Save and continue later"}
        </button>
        <button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => save("submit")}>
          {busy === "submit" ? "Submitting…" : "Submit for review"}
        </button>
      </div>
      <style jsx>{styles}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section-card">
      <h2>{title}</h2>
      {children}
      <style jsx>{styles}</style>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
}: {
  label: string;
  value: any;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        step={type === "number" ? "0.01" : undefined}
      />
      <style jsx>{styles}</style>
    </div>
  );
}

function UncontrolledField({ label, name, type = "text" }: { label: string; name: string; type?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input name={name} type={type} />
      <style jsx>{styles}</style>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
      <style jsx>{styles}</style>
    </div>
  );
}

function SelectFieldUncontrolled({ label, name, options }: { label: string; name: string; options: string[][] }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select name={name}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .form-wrap { display:grid; gap:16px; }
  .section-card, .locked-card { background:#fff; border:1px solid #dbe3ee; border-radius:16px; padding:20px; box-shadow:0 10px 28px rgba(15,23,42,.06); }
  .section-card h2, .locked-card h2 { margin:0 0 14px; font-size:22px; color:#111827; }
  .grid { display:grid; gap:12px; }
  .grid.three { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .grid.two { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .field { display:grid; gap:6px; min-width:0; }
  .field label { font-size:12px; font-weight:800; color:#475569; }
  .field input, .field select, .textarea-field textarea { width:100%; box-sizing:border-box; min-height:44px; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px; background:#fff; font:inherit; color:#0f172a; }
  .field input:focus, .field select:focus, .textarea-field textarea:focus { outline:3px solid rgba(37,99,235,.14); border-color:#2563eb; }
  .textarea-field { margin-top:12px; }
  .textarea-field textarea { resize:vertical; min-height:120px; }
  .help, .document-meta, .signature-note { color:#64748b; font-size:13px; line-height:1.45; }
  .privacy-note, .declaration-text { background:#f8fafc; border:1px solid #e2e8f0; padding:12px; border-radius:10px; color:#334155; margin-bottom:12px; line-height:1.5; }
  .qualification-list, .document-list { display:grid; gap:10px; margin:12px 0; }
  .qualification-card { border:1px solid #e2e8f0; border-radius:12px; padding:14px; background:#f8fafc; }
  .qualification-heading, .document-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  .document-row { border:1px solid #e2e8f0; border-radius:10px; padding:12px; background:#f8fafc; }
  .link-button { border:0; background:transparent; font-weight:800; cursor:pointer; padding:4px; }
  .link-button.danger { color:#b91c1c; }
  .primary-button, .secondary-button { min-height:44px; border-radius:10px; padding:10px 16px; font-weight:900; cursor:pointer; border:1px solid #111827; }
  .primary-button { background:#111827; color:#fff; }
  .secondary-button { background:#fff; color:#111827; }
  .primary-button:disabled, .secondary-button:disabled { opacity:.55; cursor:not-allowed; }
  .upload-form { display:grid; gap:12px; }
  .file-field input { padding:8px; }
  .checkbox-row { display:flex; align-items:flex-start; gap:10px; font-weight:700; margin:14px 0; }
  .checkbox-row input { width:20px; height:20px; margin:0; }
  .sticky-actions { position:sticky; bottom:10px; z-index:5; display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; background:rgba(241,245,249,.94); border:1px solid #cbd5e1; backdrop-filter:blur(8px); padding:12px; border-radius:14px; box-shadow:0 10px 30px rgba(15,23,42,.14); }
  .success-box, .error-box, .changes-box { padding:13px 15px; border-radius:12px; font-weight:700; line-height:1.45; }
  .success-box { background:#dcfce7; color:#166534; border:1px solid #86efac; }
  .error-box { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }
  .changes-box { background:#fef3c7; color:#854d0e; border:1px solid #fcd34d; display:grid; gap:5px; }
  .empty { color:#64748b; padding:8px 0; }
  @media (max-width:850px) { .grid.three, .grid.two { grid-template-columns:1fr; } .section-card { padding:15px; } .sticky-actions { position:static; } .sticky-actions button { width:100%; } }
`;
