import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";

function cleanText(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("operators")
      .select("*")
      .order("full_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load operators." },
      { status: 400 }
    );
  }
}

export async function POST(req: Request) {
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
      full_name: cleanText(body.full_name),
      email: cleanText(body.email),
      phone: cleanText(body.phone),
      status: cleanText(body.status) ?? "active",
    };

    const { data, error } = await supabase
      .from("operators")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "create",
      entity_type: "operator",
      entity_id: data.id,
      meta: payload,
    });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not create operator." },
      { status: 400 }
    );
  }
}
