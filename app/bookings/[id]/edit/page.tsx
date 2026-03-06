import ClientShell from "../../../ClientShell";
import BookingForm from "../../new/BookingForm";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type BookingRow = {
  id: string;
  client_id: string | null;
  equipment_id: string | null;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  status: string | null;
  hire_price: number | null;
  vat: number | null;
  total_invoice: number | null;
  payment_received: number | null;
  invoice_status: string | null;
};

export default async function EditBookingPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: booking, error: bookingError },
    { data: clients, error: clientsError },
    { data: equipment, error: equipmentError },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(`
        id,
        client_id,
        equipment_id,
        start_at,
        end_at,
        start_date,
        end_date,
        location,
        status,
        hire_price,
        vat,
        total_invoice,
        payment_received,
        invoice_status
      `)
      .eq("id", params.id)
      .single(),

    supabase
      .from("clients")
      .select("id, company_name, contact_name")
      .order("company_name", { ascending: true }),

    supabase
      .from("equipment")
      .select("id, name, asset_number, type, capacity, status")
      .order("name", { ascending: true }),
  ]);

  const errorMessage =
    bookingError?.message || clientsError?.message || equipmentError?.message || null;

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
            <h1 style={{ margin: 0, fontSize: 32 }}>Edit booking</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>Update booking details.</p>
          </div>

          <a href={`/bookings/${params.id}`} style={btnStyle}>
            ← Back
          </a>
        </div>

        {errorMessage ? (
          <div style={errorBox}>{errorMessage}</div>
        ) : !booking ? (
          <div style={errorBox}>Booking not found.</div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <BookingForm
              mode="edit"
              booking={booking as BookingRow}
              clients={(clients ?? []) as any}
              equipment={(equipment ?? []) as any}
            />
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

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
