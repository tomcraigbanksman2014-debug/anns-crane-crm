import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

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
      .select("id, paperwork_locked")
      .eq("job_id", params.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (!existing?.id) {
      return NextResponse.json({ error: "Lift plan not found." }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from("lift_plans")
      .update({
        paperwork_locked: false,
        finalised_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "lift_plan_unlocked",
      entity_type: "lift_plan",
      entity_id: existing.id,
      meta: { job_id: params.id },
    });

    return NextResponse.json({ ok: true, paperwork_locked: false, finalised_at: null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not unlock lift plan." },
      { status: 400 }
    );
  }
}
