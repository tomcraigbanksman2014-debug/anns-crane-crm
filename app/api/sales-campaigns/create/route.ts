import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

const STATUSES = new Set(["Draft", "Active", "Completed", "Cancelled"]);
const CHANNELS = new Set(["email", "text", "linkedin"]);
const GOALS = new Set(["introduction", "follow_up", "reactivation", "availability"]);
const TONES = new Set(["professional", "friendly", "direct"]);

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const name = clean(body?.name);
    const description = clean(body?.description);
    const status = STATUSES.has(String(body?.status ?? "")) ? String(body.status) : "Draft";
    const channel = CHANNELS.has(String(body?.channel ?? "")) ? String(body.channel) : "email";
    const goal = GOALS.has(String(body?.goal ?? "")) ? String(body.goal) : "introduction";
    const tone = TONES.has(String(body?.tone ?? "")) ? String(body.tone) : "professional";
    const template_id = clean(body?.template_id);
    const service_focus = clean(body?.service_focus);
    const availability_note = clean(body?.availability_note);
    const scheduled_for = clean(body?.scheduled_for);

    if (!name) {
      return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("sales_campaigns")
      .insert({
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
        created_by_user_id: user.id,
        created_by_username: fromAuthEmail(user.email ?? null) || null,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "sales_campaign_created",
      entity_type: "sales_campaign",
      entity_id: data?.id ?? null,
      meta: {
        name,
        status,
        channel,
        goal,
        tone,
        template_id,
      },
    });

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create campaign." },
      { status: 500 }
    );
  }
}
