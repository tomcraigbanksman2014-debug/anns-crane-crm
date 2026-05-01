import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import ClientShell from "../../../../ClientShell";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB");
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

type POLineOverride = {
  description: string;
  qty: string;
  unit_cost: string;
  total_cost: string;
};

function parseLinesText(value: string): POLineOverride[] {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      const description = parts[0] || line;
      const qty = parts[1] || "1";
      const unitCost = parts[2] || "";
      const calculatedTotal = Number(qty || 0) * Number(unitCost || 0);
      const totalCost = parts[3] || (Number.isFinite(calculatedTotal) && calculatedTotal > 0 ? String(calculatedTotal.toFixed(2)) : "");

      return {
        description,
        qty,
        unit_cost: unitCost,
        total_cost: totalCost,
      };
    });
}

function linesToText(lines: any[] | null | undefined) {
  return (lines ?? [])
    .map((line) => {
      const qty = line?.qty ?? "1";
      const unitCost = line?.unit_cost ?? "";
      const totalCost =
        line?.total_cost ?? (Number(qty || 0) * Number(unitCost || 0) || "");
      return [line?.description ?? "", qty, unitCost, totalCost].join(" | ");
    })
    .join("\n");
}

async function savePurchaseOrderPdfSections(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect("/purchase-orders?error=Purchase order id missing.");
  }

  const lineText = clean(formData.get("linesText"));
  const pdfSections = {
    poNumber: clean(formData.get("poNumber")),
    supplierCompany: clean(formData.get("supplierCompany")),
    supplierReference: clean(formData.get("supplierReference")),
    status: clean(formData.get("status")),
    orderDate: clean(formData.get("orderDate")),
    requiredDate: clean(formData.get("requiredDate")),
    linkedTitle: clean(formData.get("linkedTitle")),
    linkedReference: clean(formData.get("linkedReference")),
    linkedSite: clean(formData.get("linkedSite")),
    primaryAddress: clean(formData.get("primaryAddress")),
    secondaryAddress: clean(formData.get("secondaryAddress")),
    linkedDate: clean(formData.get("linkedDate")),
    invoiceInstruction: clean(formData.get("invoiceInstruction")),
    notes: clean(formData.get("notes")),
    total: clean(formData.get("total")),
    lines: parseLinesText(lineText),
  };

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      pdf_sections: pdfSections,
    })
    .eq("id", id);

  if (error) {
    redirect(`/purchase-orders/${id}/print/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/purchase-orders/${id}/print?pdf_edit=saved`);
}

async function resetPurchaseOrderPdfSections(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect("/purchase-orders?error=Purchase order id missing.");
  }

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      pdf_sections: {},
    })
    .eq("id", id);

  if (error) {
    redirect(`/purchase-orders/${id}/print/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/purchase-orders/${id}/print?pdf_edit=reset`);
}

export default async function PurchaseOrderPdfEditorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: po, error }, { data: lines }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(`
        *,
        suppliers:supplier_id (
          company_name
        ),
        jobs:job_id (
          job_number,
          site_name,
          site_address,
          job_date
        ),
        transport_jobs:transport_job_id (
          transport_number,
          transport_date,
          delivery_date,
          collection_address,
          delivery_address,
          job_type
        )
      `)
      .eq("id", params.id)
      .single(),
    supabase
      .from("purchase_order_lines")
      .select("*")
      .eq("purchase_order_id", params.id)
      .order("created_at", { ascending: true }),
  ]);

  const supplier = Array.isArray((po as any)?.suppliers)
    ? (po as any).suppliers[0]
    : (po as any)?.suppliers;

  const job = Array.isArray((po as any)?.jobs)
    ? (po as any).jobs[0]
    : (po as any)?.jobs;

  const transportJob = Array.isArray((po as any)?.transport_jobs)
    ? (po as any).transport_jobs[0]
    : (po as any)?.transport_jobs;

  const linkedTitle = transportJob
    ? "Linked transport job"
    : job
      ? "Linked crane job"
      : "Linked job";

  const linkedReference = transportJob?.transport_number ?? job?.job_number ?? "";
  const linkedSite =
    job?.site_name ??
    (transportJob?.job_type === "on_site_hiab" ? "On-site HIAB" : transportJob ? "Transport job" : "");
  const primaryAddress = job?.site_address ?? transportJob?.collection_address ?? "";
  const secondaryAddress =
    transportJob?.delivery_address && transportJob.delivery_address !== transportJob.collection_address
      ? transportJob.delivery_address
      : "";
  const linkedDate = transportJob?.transport_date ?? transportJob?.delivery_date ?? job?.job_date ?? null;

  const rawPdfSections = (po as any)?.pdf_sections;
  const pdfSections =
    rawPdfSections && typeof rawPdfSections === "object" && !Array.isArray(rawPdfSections)
      ? (rawPdfSections as Record<string, any>)
      : {};

  const fromPdf = (key: string, fallback: string | number | null | undefined = "") => {
    const value = pdfSections[key];
    return typeof value === "string" ? value : String(fallback ?? "");
  };

  const initialLines =
    Array.isArray(pdfSections.lines) && pdfSections.lines.length > 0
      ? linesToText(pdfSections.lines)
      : linesToText((lines ?? []) as any[]);

  const defaultTotal =
    Array.isArray(pdfSections.lines) && pdfSections.lines.length > 0
      ? fmtMoney(
          (pdfSections.lines as any[]).reduce((sum, line) => sum + Number(line?.total_cost ?? 0), 0)
        )
      : fmtMoney((po as any)?.total_cost);

  const errorMessage = searchParams?.error || error?.message || "";

  return (
    <ClientShell>
      <div style={pageWrapStyle}>
        <div style={topRowStyle}>
          <div>
            <h1 style={titleStyle}>Purchase order PDF editor</h1>
            <div style={subTitleStyle}>
              Edit the supplier-facing PDF wording only. This keeps the order screen and printable PDF consistent with the lift-plan pack editor.
            </div>
          </div>

          <div style={buttonRowStyle}>
            <a href={`/purchase-orders/${params.id}`} style={secondaryBtnStyle}>
              Back to PO
            </a>
            <a href={`/purchase-orders/${params.id}/print`} target="_blank" style={secondaryBtnStyle}>
              View PDF page
            </a>
          </div>
        </div>

        {errorMessage ? <div style={errorBoxStyle}>{errorMessage}</div> : null}

        {!po ? (
          <div style={errorBoxStyle}>Purchase order not found.</div>
        ) : (
          <form action={savePurchaseOrderPdfSections} style={formStyle}>
            <input type="hidden" name="id" value={params.id} />

            <Section title="1. Header and supplier">
              <div style={twoColStyle}>
                <Field label="PO number" name="poNumber" defaultValue={fromPdf("poNumber", (po as any)?.po_number || "")} />
                <Field label="Supplier company" name="supplierCompany" defaultValue={fromPdf("supplierCompany", supplier?.company_name || "")} />
                <Field label="Supplier reference" name="supplierReference" defaultValue={fromPdf("supplierReference", (po as any)?.supplier_reference || "")} />
                <Field label="Status" name="status" defaultValue={fromPdf("status", (po as any)?.status || "")} />
                <Field label="Order date" name="orderDate" defaultValue={fromPdf("orderDate", fmtDate((po as any)?.order_date))} />
                <Field label="Required date" name="requiredDate" defaultValue={fromPdf("requiredDate", fmtDate((po as any)?.required_date))} />
              </div>
            </Section>

            <Section title="2. Linked job details">
              <div style={twoColStyle}>
                <Field label="Linked section title" name="linkedTitle" defaultValue={fromPdf("linkedTitle", linkedTitle)} />
                <Field label="Linked job/reference number" name="linkedReference" defaultValue={fromPdf("linkedReference", linkedReference)} />
                <Field label="Site" name="linkedSite" defaultValue={fromPdf("linkedSite", linkedSite)} />
                <Field label="Job date" name="linkedDate" defaultValue={fromPdf("linkedDate", fmtDate(linkedDate))} />
                <Field label="Address" name="primaryAddress" defaultValue={fromPdf("primaryAddress", primaryAddress)} rows={3} />
                <Field label="Delivery address" name="secondaryAddress" defaultValue={fromPdf("secondaryAddress", secondaryAddress)} rows={3} />
              </div>
            </Section>

            <Section title="3. Invoice instruction and notes">
              <Field
                label="Invoice instruction"
                name="invoiceInstruction"
                defaultValue={fromPdf(
                  "invoiceInstruction",
                  "All supplier invoices for this purchase order must be sent to invoicespayable@annscranehire.co.uk and must quote the purchase order number."
                )}
                rows={3}
              />
              <Field label="Notes" name="notes" defaultValue={fromPdf("notes", (po as any)?.notes || "")} rows={5} />
            </Section>

            <Section title="4. Line items shown on the PDF">
              <Field
                label="Line items"
                name="linesText"
                defaultValue={initialLines}
                rows={8}
                hint="Use one line per item: Description | Qty | Unit cost | Total. These PDF edits do not change the operational PO line records unless you edit the main PO."
              />
              <Field label="Total shown on PDF" name="total" defaultValue={fromPdf("total", defaultTotal)} rows={2} />
            </Section>

            <div style={bottomBarStyle}>
              <button type="submit" style={primaryBtnStyle}>
                Save PDF edits
              </button>
              <button type="submit" formAction={resetPurchaseOrderPdfSections} style={dangerBtnStyle}>
                Reset PDF edits
              </button>
              <a href={`/purchase-orders/${params.id}/print`} style={secondaryBtnStyle}>
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
