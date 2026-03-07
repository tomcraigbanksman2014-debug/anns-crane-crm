import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const role = (user.user_metadata as any)?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const body = await req.json();

    const { data: existing } = await supabase
      .from("app_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("app_settings")
        .update(body)
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, id: existing.id });
    }

    const { data, error } = await supabase
      .from("app_settings")
      .insert([body])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Bad request" },
      { status: 400 }
    );
  }
}
