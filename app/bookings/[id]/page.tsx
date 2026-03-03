import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d + "T00:00:00").toLocaleDateString();
}

function money(n: any) {
  if (n === null || n === undefined || n === "") return "-";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString(undefined, { style: "currency", currency: "GBP" });
}

export default async function BookingViewPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      `
        id,
        start_date,
        end_date,
        location,
        status,
        hire_price,
        vat,
        total_invoice,
        payment_received,
        invoice_status,
        created_at,
        client_id,
        equipment_id,
        clients ( id, company_name, contact_name, phone, email ),
        equipment ( id, name, asset_number, type, capacity, status )
      `
    )
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Booking</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View booking details.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <a href={`/bookings/${params.id}/edit`} style={pillStyle}>
              Edit
            </a>
            <a href="/bookings" style={pillStyle}>
              ← Back
            </a>
          </div>
        </div>

        <div style={panelStyle}>
          {error && (
            <div style={errorStyle}>
              {error.message}
            </div>
          )}

          {!booking ? (
            <p style={{ margin: 0 }}>Booking not found.</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 14,
              }}
            >
              <Section title="Dates & status">
                <Row label="Start" value={fmtDate(booking.start_date)} />
                <Row label="End" value={fmtDate(booking.end_date)} />
                <Row label="Location" value={booking.location ?? "-"} />
                <Row label="Status" value={booking.status ?? "-"} />
                <Row label="Invoice status" value={booking.invoice_status ?? "-"} />
              </Section>

              <Section title="Customer">
                <Row
                  label="Company"
                  value={booking.clients?.company_name ?? "-"}
                />
                <Row
                  label="Contact"
                  value={booking.clients?.contact_name ?? "-"}
                />
                <Row label="Phone" value={booking.clients?.phone ?? "-"} />
                <Row label="Email" value={booking.clients?.email ?? "-"} />
                {booking.clients?.id && (
                  <div style={{ marginTop: 10 }}>
                    <a
                      href={`/customers/${booking.clients.id}`}
                      style={linkStyle}
                    >
                      View customer →
                    </a>
                  </div>
                )}
              </Section>

              <Section title="Equipment">
                <Row label="Name" value={booking.equipment?.name ?? "-"} />
                <Row
                  label="Asset #"
                  value={booking.equipment?.asset_number ?? "-"}
                />
                <Row label="Type" value={booking.equipment?.type ?? "-"} />
                <Row
                  label="Capacity"
                  value={booking.equipment?.capacity ?? "-"}
                />
                <Row label="Status" value={booking.equipment?.status ?? "-"} />
                {booking.equipment?.id && (
                  <div style={{ marginTop: 10 }}>
                    <a
                      href={`/equipment/${booking.equipment.id}`}
                      style={linkStyle}
                    >
                      View equipment →
                    </a>
                  </div>
                )}
              </Section>

              <Section title="Money">
                <Row label="Hire price" value={money(booking.hire_price)} />
                <Row label="VAT" value={money(booking.vat)} />
                <Row label="Total invoice" value={money(booking.total_invoice)} />
                <Row
                  label="Payment received"
                  value={money(booking.payment_received)}
                />
              </Section>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <a href="/dashboard" style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}>
            ← Dashboard
          </a>
        </div>
      </div>
    </ClientShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.22)",
        border: "1px solid rgba(255,255,255,0.35)",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0" }}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, textAlign: "right" }}>{value}</div>
    </div>
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

const linkStyle: React.CSSProperties = {
  textDecoration: "none",
  fontWeight: 900,
  color: "#111",
};

const errorStyle: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
