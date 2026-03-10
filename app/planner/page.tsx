import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ClientShell from "@/components/layout/ClientShell";
import DispatchPlannerBoard from "@/components/planner/DispatchPlannerBoard";

export default async function PlannerPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: equipment, error: equipmentError } = await supabase
    .from("equipment")
    .select("id, name, asset_number, type, capacity, status")
    .order("name", { ascending: true });

  if (equipmentError) {
    throw new Error(`Failed to load equipment: ${equipmentError.message}`);
  }

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select(`
      id,
      job_number,
      job_date,
      start_time,
      end_time,
      site_name,
      site_address,
      status,
      clients (
        id,
        company_name
      )
    `)
    .order("job_date", { ascending: true });

  if (jobsError) {
    throw new Error(`Failed to load jobs: ${jobsError.message}`);
  }

  return (
    <ClientShell
      title="Crane Dispatch Planner"
      subtitle="Assign cranes to jobs"
    >
      <DispatchPlannerBoard
        equipment={equipment || []}
        jobs={jobs || []}
      />
    </ClientShell>
  );
}
