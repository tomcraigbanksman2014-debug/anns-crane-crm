import ClientShell from "../../ClientShell";
import ServerSubmitButton from "../../components/ServerSubmitButton";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import POLinesEditorClient from "../POLinesEditorClient";
import { redirect } from "next/navigation";
import DeletePurchaseOrderButton from "../DeletePurchaseOrderButton";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

type LineInput = {
  description?: string;
  qty?: string | number;
  unit_cost?: string | number;
};

function parseLines(raw: string): LineInput[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function linkedTypeLabel(po: any) {
  if (po?.transport_job_id) return "Transport";
  if (po?.job_id) return "Crane Job";
  return "Unlinked";
}

function linkedTypeStyle(po: any): React.CSSProperties {
  if (po?.transport_job_id) {
    return {
      background: "rgba(59,130,246,0.12)",
      color: "#1d4ed8",
      border: "1px solid rgba(59,130,246,0.22)",
    };
  }

  if (po?.job_id) {
    return {
      background: "rgba(16,185,129,0.12)",
      color: "#047857",
      border: "1px solid rgba(16,185,129,0.22)",
    };
  }

  return {
    background: "rgba(148,163,184,0.18)",
    color: "#334155",
    border: "1px solid rgba(148,163,184,0.24)",
  };
}

async function updatePurchaseOrder(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const id = clean(formData.get("id"));
  if (!id) {
    redirect(`/purchase-orders?error=${encodeURIComponent("Purchase order id missing.")}`);
  }

  const existingResult = await supabase
    .from("purchase_orders")
    .select("id, po_number, supplier_id, status, total_cost, job_id, transport_job_id")
    .eq("id", id)
    .single();

  const existingPO = existingResult.data;
  if (existingResult.error || !existingPO) {
    redirect(`/purchase-orders?error=${encodeURIComponent("Purchase order not found.")}`);
  }

  const supplier_id = clean(formData.get("supplier_id")) || null;
  const job_id = clean(formData.get("job_id")) || null;
  const transport_job_id = clean(formData.get("transport_job_id")) || null;
  const status = clean(formData.get("status")) || "draft";
  const order_date = clean(formData.get("order_date")) || null;
  const required_date = clean(formData.get("required_date")) || null;
  const supplier_reference = clean(formData.get("supplier_reference")) || null;
  const notes = clean(formData.get("notes")) || null;
  const po_number = clean(formData.get("po_number_display")) || "Purchase order";

  const rawLines = clean(formData.get("po_lines_json"));
  const parsedLines = parseLines(rawLines).filter(
    (line) => String(line.description ?? "").trim().length > 0
  );

  const lines = parsedLines.map((line) => {
    const qty = Number(line.qty ?? 0) || 0;
    const unit_cost = Number(line.unit_cost ?? 0) || 0;
    return {
      description: String(line.description ?? "").trim(),
      qty,
      unit_cost,
      total_cost: qty * unit_cost,
    };
  });

  const total_cost = lines.reduce(
    (sum, line) => sum + Number(line.total_cost ?? 0),
    0
  );

  const { error: updateError } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id,
      job_id,
      transport_job_id,
      status,
      order_date,
      required_date,
      supplier_reference,
      total_cost,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    redirect(`/purchase-orders/${id}?error=${encodeURIComponent(updateError.message)}`);
  }

  const { error: deleteLinesError } = await supabase
    .from("purchase_order_lines")
    .delete()
    .eq("purchase_order_id", id);

  if (deleteLinesError) {
    redirect(`/purchase-orders/${id}?error=${encodeURIComponent(deleteLinesError.message)}`);
  }

  if (lines.length > 0) {
    const { error: lineInsertError } = await supabase
      .from("purchase_order_lines")
      .insert(
        lines.map((line) => ({
          purchase_order_id: id,
          description: line.description,
          qty: line.qty,
          unit_cost: line.unit_cost,
          total_cost: line.total_cost,
        }))
      );

    if (lineInsertError) {
      redirect(`/purchase-orders/${id}?error=${encodeURIComponent(lineInsertError.message)}`);
    }
  }

  if (supplier_id) {
    const messages: string[] = [];

    messages.push(`Purchase order ${po_number} was updated.`);

    if (existingPO.status !== status) {
      messages.push(`Status changed from ${existingPO.status ?? "—"} to ${status}.`);
    }

    if (Number(existingPO.total_cost ?? 0) !== total_cost) {
      messages.push(
        `Total changed from £${Number(existingPO.total_cost ?? 0).toFixed(2)} to £${total_cost.toFixed(2)}.`
      );
    }

    if (supplier_reference) {
      messages.push(`Supplier ref: ${supplier_reference}.`);
    }

    if (required_date) {
      messages.push(`Required date: ${required_date}.`);
    }

    if (existingPO.job_id !== job_id) {
      messages.push(`Linked crane job updated.`);
    }

    if (existingPO.transport_job_id !== transport_job_id) {
      messages.push(`Linked transport job updated.`);
    }

    const baseType = status === "sent" ? "email" : "note";
    const baseSubject =
      status === "sent" && existingPO.status !== "sent"
        ? "Purchase Order Sent"
        : existingPO.status !== status
          ? "Purchase Order Status Changed"
          : "Purchase Order Updated";

    await supabase.from("supplier_correspondence").insert({
      supplier_id,
      type: baseType,
      subject: baseSubject,
      message: messages.join(" "),
      created_by: "system",
    });
  }

  redirect(
    `/purchase-orders/${id}?success=${encodeURIComponent(`${po_number} updated.`)}`
  );
}

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: po, error },
    { data: suppliers },
    { data: jobs },
    { data: transportJobs },
    { data: poLines },
  ] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(`
        *,
        suppliers:supplier_id (
          id,
          company_name
        ),
        jobs:job_id (
          id,
          job_number,
          site_name,
          site_address,
          job_date
        ),
        transport_jobs:transport_job_id (
          id,
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
      .from("suppliers")
      .select("id, company_name")
      .order("company_name", { ascending: true }),

    supabase
      .from("jobs")
      .select("id, job_number, site_name")
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("transport_jobs")
      .select("id, transport_number, transport_date")
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("purchase_order_lines")
      .select("*")
      .eq("purchase_order_id", params.id)
      .order("created_at", { ascending: true }),
  ]);

  const supplier = first((po as any)?.suppliers);
  const linkedJob = first((po as any)?.jobs);
  const linkedTransportJob = first((po as any)?.transport_jobs);

  const linkedAddress = linkedJob?.site_address ?? linkedTransportJob?.collection_address ?? "";
  const linkedDeliveryAddress =
    linkedTransportJob?.delivery_address && linkedTransportJob.delivery_address !== linkedTransportJob.collection_address
      ? linkedTransportJob.delivery_address
      : "";
  const linkedSiteLabel = linkedJob?.site_name
    ?? (linkedTransportJob?.job_type === "on_site_hiab" ? "On-site HIAB" : linkedTransportJob ? "Transport job" : "");
  const linkedDate = linkedJob?.job_date ?? linkedTransportJob?.transport_date ?? linkedTransportJob?.delivery_date ?? "";

  const successMessage = searchParams?.success
    ? decodeURIComponent(searchParams.success)
    : "";
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <h1 style={{ marginTop: 0, marginBottom: 0, fontSize: 32 }}>
                  {po?.po_number ?? "Purchase Order"}
                </h1>
                {po ? (
                  <span
                    style={{
                      display: "inline-block",
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 900,
                      ...linkedTypeStyle(po),
                    }}
                  >
                    {linkedTypeLabel(po)}
                  </span>
                ) : null}
              </div>

              <p style={{ opacity: 0.8, marginTop: 6 }}>
                View, update and save this purchase order as PDF.
              </p>

              {po ? (
                <div style={linkedMetaBox}>
                  Supplier: {supplier?.company_name ?? "—"}
                  {linkedJob
                    ? ` • Crane Job: ${linkedJob.job_number ?? "—"}${linkedJob.site_name ? ` • ${linkedJob.site_name}` : ""}`
                    : ""}
                  {linkedTransportJob
                    ? ` • Transport Job: ${linkedTransportJob.transport_number ?? "—"}${linkedTransportJob.transport_date ? ` • ${linkedTransportJob.transport_date}` : ""}`
                    : ""}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/purchase-orders" style={secondaryBtn}>
                ← Back to PO list
              </a>
              <a
                href={`/purchase-orders/${params.id}/print`}
                target="_blank"
                rel="noreferrer"
                style={secondaryBtn}
              >
                Open / Save PDF
              </a>
              {po ? (
                <DeletePurchaseOrderButton
                  purchaseOrderId={params.id}
                  poNumber={po.po_number}
                />
              ) : null}
            </div>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
          {error ? <div style={errorBox}>{error.message}</div> : null}

          {!po ? (
            <div style={errorBox}>Purchase order not found.</div>
          ) : (
            <>
              <section style={{ ...sectionCard, marginBottom: 16 }}>
                <div style={linkedInfoGrid}>
                  <InfoCard
                    label={linkedTransportJob ? "Transport number" : "Job number"}
                    value={linkedTransportJob?.transport_number ?? linkedJob?.job_number ?? "—"}
                  />
                  <InfoCard label="Site" value={linkedSiteLabel || "—"} />
                  <InfoCard label="Address" value={linkedAddress || "—"} />
                  <InfoCard
                    label={linkedTransportJob ? "Delivery address" : "Job date"}
                    value={linkedTransportJob ? (linkedDeliveryAddress || linkedAddress || "—") : (linkedDate || "—")}
                  />
                </div>
              </section>

                <section style={sectionCard}>
                <form action={updatePurchaseOrder} style={{ display: "grid", gap: 14 }}>
                <input type="hidden" name="id" value={po.id} />
                <input type="hidden" name="po_number_display" value={po.po_number ?? ""} />

                <div style={gridStyle}>
                  <Field
                    label="PO number"
                    name="po_number_readonly"
                    defaultValue={po.po_number ?? ""}
                    disabled
                  />
                  <SelectField
                    label="Supplier"
                    name="supplier_id"
                    defaultValue={po.supplier_id ?? ""}
                    options={(suppliers ?? []).map((s: any) => ({
                      value: s.id,
                      label: s.company_name,
                    }))}
                  />
                  <SelectField
                    label="Linked crane job"
                    name="job_id"
                    defaultValue={po.job_id ?? ""}
                    options={(jobs ?? []).map((j: any) => ({
                      value: j.id,
                      label: `Job #${j.job_number ?? "—"}${
                        j.site_name ? ` • ${j.site_name}` : ""
                      }`,
                    }))}
                  />
                  <SelectField
                    label="Linked transport job"
                    name="transport_job_id"
                    defaultValue={po.transport_job_id ?? ""}
                    options={(transportJobs ?? []).map((j: any) => ({
                      value: j.id,
                      label: `${j.transport_number ?? "Transport Job"}${
                        j.transport_date ? ` • ${j.transport_date}` : ""
                      }`,
                    }))}
                  />
                  <SelectField
                    label="Status"
                    name="status"
                    defaultValue={po.status ?? "draft"}
                    options={[
                      { value: "draft", label: "Draft" },
                      { value: "sent", label: "Sent" },
                      { value: "approved", label: "Approved" },
                      { value: "completed", label: "Completed" },
                      { value: "cancelled", label: "Cancelled" },
                    ]}
                  />
                  <Field
                    label="Order date"
                    name="order_date"
                    type="date"
                    defaultValue={po.order_date ?? ""}
                  />
                  <Field
                    label="Required date"
                    name="required_date"
                    type="date"
                    defaultValue={po.required_date ?? ""}
                  />
                  <Field
                    label="Supplier reference"
                    name="supplier_reference"
                    defaultValue={po.supplier_reference ?? ""}
                  />
                  <Field
                    label="Total cost"
                    name="total_cost_display"
                    type="number"
                    defaultValue={String(po.total_cost ?? 0)}
                    disabled
                  />
                </div>

                <FullWidthField
                  label="Notes"
                  name="notes"
                  defaultValue={po.notes ?? ""}
                />

                <POLinesEditorClient
                  fieldName="po_lines_json"
                  initialLines={(poLines ?? []).map((line: any) => ({
                    description: line.description ?? "",
                    qty: String(line.qty ?? 0),
                    unit_cost: String(line.unit_cost ?? 0),
                  }))}
                />

                <div>
                  <ServerSubmitButton style={primaryBtn} pendingText="Updating purchase order…">
                    Update purchase order
                  </ServerSubmitButton>
                </div>
                </form>
              </section>
            </>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={linkedInfoCard}>
      <div style={linkedInfoLabel}>{label}</div>
      <div style={linkedInfoValue}>{value}</div>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  disabled = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        type={type}
        style={inputStyle}
        disabled={disabled}
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
        <option value="">— Select —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FullWidthField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={4}
        style={textareaStyle}
      />
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
  resize: "vertical",
};

const linkedInfoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const linkedInfoCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.6)",
  border: "1px solid rgba(0,0,0,0.08)",
  minHeight: 78,
};

const linkedInfoLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.7,
  marginBottom: 6,
};

const linkedInfoValue: React.CSSProperties = {
  fontWeight: 700,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const linkedMetaBox: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.62)",
  border: "1px solid rgba(0,0,0,0.06)",
  fontSize: 13,
  opacity: 0.82,
};

const successBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#0b7a4b",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
