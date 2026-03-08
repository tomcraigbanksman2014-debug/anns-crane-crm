import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey);
}

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

    const name = String(body?.name ?? "").trim();
    const assetNumber = String(body?.asset_number ?? "").trim();
    const type = String(body?.type ?? "").trim();
    const capacity = String(body?.capacity ?? "").trim();
    const status = String(body?.status ?? "available").trim();
    const notes = String(body?.notes ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Equipment name is required" }, { status: 400 });
    }

    const admin = getAdminClient();

    const { data, error } = await admin
      .from("equipment")
      .insert([
        {
          name,
          asset_number: assetNumber || null,
          type: type || null,
          capacity: capacity || null,
          status: status || "available",
          notes: notes || null,
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
        name,
        asset_number: assetNumber || null,
        type: type || null,
        capacity: capacity || null,
        status: status || "available",
      },
    });

    return NextResponse.json({ success: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not save equipment." },
      { status: 400 }
    );
  }
}
