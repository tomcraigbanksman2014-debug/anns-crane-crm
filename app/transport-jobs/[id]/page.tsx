import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(v: any) {
  return String(v ?? "").trim();
}

// ✅ UPDATE
async function updateJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  const { error } = await supabase
    .from("transport_jobs")
    .update({
      vehicle_id: clean(formData.get("vehicle_id")),
      operator_id: clean(formData.get("operator_id")),
      transport_date: clean(formData.get("transport_date")),
      collection_time: clean(formData.get("collection_time")),
      delivery_time: clean(formData.get("delivery_time")),
      collection_address: clean(formData.get("collection_address")),
      delivery_address: clean(formData.get("delivery_address")),
      load_description: clean(formData.get("load_description")),
      notes: clean(formData.get("notes")),
      price: Number(formData.get("price") || 0),
      status: clean(formData.get("status")) || "planned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/transport-jobs/${id}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/transport-jobs/${id}?success=Saved`);
}

// ✅ CANCEL (same pattern as crane jobs)
async function cancelJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  await supabase
    .from("transport_jobs")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  redirect(`/transport-jobs/${id}?success=Cancelled`);
}

export default async function Page({ params, searchParams }: any) {
  const supabase = createSupabaseServerClient();

  const { data: job } = await supabase
    .from("transport_jobs")
    .select("*")
    .eq("id", params.id)
    .single();

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, name, reg_number")
    .eq("archived", false);

  const { data: operators } = await supabase
    .from("operators")
    .select("id, full_name")
    .eq("archived", false);

  if (!job) {
    return <ClientShell>Job not found</ClientShell>;
  }

  return (
    <ClientShell>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1>Transport Job</h1>

        {/* ✅ SUCCESS / ERROR */}
        {searchParams?.success && (
          <div style={{ color: "green" }}>
            {decodeURIComponent(searchParams.success)}
          </div>
        )}
        {searchParams?.error && (
          <div style={{ color: "red" }}>
            {decodeURIComponent(searchParams.error)}
          </div>
        )}

        {/* ✅ FORM */}
        <form action={updateJob} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="id" value={job.id} />

          <select name="vehicle_id" defaultValue={job.vehicle_id || ""}>
            <option value="">Select vehicle</option>
            {(vehicles || []).map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.reg_number})
              </option>
            ))}
          </select>

          <select name="operator_id" defaultValue={job.operator_id || ""}>
            <option value="">Select driver</option>
            {(operators || []).map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.full_name}
              </option>
            ))}
          </select>

          <input
            type="date"
            name="transport_date"
            defaultValue={job.transport_date || ""}
          />

          <input
            type="time"
            name="collection_time"
            defaultValue={job.collection_time || ""}
          />

          <input
            type="time"
            name="delivery_time"
            defaultValue={job.delivery_time || ""}
          />

          <input
            name="collection_address"
            defaultValue={job.collection_address || ""}
            placeholder="Collection address"
          />

          <input
            name="delivery_address"
            defaultValue={job.delivery_address || ""}
            placeholder="Delivery address"
          />

          <textarea
            name="load_description"
            defaultValue={job.load_description || ""}
            placeholder="Load description"
          />

          <textarea
            name="notes"
            defaultValue={job.notes || ""}
            placeholder="Notes"
          />

          <input
            type="number"
            step="0.01"
            name="price"
            defaultValue={job.price || 0}
          />

          <select name="status" defaultValue={job.status || "planned"}>
            <option value="planned">Planned</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <button type="submit">Save</button>
        </form>

        {/* ✅ CANCEL BUTTON */}
        {job.status !== "cancelled" && (
          <form action={cancelJob} style={{ marginTop: 20 }}>
            <input type="hidden" name="id" value={job.id} />
            <button style={{ background: "red", color: "white" }}>
              Cancel Job
            </button>
          </form>
        )}
      </div>
    </ClientShell>
  );
}
