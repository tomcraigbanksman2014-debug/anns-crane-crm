import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();

    const { company_name, contact_name, phone, email, notes } = body;

    if (!company_name) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("clients").insert({
      company_name,
      contact_name,
      phone,
      email,
      notes,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
