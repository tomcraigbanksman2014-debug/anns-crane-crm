import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import CustomerForm from "../new/CustomerForm";

export default async function EditCustomerPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: customer, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", params.id)
    .single();

  return (
    <ClientShell>
      <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 32 }}>Edit customer</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          Update the customer details then save.
        </p>

        <div
          style={{
            marginTop: 16,
            background: "rgba(255,255,255,0.18)",
            padding: 18,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.4)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          }}
        >
          {error && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,0,0,0.10)",
                border: "1px solid rgba(255,0,0,0.25)",
              }}
            >
              {error.message}
            </div>
          )}

          {!customer ? (
            <p style={{ margin: 0 }}>Customer not found.</p>
          ) : (
            <CustomerForm mode="edit" customer={customer} />
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <a
            href="/customers"
            style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}
          >
            ← Back to customers
          </a>
        </div>
      </div>
    </ClientShell>
  );
}
