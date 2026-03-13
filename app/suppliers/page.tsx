import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { revalidatePath } from "next/cache";

async function createSupplier(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const payload = {
    company_name: String(formData.get("company_name") ?? "").trim(),
    contact_name: String(formData.get("contact_name") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    status: String(formData.get("status") ?? "active").trim() || "active",
    updated_at: new Date().toISOString(),
  };

  if (!payload.company_name) return;

  await supabase.from("suppliers").insert(payload);

  revalidatePath("/suppliers");
}

async function updateSupplier(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const payload = {
    company_name: String(formData.get("company_name") ?? "").trim(),
    contact_name: String(formData.get("contact_name") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    status: String(formData.get("status") ?? "active").trim() || "active",
    updated_at: new Date().toISOString(),
  };

  await supabase.from("suppliers").update(payload).eq("id", id);

  revalidatePath("/suppliers");
}

export default async function SuppliersPage() {
  const supabase = createSupabaseServerClient();

  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("company_name", { ascending: true });

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0, fontSize: 32 }}>Suppliers</h1>
          <p style={{ opacity: 0.8 }}>
            Manage cross-hire suppliers for cranes, HIABs and other equipment.
          </p>

          <section style={sectionCard}>
            <h2 style={sectionTitle}>Add supplier</h2>

            <form action={createSupplier} style={gridStyle}>
              <Field label="Company name" name="company_name" required />
              <Field label="Contact name" name="contact_name" />
              <Field label="Phone" name="phone" />
              <Field label="Email" name="email" type="email" />
              <Field label="Status" name="status" defaultValue="active" />
              <Field label="Address" name="address" />
              <FullWidthField label="Notes" name="notes" />
              <div style={{ gridColumn: "1 / -1" }}>
                <button type="submit" style={saveBtn}>
                  Save supplier
                </button>
              </div>
            </form>
          </section>

          <section style={{ ...sectionCard, marginTop: 16 }}>
            <h2 style={sectionTitle}>Existing suppliers</h2>

            {error ? (
              <div style={errorBox}>{error.message}</div>
            ) : !suppliers || suppliers.length === 0 ? (
              <p style={{ margin: 0 }}>No suppliers added yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {suppliers.map((supplier: any) => (
                  <form key={supplier.id} action={updateSupplier} style={supplierCard}>
                    <input type="hidden" name="id" value={supplier.id} />

                    <div style={gridStyle}>
                      <Field
                        label="Company name"
                        name="company_name"
                        defaultValue={supplier.company_name ?? ""}
                        required
                      />
                      <Field
                        label="Contact name"
                        name="contact_name"
                        defaultValue={supplier.contact_name ?? ""}
                      />
                      <Field label="Phone" name="phone" defaultValue={supplier.phone ?? ""} />
                      <Field label="Email" name="email" defaultValue={supplier.email ?? ""} />
                      <Field label="Status" name="status" defaultValue={supplier.status ?? "active"} />
                      <Field label="Address" name="address" defaultValue={supplier.address ?? ""} />
                      <FullWidthField label="Notes" name="notes" defaultValue={supplier.notes ?? ""} />
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <button type="submit" style={saveBtn}>
                        Update supplier
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            )}
          </section>
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
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        style={inputStyle}
      />
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
    <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea name={name} defaultValue={defaultValue} rows={4} style={textareaStyle} />
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

const supplierCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 14,
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

const saveBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
