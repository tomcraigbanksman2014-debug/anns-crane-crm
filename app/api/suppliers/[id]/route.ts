import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await req.json().catch(() => ({}));

    const payload = {
      company_name: clean(body.company_name),
      contact_name: clean(body.contact_name),
      phone: clean(body.phone),
      email: clean(body.email),
      address: clean(body.address),
      notes: clean(body.notes),
      status: clean(body.status) ?? "active",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("suppliers")
      .update(payload)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (user) {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "update_supplier",
        entity_type: "supplier",
        entity_id: params.id,
        meta: payload,
      });
    }

    return NextResponse.json({ supplier: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update supplier." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("suppliers").delete().eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (user) {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "delete_supplier",
        entity_type: "supplier",
        entity_id: params.id,
        meta: null,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not delete supplier." },
      { status: 400 }
    );
  }
}
