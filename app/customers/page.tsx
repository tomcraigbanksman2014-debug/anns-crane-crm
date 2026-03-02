import { createSupabaseServerClient } from "../lib/supabase/server";
import ClientShell from "../ClientShell";

export default async function CustomersPage() {
  const supabase = createSupabaseServerClient();

  const { data: customers } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <ClientShell>
      <div
        style={{
          width: "min(1000px, 95vw)",
          margin: "0 auto",
        }}
      >
        <h1 style={{ fontSize: 32 }}>Customers</h1>

        <div
          style={{
            marginTop: 20,
            background: "rgba(255,255,255,0.2)",
            padding: 20,
            borderRadius: 12,
          }}
        >
          {!customers || customers.length === 0 ? (
            <p>No customers yet.</p>
          ) : (
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th align="left">Company</th>
                  <th align="left">Contact</th>
                  <th align="left">Phone</th>
                  <th align="left">Email</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c: any) => (
                  <tr key={c.id}>
                    <td>{c.company_name}</td>
                    <td>{c.contact_name}</td>
                    <td>{c.phone}</td>
                    <td>{c.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ClientShell>
  );
}
