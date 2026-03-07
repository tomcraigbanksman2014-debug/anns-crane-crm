import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json();

    const { data, error } = await supabase
      .from("equipment")
      .insert([
        {
          name: body.name ?? null,
          asset_number: body.asset_number ?? null,
          type: body.type ?? null,
          capacity: body.capacity ?? null,
          status: body.status ?? "available",
          notes: body.notes ?? null,
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
      entity_type: "equipment",
      entity_id: data?.id ?? null,
      meta: {
        name: body?.name ?? null,
        asset_number: body?.asset_number ?? null,
        type: body?.type ?? null,
        capacity: body?.capacity ?? null,
        status: body?.status ?? "available",
      },
    });

    return NextResponse.json({ success: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Bad request" },
      { status: 400 }
    );
  }
}
