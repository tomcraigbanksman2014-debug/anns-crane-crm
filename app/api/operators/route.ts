import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

function cleanText(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function cleanStatus(value: unknown) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "inactive" ? "inactive" : "active";
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

    const full_name = cleanText(body.full_name);
    const email = cleanText(body.email);
    const phone = cleanText(body.phone);
    const status = cleanStatus(body.status);
    const notes = cleanText(body.notes);

    if (!full_name) {
      return NextResponse.json(
        { error: "Full name is required." },
        { status: 400 }
      );
    }

    const { data: inserted, error } = await supabase
      .from("operators")
      .insert([
        {
          full_name,
          email,
          phone,
          status,
          notes,
        },
      ])
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
      entity_id: inserted.id,
      meta: {
        full_name,
        email,
        phone,
        status,
      },
    });

    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not create operator." },
      { status: 400 }
    );
  }
}
