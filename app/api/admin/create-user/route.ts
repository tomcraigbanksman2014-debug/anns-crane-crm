import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function toAuthEmail(username: string) {
  return `${username.toLowerCase()}@anns.local`;
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function POST(req: Request) {
  try {
    // 1) Must be logged in (session cookie)
    const supabaseSession = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseSession.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    // 2) Admin check (temporary: username === "tom")
    const me = fromAuthEmail(user.email ?? null);
    if (me !== "tom") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    // 3) Read input
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
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server missing Supabase env vars" },
        { status: 500 }
      );
    }

    // 4) Admin client (Service Role)
    const admin = createClient(supabaseUrl, serviceKey);

    const email = toAuthEmail(username);

    // 5) Create user in Supabase Auth
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // important so they can login immediately
      user_metadata: { role: "staff", username },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, userId: data.user?.id, username });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
