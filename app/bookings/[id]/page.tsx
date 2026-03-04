import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import StatusPill, { bookingKind, invoiceKind, equipmentKind } from "../../components/StatusPill";

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

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
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

  const client = first<any>(booking?.clients);
  const equip = first<any>(booking?.equipment);

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
            <p style={{ marginTop: 6, opacity: 0.8 }}>View booking details.</p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* ✅ NEW: Invoice PDF download */}
            <a
              href={`/api/bookings/${params.id}/invoice`}
              style={{ ...pillStyle, background: "rgba(0,120,255,0.15)", border: "1px solid rgba(0,120,255,0.25)" }}
            >
              Download Invoice PDF
            </a>

            <a href={`/bookings/${params.id}/edit`} style={pillStyle}>
              Edit
            </a>

            <a href="/bookings" style={pillStyle}>
              ← Back
            </a>
          </div>
        </div>

        <div style={panelStyle}>
          {error && <div style={errorStyle}>{error.message}</div>}

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

                <Row
                  label="Status"
                  value={
                    <StatusPill
                      text={booking.status ?? "-"}
                      kind={bookingKind(booking.status ?? "") as any}
                    />
                  }
                />

                <Row
                  label="Invoice status"
                  value={
                    <StatusPill
                      text={booking.invoice_status ?? "-"}
                      kind={invoiceKind(booking.invoice_status ?? "") as any}
                    />
                  }
                />
              </Section>

              <Section title="Customer">
                <Row label="Company" value={client?.company_name ?? "-"} />
                <Row label="Contact" value={client?.contact_name ?? "-"} />
                <Row label="Phone" value={client?.phone ?? "-"} />
                <Row label="Email" value={client?.email ?? "-"} />
                {client?.id && (
                  <div style={{ marginTop: 10 }}>
                    <a href={`/customers/${client.id}`} style={linkStyle}>
                      View customer →
                    </a>
                  </div>
                )}
              </Section>

              <Section title="Equipment">
                <Row label="Name" value={equip?.name ?? "-"} />
                <Row label="Asset #" value={equip?.asset_number ?? "-"} />
                <Row label="Type" value={equip?.type ?? "-"} />
                <Row label="Capacity" value={equip?.capacity ?? "-"} />

                <Row
                  label="Status"
                  value={
                    <StatusPill
                      text={equip?.status ?? "-"}
                      kind={equipmentKind(equip?.status ?? "") as any}
                    />
                  }
                />

                {equip?.id && (
                  <div style={{ marginTop: 10 }}>
                    <a href={`/equipment/${equip.id}`} style={linkStyle}>
                      View equipment →
                    </a>
                  </div>
                )}
              </Section>

              <Section title="Money">
                <Row label="Hire price" value={money(booking.hire_price)} />
                <Row label="VAT" value={money(booking.vat)} />
                <Row label="Total invoice" value={money(booking.total_invoice)} />
                <Row label="Payment received" value={money(booking.payment_received)} />
              </Section>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <a
            href="/dashboard"
            style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}
          >
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
  fontWeight: 900,
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
