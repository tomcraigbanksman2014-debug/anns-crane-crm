import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json();

    const { error } = await supabase
      .from("equipment")
      .update({
        name: body.name ?? null,
        asset_number: body.asset_number ?? null,
        type: body.type ?? null,
        capacity: body.capacity ?? null,
        status: body.status ?? null,
        notes: body.notes ?? null,
      })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "update",
      entity_type: "equipment",
      entity_id: params.id,
      meta: {
        name: body?.name ?? null,
        asset_number: body?.asset_number ?? null,
        type: body?.type ?? null,
        capacity: body?.capacity ?? null,
        status: body?.status ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
