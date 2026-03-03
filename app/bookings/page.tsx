import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

export default async function BookingsPage() {
  const supabase = createSupabaseServerClient();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      `
      id,
      start_date,
      end_date,
      location,
      status,
      hire_price,
      total_invoice,
      invoice_status,
      created_at,
      clients:client_id ( company_name, contact_name ),
      equipment:equipment_id ( name, asset_number, capacity )
    `
    )
    .order("start_date", { ascending: false });

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Bookings</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>Create and manage crane hire bookings.</p>
          </div>

          <a href="/bookings/new" style={btn}>
            + New booking
          </a>
        </div>

        <div style={card}>
          {error && <div style={errorBox}>{error.message}</div>}

          {!bookings || bookings.length === 0 ? (
            <p style={{ margin: 0 }}>No bookings yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={th}>Dates</th>
                    <th align="left" style={th}>Customer</th>
                    <th align="left" style={th}>Equipment</th>
                    <th align="left" style={th}>Location</th>
                    <th align="left" style={th}>Status</th>
                    <th align="left" style={th}>Invoice</th>
                    <th align="left" style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b: any) => (
                    <tr key={b.id}>
                      <td style={td}>
                        {b.start_date} → {b.end_date}
                      </td>
                      <td style={td}>
                        {(b.clients?.company_name ?? "—")}
                        {b.clients?.contact_name ? ` — ${b.clients.contact_name}` : ""}
                      </td>
                      <td style={td}>
                        {(b.equipment?.name ?? "—")}
                        {b.equipment?.asset_number ? ` — ${b.equipment.asset_number}` : ""}
                        {b.equipment?.capacity ? ` — ${b.equipment.capacity}` : ""}
                      </td>
                      <td style={td}>{b.location ?? "—"}</td>
                      <td style={td}>{b.status ?? "—"}</td>
                      <td style={td}>
                        {b.invoice_status ?? "—"}{" "}
                        {b.total_invoice != null ? `— £${Number(b.total_invoice).toFixed(2)}` : ""}
                      </td>
                      <td style={td}>
                        <a href={`/bookings/${b.id}`} style={{ fontWeight: 900, color: "#0b57d0", textDecoration: "none" }}>
                          Edit
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <a href="/dashboard" style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}>
            ← Back to dashboard
          </a>
        </div>
      </div>
    </ClientShell>
  );
}

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const card: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const th: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.8,
};

const td: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
