import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import ClientShell from "../../../../ClientShell";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  DEFAULT_PAYMENT_TERMS,
  parseQuoteNotes,
  splitLines,
} from "../../../quoteTemplate";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB");
}

function fmtLongDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function splitCollectionDelivery(locationValue: string) {
  const cleaned = locationValue.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return { collection: "", delivery: "" };

  const fromToMatch = cleaned.match(/^(.*?)\s+to\s+(.*)$/i);
  if (fromToMatch) {
    return {
      collection: fromToMatch[1]?.trim() || "",
      delivery: fromToMatch[2]?.trim() || "",
    };
  }

  return { collection: "", delivery: cleaned };
}

async function saveQuotePdfSections(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect("/quotes?error=Quote id missing.");
  }

  const keys = [
    "subject",
    "quoteDate",
    "validUntil",
    "clientCompany",
    "contactName",
    "contactPhone",
    "contactRole",
    "siteLocation",
    "projectDateTime",
    "hireType",
    "collection",
    "delivery",
    "workLocation",
    "workDates",
    "duration",
    "workingHours",
    "costSummary",
    "toSupply",
    "scopeOfWork",
    "breakdown",
    "additionalEquipment",
    "includedItems",
    "additionalNotes",
    "paymentTerms",
  ];

  const pdfSections: Record<string, string> = {};
  for (const key of keys) {
    pdfSections[key] = clean(formData.get(key));
  }

  const { error } = await supabase
    .from("quotes")
    .update({
      pdf_sections: pdfSections,
    })
    .eq("id", id);

  if (error) {
    redirect(`/quotes/${id}/print/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/quotes/${id}/print?pdf_edit=saved`);
}

async function resetQuotePdfSections(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect("/quotes?error=Quote id missing.");
  }

  const { error } = await supabase
    .from("quotes")
    .update({
      pdf_sections: {},
    })
    .eq("id", id);

  if (error) {
    redirect(`/quotes/${id}/print/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/quotes/${id}/print?pdf_edit=reset`);
}

