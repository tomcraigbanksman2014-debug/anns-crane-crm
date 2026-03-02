import ClientShell from "../../ClientShell";
import CustomerForm from "./CustomerForm";

export default function NewCustomerPage() {
  return (
    <ClientShell>
      <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 32 }}>Add customer</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          Create a new customer record.
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
          <CustomerForm mode="create" />
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
