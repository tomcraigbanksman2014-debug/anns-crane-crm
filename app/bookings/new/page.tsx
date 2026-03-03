import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import BookingForm from "../BookingForm";

export default async function NewBookingPage() {
  const supabase = createSupabaseServerClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, company_name, contact_name")
    .order("company_name", { ascending: true });

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, name, asset_number, type, capacity, status")
    .order("name", { ascending: true });

  return (
    <ClientShell>
      <BookingForm mode="create" clients={clients ?? []} equipment={equipment ?? []} />
      <div style={{ width: "min(1100px, 95vw)", margin: "12px auto 0" }}>
        <a href="/bookings" style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}>
          ← Back to bookings
        </a>
      </div>
    </ClientShell>
  );
}