export default async function QuotePdfEditorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: quote, error } = await supabase
    .from("quotes")
    .select(`
      *,
      clients:client_id (
        company_name,
        contact_name,
        phone,
        address
      )
    `)
    .eq("id", params.id)
    .single();

  const client = Array.isArray((quote as any)?.clients)
    ? (quote as any).clients[0]
    : (quote as any)?.clients;

  const parsed = parseQuoteNotes((quote as any)?.notes ?? null);
  const rawPdfSections = (quote as any)?.pdf_sections;
  const pdfSections =
    rawPdfSections && typeof rawPdfSections === "object" && !Array.isArray(rawPdfSections)
      ? (rawPdfSections as Record<string, unknown>)
      : {};

  const fromPdf = (key: string, fallback: string | null | undefined = "") => {
    const value = pdfSections[key];
    return typeof value === "string" ? value : String(fallback ?? "");
  };

  const locationSplit = splitCollectionDelivery(parsed.fields.workLocation || "");
  const contactRoleLine =
    splitLines(parsed.fields.additionalNotes).find((line) =>
      line.toLowerCase().startsWith("contact role:")
    ) ?? "";

  const contactRole = contactRoleLine.replace(/^contact role:\s*/i, "").trim();

  const errorMessage = searchParams?.error || error?.message || "";

  return (
    <ClientShell>
      <div style={pageWrapStyle}>
        <div style={topRowStyle}>
          <div>
            <h1 style={titleStyle}>Quote PDF editor</h1>
            <div style={subTitleStyle}>
              Edit the customer-facing wording used on the printable quote/PDF only.
            </div>
          </div>

          <div style={buttonRowStyle}>
            <a href={`/quotes/${params.id}`} style={secondaryBtnStyle}>
              Back to quote
            </a>
            <a href={`/quotes/${params.id}/print`} target="_blank" style={secondaryBtnStyle}>
              View PDF page
            </a>
          </div>
        </div>

        {errorMessage ? <div style={errorBoxStyle}>{errorMessage}</div> : null}

        {!quote ? (
          <div style={errorBoxStyle}>Quote not found.</div>
        ) : (
          <form action={saveQuotePdfSections} style={formStyle}>
            <input type="hidden" name="id" value={params.id} />

            <Section title="1. Header and customer">
              <div style={twoColStyle}>
                <Field label="Quote heading / reference" name="subject" defaultValue={fromPdf("subject", (quote as any)?.subject || "")} />
                <Field label="Quote date shown on PDF" name="quoteDate" defaultValue={fromPdf("quoteDate", fmtLongDate((quote as any)?.quote_date))} />
                <Field label="Valid until shown on PDF" name="validUntil" defaultValue={fromPdf("validUntil", fmtDate((quote as any)?.valid_until))} />
                <Field label="Client company" name="clientCompany" defaultValue={fromPdf("clientCompany", client?.company_name || "")} />
                <Field label="Contact name" name="contactName" defaultValue={fromPdf("contactName", parsed.fields.contactName || client?.contact_name || "")} />
                <Field label="Contact phone" name="contactPhone" defaultValue={fromPdf("contactPhone", parsed.fields.contactPhone || client?.phone || "")} />
                <Field label="Contact role" name="contactRole" defaultValue={fromPdf("contactRole", contactRole)} />
                <Field label="Site location" name="siteLocation" defaultValue={fromPdf("siteLocation", parsed.fields.siteLocation || client?.address || "")} rows={3} />
              </div>
            </Section>

            <Section title="2. Job details">
              <div style={twoColStyle}>
                <Field label="Date & time of project" name="projectDateTime" defaultValue={fromPdf("projectDateTime", parsed.fields.projectDateTime)} rows={3} />
                <Field label="Hire type" name="hireType" defaultValue={fromPdf("hireType", parsed.fields.hireType)} rows={3} />
                <Field label="Collection" name="collection" defaultValue={fromPdf("collection", locationSplit.collection)} rows={3} />
                <Field label="Delivery" name="delivery" defaultValue={fromPdf("delivery", locationSplit.delivery)} rows={3} />
                <Field label="Location fallback" name="workLocation" defaultValue={fromPdf("workLocation", parsed.fields.workLocation)} rows={3} />
                <Field label="Date(s)" name="workDates" defaultValue={fromPdf("workDates", parsed.fields.workDates)} rows={3} />
                <Field label="Duration" name="duration" defaultValue={fromPdf("duration", parsed.fields.duration)} rows={3} />
                <Field label="Working pattern" name="workingHours" defaultValue={fromPdf("workingHours", parsed.fields.workingHours)} rows={3} />
                <Field label="Amount / cost summary" name="costSummary" defaultValue={fromPdf("costSummary", parsed.fields.costSummary)} rows={3} />
              </div>
            </Section>

            <Section title="3. Main wording">
              <Field label="To Supply" name="toSupply" defaultValue={fromPdf("toSupply", parsed.fields.toSupply)} rows={5} />
              <Field label="Scope of Work" name="scopeOfWork" defaultValue={fromPdf("scopeOfWork", parsed.fields.scopeOfWork)} rows={7} />
            </Section>

            <Section title="4. Cost breakdown and extras">
              <Field
                label="Breakdown of current charges / rates"
                name="breakdown"
                defaultValue={fromPdf("breakdown", parsed.fields.breakdown)}
                rows={8}
                hint="Best format: Qty | Description | Rate. Two-column format Description | Rate also works and prints the rate in the rate column."
              />
              <div style={twoColStyle}>
                <Field label="Additional equipment & personnel" name="additionalEquipment" defaultValue={fromPdf("additionalEquipment", parsed.fields.additionalEquipment)} rows={6} />
                <Field label="Included under full CPA terms" name="includedItems" defaultValue={fromPdf("includedItems", parsed.fields.includedItems)} rows={6} />
              </div>
              <Field label="Additional quote notes" name="additionalNotes" defaultValue={fromPdf("additionalNotes", parsed.fields.additionalNotes)} rows={5} />
              <Field label="Payment terms" name="paymentTerms" defaultValue={fromPdf("paymentTerms", parsed.fields.paymentTerms || DEFAULT_PAYMENT_TERMS)} rows={2} />
            </Section>

            <div style={bottomBarStyle}>
              <button type="submit" style={primaryBtnStyle}>
                Save PDF edits
              </button>
              <button type="submit" formAction={resetQuotePdfSections} style={dangerBtnStyle}>
                Reset PDF edits
              </button>
              <a href={`/quotes/${params.id}/print`} style={secondaryBtnStyle}>
                Cancel
              </a>
            </div>
          </form>
        )}
      </div>
    </ClientShell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  name,
  defaultValue,
  rows = 2,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      <textarea name={name} defaultValue={defaultValue} rows={rows} style={textareaStyle} />
      {hint ? <span style={hintStyle}>{hint}</span> : null}
    </label>
  );
}

const pageWrapStyle: CSSProperties = {
  width: "min(1240px, 96vw)",
  margin: "0 auto",
  display: "grid",
  gap: 16,
};

const topRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 32,
  lineHeight: 1.1,
};

const subTitleStyle: CSSProperties = {
  marginTop: 6,
  opacity: 0.72,
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const formStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const sectionStyle: CSSProperties = {
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 16,
  padding: 16,
  display: "grid",
  gap: 12,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 20,
};

const twoColStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#334155",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(15,23,42,0.16)",
  background: "#fff",
  boxSizing: "border-box",
  resize: "vertical",
  font: "inherit",
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
};

const bottomBarStyle: CSSProperties = {
  position: "sticky",
  bottom: 12,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  padding: 12,
  borderRadius: 16,
  background: "rgba(255,255,255,0.86)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 28px rgba(15,23,42,0.12)",
};

const primaryBtnStyle: CSSProperties = {
  padding: "11px 16px",
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtnStyle: CSSProperties = {
  display: "inline-block",
  padding: "11px 16px",
  borderRadius: 10,
  border: "1px solid rgba(15,23,42,0.18)",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  textDecoration: "none",
};

const dangerBtnStyle: CSSProperties = {
  padding: "11px 16px",
  borderRadius: 10,
  border: "1px solid rgba(185,28,28,0.28)",
  background: "rgba(254,226,226,0.9)",
  color: "#991b1b",
  fontWeight: 900,
  cursor: "pointer",
};

const errorBoxStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(239,68,68,0.10)",
  border: "1px solid rgba(239,68,68,0.22)",
  color: "#991b1b",
};
