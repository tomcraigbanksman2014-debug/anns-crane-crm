import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

type Props = { params: { id: string } };

export default async function EditCustomerPage({ params }: Props) {
  const supabase = createSupabaseServerClient();

  const { data: customer, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !customer) {
    redirect("/customers");
  }

  return (
    <ClientShell>
      <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Edit customer</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>Update the customer record.</p>
          </div>

          <a
            href="/customers"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "rgba(255,255,255,0.45)",
              textDecoration: "none",
              color: "#111",
              fontWeight: 800,
            }}
          >
            ← Back
          </a>
        </div>

        <form
          action={`/customers/${params.id}/update`}
          method="post"
          style={{
            marginTop: 16,
            background: "rgba(255,255,255,0.18)",
            padding: 18,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.4)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
            display: "grid",
            gap: 12,
          }}
        >
          <Field label="Company name *">
            <input
              name="company_name"
              defaultValue={customer.company_name ?? ""}
              required
              style={inputStyle}
            />
          </Field>

          <Field label="Contact name">
            <input
              name="contact_name"
              defaultValue={customer.contact_name ?? ""}
              style={inputStyle}
            />
          </Field>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Field label="Phone">
              <input name="phone" defaultValue={customer.phone ?? ""} style={inputStyle} />
            </Field>

            <Field label="Email">
              <input name="email" defaultValue={customer.email ?? ""} style={inputStyle} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={customer.notes ?? ""}
              rows={5}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          <button
            type="submit"
            style={{
              marginTop: 6,
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "white",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Save changes
          </button>
        </form>
      </div>
    </ClientShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
      <span style={{ opacity: 0.85 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 16,
  background: "rgba(255,255,255,0.85)",
};
