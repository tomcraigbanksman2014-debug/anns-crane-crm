import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey);
}

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json();

    const name = String(body?.name ?? "").trim();
    const assetNumber = norm(body?.asset_number);
    const type = norm(body?.type);
    const capacity = norm(body?.capacity);
    const status = String(body?.status ?? "available").trim().toLowerCase();
    const certificationExpiresOn = norm(body?.certification_expires_on);
    const lolerDueOn = norm(body?.loler_due_on);
    const notes = norm(body?.notes);

    if (!name) {
      return NextResponse.json(
        { error: "Equipment name is required" },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    const { data, error } = await admin
      .from("equipment")
      .insert([
        {
          name,
          asset_number: assetNumber,
          type,
          capacity,
          status: status || "available",
          certification_expires_on: certificationExpiresOn,
          loler_due_on: lolerDueOn,
          notes,
        },
      ])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    try {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "create",
        entity_type: "equipment",
        entity_id: data?.id ?? null,
        meta: {
          name,
          asset_number: assetNumber,
          type,
          capacity,
          status: status || "available",
          certification_expires_on: certificationExpiresOn,
          loler_due_on: lolerDueOn,
        },
      });
    } catch (auditError: any) {
      return NextResponse.json(
        {
          success: true,
          id: data?.id,
          warning: auditError?.message || "Equipment saved, but audit log failed.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not save equipment." },
      { status: 400 }
    );
  }
}
