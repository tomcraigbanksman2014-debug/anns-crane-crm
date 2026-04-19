import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";
import { generateCraneLiftPlanDraft } from "../../../../../lib/ai/liftPlans";

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
      .from("lift_plans")
      .select("id, paperwork_locked, selected_job_equipment_id, selected_crane_id, lift_supervisor, appointed_person, crane_operator")
      .eq("job_id", params.id)
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
      .from("jobs")
      .select(`
        id,
        job_number,
        site_name,
        site_address,
        contact_name,
        contact_phone,
        start_date,
        end_date,
        job_date,
        start_time,
        end_time,
        hire_type,
        lift_type,
        notes,
        client_id,
        crane_id,
        operator_id,
        main_operator_id,
        clients:client_id (
          company_name,
          contact_name,
          phone,
          email
        ),
        cranes:crane_id (
          id,
          name,
          make,
          model,
          capacity,
          reg_number
        ),
        operators:operator_id (
          full_name,
          phone,
          email
        ),
        main_operator:main_operator_id (
          full_name,
          phone,
          email
        ),
        job_equipment (
          id,
          asset_type,
          start_date,
          end_date,
          start_time,
          end_time,
          item_name,
          crane_id,
          operator_id,
          cranes:crane_id (
            id,
            name,
            make,
            model,
            capacity,
            reg_number
          ),
          operators:operator_id (
            id,
            full_name,
            phone,
            email
          )
        )
      `)
      .eq("id", params.id)
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const result = await generateCraneLiftPlanDraft({
      ...(job as any),
      selected_job_equipment_id: (existing as any)?.selected_job_equipment_id ?? null,
      selected_crane_id: (existing as any)?.selected_crane_id ?? null,
      lift_supervisor: (existing as any)?.lift_supervisor ?? null,
      appointed_person: (existing as any)?.appointed_person ?? null,
      crane_operator: (existing as any)?.crane_operator ?? null,
    });

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "lift_plan_ai_generated",
      entity_type: "lift_plan",
      entity_id: existing?.id ?? null,
      meta: {
        job_id: params.id,
        provider: result.provider,
        equipment_profile_id: result.equipmentProfile?.id ?? null,
        selected_job_equipment_id: (existing as any)?.selected_job_equipment_id ?? null,
        selected_crane_id: (existing as any)?.selected_crane_id ?? null,
      },
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not generate lift plan draft." },
      { status: 400 }
    );
  }
}
