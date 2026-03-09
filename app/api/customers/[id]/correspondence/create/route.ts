import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

type Payload = {
  entry_type?: "call" | "email" | "note";
  subject?: string | null;
  message?: string | null;
};

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Payload;

    const entry_type = body.entry_type ?? "note";
    const subject = norm(body.subject);
    const message = norm(body.message);

    if (!["call", "email", "note"].includes(entry_type)) {
      return NextResponse.json(
        { error: "Invalid correspondence type" },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("customer_correspondence")
      .insert([
        {
          client_id: params.id,
          entry_type,
          subject,
          message,
        },
      ])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_username: auth.user.email ? auth.user.email.split("@")[0] : null,
      action: "create",
      entity_type: "customer_correspondence",
      entity_id: data?.id ?? null,
      meta: {
        client_id: params.id,
        entry_type,
        subject,
      },
    });

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Bad request" },
      { status: 400 }
    );
  }
}
