import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function updateSupplier(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const id = clean(formData.get("id"));
  if (!id) {
    redirect(`/suppliers?error=${encodeURIComponent("Supplier id missing.")}`);
  }

  const payload = {
    company_name: clean(formData.get("company_name")) || null,
    contact_name: clean(formData.get("contact_name")) || null,
    phone: clean(formData.get("phone")) || null,
    email: clean(formData.get("email")) || null,
    status: clean(formData.get("status")) || "active",
    address: clean(formData.get("address")) || null,
    notes: clean(formData.get("notes")) || null,
  };

  const { error } = await supabase.from("suppliers").update(payload).eq("id", id);

  if (error) {
    redirect(`/suppliers/${id}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/suppliers/${id}?success=${encodeURIComponent(`${payload.company_name ?? "Supplier"} updated.`)}`);
}

async function addSupplierCorrespondence(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const supplier_id = clean(formData.get("supplier_id"));
  if (!supplier_id) {
    redirect(`/suppliers?error=${encodeURIComponent("Supplier id missing.")}`);
  }

  const type = clean(formData.get("type")) || "note";
  const subject = clean(formData.get("subject")) || null;
  const message = clean(formData.get("message")) || null;
  const created_by = clean(formData.get("created_by")) || "office";

  const { error } = await supabase.from("supplier_correspondence").insert({
    supplier_id,
    type,
    subject,
    message,
    created_by,
  });

  if (error) {
    redirect(`/suppliers/${supplier_id}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/suppliers/${supplier_id}?success=${encodeURIComponent("Supplier correspondence added.")}`);
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

function prettyType(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "email") return "Email";
  if (v === "call") return "Call";
  if (v === "phone") return "Phone";
  if (v === "note") return "Note";
  if (v === "meeting") return "Meeting";
  return value || "Note";
}

function typePillStyle(value: string | null | undefined): React.CSSProperties {
  const v = String(value ?? "").toLowerCase();

  if (v === "email") {
    return {
      background: "rgba(0,120,255,0.10)",
      color: "#0b57d0",
      border: "1px solid rgba(0,120,255,0.20)",
    };
  }

  if (v === "call" || v === "phone") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (v === "meeting") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  return {
    background: "rgba(255,255,255,0.68)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: supplier, error },
    { data: purchaseOrders },
    { data: correspondence },
  ] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", params.id).single(),

    supabase
      .from("purchase_orders")
      .select(`
        *,
        jobs:job_id (
          id,
          job_number,
          site_name
        )
      `)
      .eq("supplier_id", params.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("supplier_correspondence")
      .select("*")
      .eq("supplier_id", params.id)
      .order("created_at", { ascending: false }),
  ]);

  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 32 }}>
                {supplier?.company_name ?? "Supplier"}
              </h1>
              <p style={{ opacity: 0.8, marginTop: 6 }}>
                Supplier details, purchase orders and correspondence history.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/suppliers" style={secondaryBtn}>
                ← Back to suppliers
              </a>
              <a href="/purchase-orders/new" style={secondaryBtn}>
                + New purchase order
              </a>
            </div>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
          {error ? <div style={errorBox}>{error.message}</div> : null}

          {!supplier ? (
            <div style={errorBox}>Supplier not found.</div>
          ) : (
            <div style={pageGrid}>
              <div style={{ display: "grid", gap: 16 }}>
                <section style={sectionCard}>
                  <h2 style={sectionTitle}>Supplier details</h2>

                  <form action={updateSupplier} style={{ display: "grid", gap: 14 }}>
                    <input type="hidden" name="id" value={supplier.id} />

                    <div style={gridStyle}>
                      <Field label="Company name" name="company_name" defaultValue={supplier.company_name ?? ""} />
                      <Field label="Contact name" name="contact_name" defaultValue={supplier.contact_name ?? ""} />
                      <Field label="Phone" name="phone" defaultValue={supplier.phone ?? ""} />
                      <Field label="Email" name="email" defaultValue={supplier.email ?? ""} />
                      <SelectField
                        label="Status"
                        name="status"
                        defaultValue={supplier.status ?? "active"}
                        options={[
                          { value: "active", label: "active" },
                          { value: "inactive", label: "inactive" },
                        ]}
                      />
                      <Field label="Address" name="address" defaultValue={supplier.address ?? ""} />
                    </div>

                    <FullWidthField label="Notes" name="notes" defaultValue={supplier.notes ?? ""} />

                    <div>
                      <button type="submit" style={primaryBtn}>
                        Update supplier
                      </button>
                    </div>
                  </form>
                </section>

                <section style={sectionCard}>
                  <h2 style={sectionTitle}>Purchase orders</h2>

                  {!purchaseOrders || purchaseOrders.length === 0 ? (
                    <p style={{ margin: 0 }}>No purchase orders linked to this supplier yet.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {purchaseOrders.map((po: any) => {
                        const job = Array.isArray(po.jobs) ? po.jobs[0] : po.jobs;

                        return (
                          <div key={po.id} style={poCard}>
                            <div style={poRow}>
                              <div>
                                <div style={{ fontWeight: 1000, fontSize: 18 }}>
                                  {po.po_number ?? "Purchase Order"}
                                </div>
                                <div style={{ marginTop: 6, opacity: 0.72 }}>
                                  Status: {po.status ?? "—"} • Total: £{Number(po.total_cost ?? 0).toFixed(2)}
                                </div>
                                <div style={{ marginTop: 4, opacity: 0.72 }}>
                                  Job: {job?.job_number ?? "—"}
                                  {job?.site_name ? ` • ${job.site_name}` : ""}
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                <a href={`/purchase-orders/${po.id}`} style={secondaryBtn}>
                                  Open PO
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section style={sectionCard}>
                  <h2 style={sectionTitle}>Correspondence history</h2>

                  {!correspondence || correspondence.length === 0 ? (
                    <p style={{ margin: 0 }}>No supplier correspondence logged yet.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {correspondence.map((item: any) => (
                        <div key={item.id} style={correspondenceCard}>
                          <div style={correspondenceTop}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 900,
                                  ...typePillStyle(item.type),
                                }}
                              >
                                {prettyType(item.type)}
                              </span>

                              <span style={{ fontSize: 12, opacity: 0.72 }}>
                                {fmtDateTime(item.created_at)}
                              </span>

                              {item.created_by ? (
                                <span style={{ fontSize: 12, opacity: 0.72 }}>
                                  by {item.created_by}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div style={{ marginTop: 8, fontWeight: 900 }}>
                            {item.subject || "No subject"}
                          </div>

                          <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                            {item.message || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div style={{ display: "grid", gap: 16 }}>
                <section style={sectionCard}>
                  <h2 style={sectionTitle}>Quick contact</h2>
                  <InfoRow label="Contact" value={supplier.contact_name ?? "—"} />
                  <InfoRow label="Phone" value={supplier.phone ?? "—"} />
                  <InfoRow label="Email" value={supplier.email ?? "—"} />
                  <InfoRow label="Status" value={supplier.status ?? "—"} />
                  <InfoRow label="Address" value={supplier.address ?? "—"} />
                </section>

                <section style={sectionCard}>
                  <h2 style={sectionTitle}>Add correspondence</h2>

                  <form action={addSupplierCorrespondence} style={{ display: "grid", gap: 12 }}>
                    <input type="hidden" name="supplier_id" value={supplier.id} />
                    <input type="hidden" name="created_by" value="office" />

                    <SelectField
                      label="Type"
                      name="type"
                      defaultValue="note"
                      options={[
                        { value: "note", label: "note" },
                        { value: "email", label: "email" },
                        { value: "call", label: "call" },
                        { value: "meeting", label: "meeting" },
                      ]}
                    />

                    <Field label="Subject" name="subject" />
                    <FullWidthField label="Message" name="message" />

                    <div>
                      <button type="submit" style={primaryBtn}>
                        Add correspondence
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input name={name} defaultValue={defaultValue} type={type} style={inputStyle} />
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
      <textarea name={name} defaultValue={defaultValue} rows={4} style={textareaStyle} />
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={infoRow}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
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

const pageGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.3fr 0.9fr",
  gap: 16,
  alignItems: "start",
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const poCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 14,
};

const poRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const correspondenceCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.52)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 14,
};

const correspondenceTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const infoRow: React.CSSProperties = {
  padding: "10px 0",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

const infoLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 800,
};

const infoValue: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 900,
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
