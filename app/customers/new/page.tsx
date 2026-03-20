import ClientShell from "../../ClientShell";
import CustomerForm from "./CustomerForm";
import { getAccessContext, canCreateCustomers } from "../../lib/access";
import { redirect } from "next/navigation";

export default async function NewCustomerPage() {
  const access = await getAccessContext();

  if (!access.user) {
    redirect("/login?next=/customers/new");
  }

  const allowed = canCreateCustomers(access);

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
        {allowed ? (
          <CustomerForm mode="create" />
        ) : (
          <div style={errorCard}>
            <h1 style={{ marginTop: 0, fontSize: 32 }}>Add customer</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Your staff permissions currently do not allow customer creation.
            </p>
          </div>
        )}

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

const errorCard: React.CSSProperties = {
  width: "min(1150px, 95vw)",
  margin: "0 auto",
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};
