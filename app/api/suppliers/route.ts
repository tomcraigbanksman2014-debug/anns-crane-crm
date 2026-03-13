import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("company_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ suppliers: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load suppliers." },
      { status: 400 }
    );
  }
}

export async function POST(req: Request) {
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

    if (!payload.company_name) {
      return NextResponse.json(
        { error: "Company name is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("suppliers")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (user) {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: user.email ? user.email.split("@")[0] : null,
        action: "create_supplier",
        entity_type: "supplier",
        entity_id: data.id,
        meta: payload,
      });
    }

    return NextResponse.json({ supplier: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not create supplier." },
      { status: 400 }
    );
  }
}
