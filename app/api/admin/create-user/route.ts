import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { isMasterAdminEmail } from "../../../lib/admin";
import { writeAuditLog } from "../../../lib/audit";

function toAuthEmail(username: string) {
  return `${username.toLowerCase()}@anns.local`;
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function POST(req: Request) {
  try {
    const supabaseSession = createSupabaseServerClient();
    const { data, error: userErr } = await supabaseSession.auth.getUser();

    if (userErr) {
      return NextResponse.json({ error: userErr.message }, { status: 401 });
    }

    const user = data.user;
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const role = (user.user_metadata as any)?.role ?? null;
    const isAdmin = role === "admin" || isMasterAdminEmail(user.email ?? null);

    if (!isAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (username.length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey =
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !secretKey) {
      return NextResponse.json(
        {
          error:
            "Server missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)",
        },
        { status: 500 }
      );
    }

    const admin = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const email = toAuthEmail(username);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "staff", username },
    });

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 400 });
    }

    if (created.user?.id) {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_username: fromAuthEmail(user.email ?? null) || null,
        action: "staff_account_created",
        entity_type: "staff_user",
        entity_id: created.user.id,
        meta: {
          username,
          email,
          role: "staff",
        },
      });
    }

    return NextResponse.json({
      success: true,
      userId: created.user?.id ?? null,
      username,
      email,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
