import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import { geocodeAddress } from "../../lib/geocode";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function generateTransportNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const stamp = `${d.getHours()}${d.getMinutes()}${d.getSeconds()}`;
  return `TR-${y}${m}${day}-${stamp}`;
}

async function createTransportJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const pickup = clean(formData.get("collection_address"));
  const delivery = clean(formData.get("delivery_address"));

  const pickupCoords = await geocodeAddress(pickup);
  const deliveryCoords = await geocodeAddress(delivery);

  const payload = {
    transport_number: clean(formData.get("transport_number")) || generateTransportNumber(),
    linked_job_id: clean(formData.get("linked_job_id")) || null,
    client_id: clean(formData.get("client_id")) || null,
    vehicle_id: clean(formData.get("vehicle_id")) || null,
    operator_id: clean(formData.get("operator_id")) || null,
    job_type: clean(formData.get("job_type")) || null,
    collection_address: pickup || null,
    delivery_address: delivery || null,

    collection_lat: pickupCoords?.lat || null,
    collection_lng: pickupCoords?.lng || null,
    delivery_lat: deliveryCoords?.lat || null,
    delivery_lng: deliveryCoords?.lng || null,

    transport_date: clean(formData.get("transport_date")) || null,
    collection_time: clean(formData.get("collection_time")) || null,
    delivery_time: clean(formData.get("delivery_time")) || null,
    load_description: clean(formData.get("load_description")) || null,
    status: clean(formData.get("status")) || "planned",
    price: Number(formData.get("price") ?? 0) || 0,
    notes: clean(formData.get("notes")) || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("transport_jobs")
    .insert(payload)
    .select("id, transport_number")
    .single();

  if (error || !data?.id) {
    redirect(`/transport-jobs/new?error=${encodeURIComponent(error?.message ?? "Could not create transport job.")}`);
  }

  redirect(`/transport-jobs/${data.id}?success=${encodeURIComponent(`${data.transport_number} saved.`)}`);
}

export default async function NewTransportJobPage() {

  const supabase = createSupabaseServerClient();

  const [
    { data: clients },
    { data: jobs },
    { data: vehicles },
    { data: operators }
  ] = await Promise.all([
    supabase.from("clients").select("id, company_name"),
    supabase.from("jobs").select("id, job_number, site_name"),
    supabase.from("vehicles").select("id, name, reg_number"),
    supabase.from("operators").select("id, full_name")
  ]);

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>

        <h1>Create Transport Job</h1>

        <form action={createTransportJob} style={{ display: "grid", gap: 12 }}>

          <input name="transport_number" defaultValue={generateTransportNumber()} />

          <input name="collection_address" placeholder="Pickup address" />

          <input name="delivery_address" placeholder="Delivery address" />

          <input name="transport_date" type="date" />

          <input name="collection_time" type="time" />

          <input name="delivery_time" type="time" />

          <input name="load_description" placeholder="Load description" />

          <input name="price" type="number" defaultValue="0" />

          <textarea name="notes" placeholder="Notes" />

          <button type="submit">Save Transport Job</button>

        </form>

      </div>
    </ClientShell>
  );
}
