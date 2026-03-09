import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function fmtMoney(value: any) {
  const n = Number(value ?? null);
  if (!Number.isFinite(n)) return "-";
  return `£${n.toFixed(2)}`;
}

export default async function BookingPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(`
      id,
      created_at,
      start_date,
      end_date,
      start_at,
      end_at,
      status,
      location,
      total_invoice,
      invoice_status,
      client_id,
      equipment_id,
      clients:client_id (
        id,
        company_name,
        contact_name,
        phone,
        email
      ),
      equipment:equipment_id (
        id,
        name,
        status
      )
    `)
    .eq("id", params.id)
    .single();

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Booking</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View booking details and linked records.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/bookings" style={btnStyle}>
              ← Back to bookings
            </a>

            {booking?.client_id ? (
              <a href={`/customers/${booking.client_id}`} style={btnStyle}>
                Open customer
              </a>
            ) : null}
          </div>
        </div>

        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : !booking ? (
          <div style={errorBox}>Booking not found.</div>
        ) : (
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "1.2fr 0.9fr",
              gap: 18,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: 18 }}>
              <section style={cardStyle}>
                <h2 style={sectionTitle}>Booking details</h2>

                <div style={gridStyle}>
                  <div>
                    <strong>Booking ID:</strong>
                    <div>{booking.id}</div>
                  </div>

                  <div>
                    <strong>Status:</strong>
                    <div>{booking.status ?? "-"}</div>
                  </div>

                  <div>
                    <strong>Start date:</strong>
                    <div>{fmtDate(booking.start_date)}</div>
                  </div>

                  <div>
                    <strong>End date:</strong>
                    <div>{fmtDate(booking.end_date)}</div>
                  </div>

                  <div>
                    <strong>Start time:</strong>
                    <div>{fmtDateTime(booking.start_at)}</div>
                  </div>

                  <div>
                    <strong>End time:</strong>
                    <div>{fmtDateTime(booking.end_at)}</div>
                  </div>

                  <div>
                    <strong>Location:</strong>
                    <div>{booking.location ?? "-"}</div>
                  </div>

                  <div>
                    <strong>Created:</strong>
                    <div>{fmtDateTime(booking.created_at)}</div>
                  </div>

                  <div>
                    <strong>Invoice total:</strong>
                    <div>{fmtMoney(booking.total_invoice)}</div>
                  </div>

                  <div>
                    <strong>Invoice status:</strong>
                    <div>{booking.invoice_status ?? "-"}</div>
                  </div>
                </div>
              </section>
            </div>

            <div style={{ display: "grid", gap: 18 }}>
              <section style={cardStyle}>
                <h2 style={sectionTitle}>Customer</h2>

                {booking.clients ? (
                  <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                    <div>
                      <strong>Company:</strong>{" "}
                      {(booking.clients as any).company_name ?? "-"}
                    </div>
                    <div>
                      <strong>Contact:</strong>{" "}
                      {(booking.clients as any).contact_name ?? "-"}
                    </div>
                    <div>
                      <strong>Phone:</strong>{" "}
                      {(booking.clients as any).phone ?? "-"}
                    </div>
                    <div>
                      <strong>Email:</strong>{" "}
                      {(booking.clients as any).email ?? "-"}
                    </div>

                    <a
                      href={`/customers/${(booking.clients as any).id}`}
                      style={linkBtnStyle}
                    >
                      Open customer record
                    </a>
                  </div>
                ) : (
                  <p style={{ margin: 0 }}>No customer linked.</p>
                )}
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Equipment</h2>

                {booking.equipment ? (
                  <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                    <div>
                      <strong>Name:</strong> {(booking.equipment as any).name ?? "-"}
                    </div>
                    <div>
                      <strong>Status:</strong>{" "}
                      {(booking.equipment as any).status ?? "-"}
                    </div>
                    <div>
                      <strong>Equipment ID:</strong>{" "}
                      {(booking.equipment as any).id ?? "-"}
                    </div>
                  </div>
                ) : (
                  <p style={{ margin: 0 }}>No equipment linked.</p>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </ClientShell>
  );
}

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const linkBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
  marginTop: 6,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
  fontSize: 14,
};
