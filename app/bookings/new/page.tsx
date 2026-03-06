import ClientShell from "../../ClientShell";
import BookingForm from "./BookingForm";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function NewBookingPage() {
  const supabase = createSupabaseServerClient();

  const [{ data: clients, error: clientsError }, { data: equipment, error: equipmentError }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, company_name, contact_name")
        .order("company_name", { ascending: true }),

      supabase
        .from("equipment")
        .select("id, name, asset_number, type, capacity, status")
        .order("name", { ascending: true }),
    ]);

  const errorMessage = clientsError?.message || equipmentError?.message || null;

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        {errorMessage ? (
          <div
            style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(255,0,0,0.10)",
              border: "1px solid rgba(255,0,0,0.25)",
            }}
          >
            {errorMessage}
          </div>
        ) : (
          <BookingForm
            mode="create"
            clients={(clients ?? []) as any}
            equipment={(equipment ?? []) as any}
          />
        )}

        <div style={{ marginTop: 14 }}>
          <a
            href="/bookings"
            style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}
          >
            ← Back to bookings
          </a>
        </div>
      </div>
    </ClientShell>
  );
}
