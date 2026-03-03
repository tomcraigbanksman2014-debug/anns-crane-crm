import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
      return NextResponse.json({ error: userErr.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    // Admin check (matches your current approach)
    const me = fromAuthEmail(user.email ?? null);
    if (me !== "tom") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    // List staff users from your staff_users table (adjust fields if needed)
    const { data, error } = await supabase
      .from("staff_users")
      .select("id, username, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ users: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
