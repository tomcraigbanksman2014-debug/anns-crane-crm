import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

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
    const channel = CHANNELS.has(String(body?.channel ?? "")) ? String(body.channel) : "email";
    const goal = GOALS.has(String(body?.goal ?? "")) ? String(body.goal) : "introduction";
    const tone = TONES.has(String(body?.tone ?? "")) ? String(body.tone) : "professional";
    const service_focus = clean(body?.service_focus);
    const availability_note = clean(body?.availability_note);
    const custom_cta = clean(body?.custom_cta);
    const subject_hint = clean(body?.subject_hint);
    const body_hint = clean(body?.body_hint);
    const is_active = Boolean(body?.is_active ?? true);

    if (!name) {
      return NextResponse.json({ error: "Template name is required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("sales_templates")
      .insert({
        name,
        description,
        channel,
        goal,
        tone,
        service_focus,
        availability_note,
        custom_cta,
        subject_hint,
        body_hint,
        is_active,
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
      action: "sales_template_created",
      entity_type: "sales_template",
      entity_id: data?.id ?? null,
      meta: {
        name,
        channel,
        goal,
        tone,
      },
    });

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create template." },
      { status: 500 }
    );
  }
}
