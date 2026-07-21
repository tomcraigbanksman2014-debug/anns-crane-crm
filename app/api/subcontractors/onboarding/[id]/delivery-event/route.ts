import { NextResponse } from "next/server";
import { requireOfficeUserApi } from "../../../../../lib/routeGuards";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

function actorName(email: string | null | undefined) {
  const raw = String(email ?? "").trim();
  return raw.includes("@") ? raw.split("@")[0] : raw;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireOfficeUserApi();
  if (auth.response) return auth.response;

  const payload = await request.json().catch(() => ({}));
  const channel = String(payload?.channel ?? "").trim().toLowerCase();
  if (channel !== "whatsapp") {
    return NextResponse.json({ error: "Unsupported delivery channel." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("subcontractor_onboarding_events").insert({
    invite_id: params.id,
    event_type: "whatsapp_opened",
    actor_type: "office",
    actor_user_id: auth.ctx?.user?.id ?? null,
    actor_username: actorName(auth.ctx?.user?.email) || null,
    detail: { channel: "whatsapp" },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
