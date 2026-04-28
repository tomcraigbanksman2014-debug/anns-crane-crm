import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

const STATUSES = new Set(["Draft", "Active", "Completed", "Cancelled"]);
const CHANNELS = new Set(["email", "text", "linkedin"]);
const GOALS = new Set([
  "introduction",
  "recent_customer_thank_you",
  "dormant_recovery",
  "quote_follow_up",
  "cross_sell",
  "follow_up",
  "reactivation",
  "availability",
]);
const TONES = new Set(["professional", "friendly", "direct"]);

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("sales_campaigns")
      .select("*")
      .eq("id", params.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    const name = clean(body?.name);
    const description = clean(body?.description);
    const status = STATUSES.has(String(body?.status ?? "")) ? String(body.status) : "Draft";
    const channel = CHANNELS.has(String(body?.channel ?? "")) ? String(body.channel) : "email";
    const incomingGoal = String(body?.goal ?? "").trim();
    const goal = GOALS.has(incomingGoal) ? incomingGoal : "introduction";
    const tone = TONES.has(String(body?.tone ?? "")) ? String(body.tone) : "professional";
    const template_id = clean(body?.template_id);
    const service_focus = clean(body?.service_focus);
    const availability_note = clean(body?.availability_note);
    const scheduled_for = clean(body?.scheduled_for);

    if (!name) {
      return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
    }

    const { error } = await supabase
      .from("sales_campaigns")
      .update({
        name,
        description,
        status,
        channel,
        goal,
        tone,
        template_id,
        service_focus,
        availability_note,
        scheduled_for,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "sales_campaign_updated",
      entity_type: "sales_campaign",
      entity_id: params.id,
      meta: {
        previous_name: existing.name ?? null,
        new_name: name,
        status,
        channel,
        goal,
        tone,
        template_id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to update campaign." },
      { status: 500 }
    );
  }
}
