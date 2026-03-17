import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normaliseRole(value: unknown) {
  const role = clean(value).toLowerCase();
  if (role === "admin" || role === "staff" || role === "operator") return role;
  return "staff";
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const users =
      data?.users?.map((user) => ({
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at,
        role: String(user.user_metadata?.role ?? "staff"),
      })) ?? [];

    return NextResponse.json({ users });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load users." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await req.json().catch(() => null);

    const email = clean(body?.email).toLowerCase();
    const password = clean(body?.password);
    const role = normaliseRole(body?.role);
    const fullName = clean(body?.full_name);
    const phone = clean(body?.phone) || null;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        password_changed_at: new Date().toISOString(),
      },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    if (role === "operator" && created.user?.id) {
      const nameFromEmail = email.split("@")[0] || "Operator";

      const { error: insertOperatorError } = await supabase.from("operators").insert({
        full_name: fullName || nameFromEmail,
        email,
        phone,
        role: "operator",
        status: "active",
        archived: false,
        updated_at: new Date().toISOString(),
      });

      if (insertOperatorError) {
        return NextResponse.json(
          { error: insertOperatorError.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      user: {
        id: created.user?.id ?? null,
        email: created.user?.email ?? email,
        role,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not create user." },
      { status: 500 }
    );
  }
}
