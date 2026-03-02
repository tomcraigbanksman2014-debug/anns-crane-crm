import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export default async function DeleteCustomerPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: customer } = await supabase
    .from("clients")
    .select("id, company_name")
    .eq("id", params.id)
    .single();

  // Count bookings for this customer
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("client_id", params.id);

  const hasBookings = (count ?? 0) > 0;

  return (
    <ClientShell>
      <div style={{ width: "min(800px, 92vw)", margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 32 }}>Delete customer</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          This action cannot be undone.
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
          <p style={{ marginTop: 0 }}>
            Customer: <b>{customer?.company_name ?? "Unknown"}</b>
          </p>

          {hasBookings ? (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,0,0,0.10)",
                border: "1px solid rgba(255,0,0,0.25)",
              }}
            >
              Cannot delete this customer because they have existing bookings.
              Delete or reassign the bookings first.
            </div>
          ) : (
            <form action="/api/customers/delete" method="post">
              <input type="hidden" name="id" value={params.id} />

              <button
                type="submit"
                style={{
                  width: "100%",
                  marginTop: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#b00020",
                  color: "white",
                  fontSize: 15,
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Yes, permanently delete
              </button>
            </form>
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
