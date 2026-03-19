import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") || "crane";

  // ✅ GET CRANES ONLY (FIX)
  const { data: cranes } = await supabase
    .from("cranes")
    .select("id, name, reg_number, capacity")
    .eq("archived", false)
    .order("name");

  // ❌ DO NOT USE EQUIPMENT HERE ANYMORE

  const resources =
    view === "crane"
      ? (cranes || []).map((c) => ({
          id: c.id,
          name: `${c.name}${c.reg_number ? ` (${c.reg_number})` : ""}`,
        }))
      : [];

  // ✅ GET JOBS (EXCLUDE CANCELLED)
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .not("status", "eq", "cancelled");

  // ✅ GET ALLOCATIONS
  const { data: allocations } = await supabase
    .from("job_equipment")
    .select("*");

  // BUILD BOARD ITEMS
  const items =
    allocations?.map((a) => {
      const job = jobs?.find((j) => j.id === a.job_id);

      if (!job) return null;

      // ONLY MAP CRANE ALLOCATIONS
      if (a.asset_type !== "crane") return null;

      return {
        id: a.id,
        resourceId: a.asset_id,
        date: a.start_date,
        title: job.customer_name || "Job",
        status: job.status,
      };
    }).filter(Boolean) || [];

  return NextResponse.json({
    resources,
    items,
  });
}
