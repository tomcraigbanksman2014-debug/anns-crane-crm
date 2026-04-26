import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";

const DEFAULT_PLANNER_VIEW_MODE = "rolling_7_days";
const ALLOWED_PLANNER_VIEW_MODES = new Set(["rolling_7_days", "current_week"]);

function normalisePlannerViewMode(value: unknown) {
  const mode = String(value ?? "").trim();
  return ALLOWED_PLANNER_VIEW_MODES.has(mode) ? mode : DEFAULT_PLANNER_VIEW_MODE;
}

export async function GET() {
  try {
    const { user, response } = await requireApiUser();
    if (response) return response;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("user_preferences")
      .select("planner_view_mode")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      planner_view_mode: normalisePlannerViewMode(data?.planner_view_mode),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not load planner preference." },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const { user, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => ({}));
    const plannerViewMode = normalisePlannerViewMode(body?.planner_view_mode);
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin
      .from("user_preferences")
      .upsert(
        {
          user_id: user.id,
          planner_view_mode: plannerViewMode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("planner_view_mode")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      planner_view_mode: normalisePlannerViewMode(data?.planner_view_mode),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not save planner preference." },
      { status: 500 }
    );
  }
}
