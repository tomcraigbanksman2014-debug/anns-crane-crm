import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import CustomerForm from "../new/CustomerForm";

export default async function CustomerEditPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: customer, error } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, phone, email, notes, created_at")
    .eq("id", params.id)
    .single();

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Customer</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>Edit customer details.</p>
          </div>

          <a href="/customers" style={pillStyle}>
            ← Back
          </a>
        </div>

        <div style={panelStyle}>
          {error && <div style={errorStyle}>{error.message}</div>}

          {!customer ? (
            <p style={{ margin: 0 }}>Customer not found.</p>
          ) : (
            <CustomerForm mode="edit" customer={customer as any} />
          )}
        </div>
      </div>
    </ClientShell>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const errorStyle: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
