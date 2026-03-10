import { startOfWeek, addDays, format } from "date-fns";
import { redirect } from "next/navigation";
import ClientShell from "@/components/layout/ClientShell";
import { createClient } from "@/lib/supabase/server";
import DispatchPlannerBoard from "@/components/planner/DispatchPlannerBoard";
import type { PlannerEquipment, PlannerJob } from "@/types/dispatch";

interface PlannerPageProps {
  searchParams?: {
    week?: string;
  };
}

export default async function PlannerPage({ searchParams }: PlannerPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const weekParam = searchParams?.week;
  const baseDate = weekParam ? new Date(weekParam) : new Date();
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  const [{ data: equipment, error: equipmentError }, { data: jobs, error: jobsError }] =
    await Promise.all([
      supabase
        .from("equipment")
        .select("id, name, asset_number, type, capacity, status")
        .order("name", { ascending: true }),
      supabase
        .from("jobs")
        .select(`
          id,
          job_number,
          job_date,
          start_time,
          end_time,
          site_name,
          site_address,
          contact_name,
          contact_phone,
          hire_type,
          lift_type,
          status,
          client:clients (
            id,
            company_name
          ),
          dispatch:job_dispatches (
            id,
            job_id,
            equipment_id,
            dispatch_date,
            start_time,
            end_time,
            operator_name,
            operator_user_id,
            status,
            notes
          )
        `)
        .gte("job_date", format(weekStart, "yyyy-MM-dd"))
        .lte("job_date", format(weekEnd, "yyyy-MM-dd"))
        .order("job_date", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);

  if (equipmentError) {
    throw new Error(`Failed to load equipment: ${equipmentError.message}`);
  }

  if (jobsError) {
    throw new Error(`Failed to load jobs: ${jobsError.message}`);
  }

  const normalizedJobs: PlannerJob[] = (jobs ?? []).map((job: any) => ({
    ...job,
    client: Array.isArray(job.client) ? job.client[0] ?? null : job.client,
    dispatch: Array.isArray(job.dispatch) ? job.dispatch[0] ?? null : job.dispatch,
  }));

  return (
    <ClientShell
      title="Planner"
      subtitle="Weekly crane dispatch planner"
    >
      <DispatchPlannerBoard
        weekStart={format(weekStart, "yyyy-MM-dd")}
        equipment={(equipment ?? []) as PlannerEquipment[]}
        jobs={normalizedJobs}
      />
    </ClientShell>
  );
}
