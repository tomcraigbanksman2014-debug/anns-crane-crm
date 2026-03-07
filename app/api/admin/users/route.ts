import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function toAuthEmail(username: string) {
  return `${normalizeUsername(username)}@anns.local`;
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey);
}

async function requireAdmin() {
  const supabaseSession = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabaseSession.auth.getUser();

  if (!user) {
    return { error: "Not signed in", status: 401 as const };
  }

  const myRole = (user.user_metadata as any)?.role ?? "";
  if (myRole !== "admin") {
    return { error: "Admin only", status: 403 as const };
  }

  return { user };
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const admin = getAdminClient();

    let page = 1;
    const perPage = 200;
    const allUsers: any[] = [];

    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const users = data?.users ?? [];
      allUsers.push(...users);

      if (users.length < perPage) break;
      page += 1;
    }

    const filtered = allUsers
      .filter((u) => (u.email ?? "").endsWith("@anns.local"))
      .map((u) => ({
        id: u.id,
        email: u.email ?? null,
        username:
          u.user_metadata?.username ||
          (u.email ? String(u.email).split("@")[0] : ""),
        role: u.user_metadata?.role || "staff",
        created_at: u.created_at ?? null,
        must_change_password: !!u.user_metadata?.must_change_password,
        password_changed_at: u.user_metadata?.password_changed_at ?? null,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));

    return NextResponse.json({ users: filtered });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const rawUsername = String(body?.username ?? "");
    const password = String(body?.password ?? "");
    const role = String(body?.role ?? "staff").trim().toLowerCase();

    const username = normalizeUsername(rawUsername);

    if (username.length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters" },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9._-]+$/.test(username)) {
      return NextResponse.json(
        {
          error:
            "Username can only contain letters, numbers, dots, underscores and hyphens",
        },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    if (!["staff", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be staff or admin" },
        { status: 400 }
      );
    }

    const admin = getAdminClient();
    const email = toAuthEmail(username);

    let page = 1;
    const perPage = 200;
    let existingFound = false;

    while (true) {
      const { data: listData, error: listError } =
        await admin.auth.admin.listUsers({
          page,
          perPage,
        });

      if (listError) {
        return NextResponse.json({ error: listError.message }, { status: 400 });
      }

      const users = listData?.users ?? [];
      if (users.some((u) => (u.email ?? "").toLowerCase() === email.toLowerCase())) {
        existingFound = true;
        break;
      }

      if (users.length < perPage) break;
      page += 1;
    }

    if (existingFound) {
      return NextResponse.json(
        { error: "That username already exists" },
        { status: 400 }
      );
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        username,
        must_change_password: true,
        password_changed_at: null,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      userId: data.user?.id,
      username,
      role,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
