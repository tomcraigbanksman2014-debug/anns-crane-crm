import ClientShell from "../../ClientShell";
import JobEquipmentManager from "../JobEquipmentManager";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function EditJobPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", params.id)
    .single();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, company_name");

  const { data: operators } = await supabase
    .from("staff")
    .select("id, full_name");

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, company_name, category");

  const { data: allocations } = await supabase
    .from("job_equipment")
    .select("*")
    .eq("job_id", params.id);

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
        <h1>Edit Job</h1>

        {/* 🔥 CLEAN JOB FORM (NO PRIMARY EQUIPMENT) */}
        <form
          action="/api/jobs/update"
          method="POST"
          style={{ display: "grid", gap: 12 }}
        >
          <input type="hidden" name="id" value={job.id} />

          <select name="customer_id" defaultValue={job.customer_id}>
            <option value="">— Select customer —</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>

          <input
            type="date"
            name="job_date"
            defaultValue={job.job_date || ""}
          />

          <select name="operator_id" defaultValue={job.operator_id}>
            <option value="">— Select operator —</option>
            {operators?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name}
              </option>
            ))}
          </select>

          <select name="status" defaultValue={job.status}>
            <option value="planned">Planned</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <textarea
            name="site_address"
            defaultValue={job.site_address || ""}
            placeholder="Site address"
          />

          <textarea
            name="notes"
            defaultValue={job.notes || ""}
            placeholder="Notes"
          />

          <button type="submit">Save job details</button>
        </form>

        {/* 🔥 THIS IS NOW THE MAIN EQUIPMENT SYSTEM */}
        <JobEquipmentManager
          jobId={params.id}
          initialAllocations={allocations || []}
          supplierOptions={
            suppliers?.map((s) => ({
              value: s.id,
              label: s.company_name,
              category: s.category,
            })) || []
          }
        />
      </div>
    </ClientShell>
  );
}
