import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "../../lib/audit";
import { requireAdminApi } from "../../lib/routeGuards";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey);
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdminApi();
    if (auth.response) return auth.response;
    const user = auth.ctx!.user;

    const body = await req.json();
    const payload = {
      ...body,
      invoice_next_number: Math.max(1, Number(body?.invoice_next_number ?? 1)),
      updated_at: new Date().toISOString(),
    };

    const admin = getAdminClient();

    const { data: existing, error: existingError } = await admin
      .from("app_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (existing?.id) {
      const { error } = await admin
        .from("app_settings")
        .update(payload)
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: fromAuthEmail(user.email ?? null) || null,
        action: "settings_updated",
        entity_type: "settings",
        entity_id: existing.id,
        meta: {
          changed_fields: Object.keys(body ?? {}),
        },
      });

      return NextResponse.json({ success: true, id: existing.id });
    }

    const { data, error } = await admin
      .from("app_settings")
      .insert([payload])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "settings_created",
      entity_type: "settings",
      entity_id: data?.id ?? null,
      meta: {
        changed_fields: Object.keys(body ?? {}),
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
