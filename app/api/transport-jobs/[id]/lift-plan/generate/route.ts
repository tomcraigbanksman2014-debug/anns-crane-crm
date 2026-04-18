import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";
import { generateTransportLiftPlanDraft } from "../../../../../lib/ai/liftPlans";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("transport_lift_plans")
      .select("id, paperwork_locked")
      .eq("transport_job_id", params.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (existing?.paperwork_locked) {
      return NextResponse.json(
        { error: "Paperwork is locked and can no longer be edited." },
        { status: 403 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("transport_jobs")
      .select(`
        id,
        transport_number,
        linked_job_id,
        client_id,
        vehicle_id,
        operator_id,
        job_type,
        collection_address,
        delivery_address,
        transport_date,
        delivery_date,
        collection_time,
        delivery_time,
        load_description,
        notes,
        clients:client_id (
          company_name,
          contact_name,
          phone,
          email
        ),
        vehicles:vehicle_id (
          name,
          reg_number,
          vehicle_type,
          trailer_type,
          capacity
        ),
        operators:operator_id (
          full_name,
          phone,
          email
        )
      `)
      .eq("id", params.id)
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }

    if (!job) {
      return NextResponse.json({ error: "Transport job not found." }, { status: 404 });
    }

    let linkedJob: any = null;

    if (job.linked_job_id) {
      const { data } = await supabase
        .from("jobs")
        .select(`
          id,
          job_number,
          site_name,
          site_address,
          notes,
          lift_type,
          hire_type,
          cranes:crane_id (
            name,
            make,
            model,
            capacity
          )
        `)
        .eq("id", job.linked_job_id)
        .maybeSingle();

      linkedJob = data ?? null;
    }

    const result = await generateTransportLiftPlanDraft(job, linkedJob);

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "transport_lift_plan_ai_generated",
      entity_type: "transport_lift_plan",
      entity_id: existing?.id ?? null,
      meta: {
        transport_job_id: params.id,
        provider: result.provider,
        equipment_profile_id: result.equipmentProfile?.id ?? null,
      },
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not generate transport lift plan draft." },
      { status: 400 }
    );
  }
}
