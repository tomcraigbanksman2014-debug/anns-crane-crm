import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanText(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("lift_plans")
      .select("*")
      .eq("job_id", params.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data ?? null);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load lift plan." },
      { status: 400 }
    );
  }
}

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

    const body = await req.json().catch(() => ({}));

    const payload = {
      job_id: params.id,
      load_description: cleanText(body.load_description),
      load_weight: cleanNumber(body.load_weight),
      lift_radius: cleanNumber(body.lift_radius),
      lift_height: cleanNumber(body.lift_height),
      crane_configuration: cleanText(body.crane_configuration),
      outrigger_setup: cleanText(body.outrigger_setup),
      ground_conditions: cleanText(body.ground_conditions),
      sling_type: cleanText(body.sling_type),
      lifting_accessories: cleanText(body.lifting_accessories),
      method_statement: cleanText(body.method_statement),
      risk_assessment: cleanText(body.risk_assessment),
      lift_supervisor: cleanText(body.lift_supervisor),
      appointed_person: cleanText(body.appointed_person),
      crane_operator: cleanText(body.crane_operator),
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: existingError } = await supabase
      .from("lift_plans")
      .select("id")
      .eq("job_id", params.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("lift_plans")
        .update(payload)
        .eq("job_id", params.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "update",
        entity_type: "lift_plan",
        entity_id: existing.id,
        meta: {
          job_id: params.id,
        },
      });
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("lift_plans")
        .insert({
          ...payload,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "create",
        entity_type: "lift_plan",
        entity_id: inserted.id,
        meta: {
          job_id: params.id,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not save lift plan." },
      { status: 400 }
    );
  }
}
