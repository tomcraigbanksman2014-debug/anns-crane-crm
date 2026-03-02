import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { company_name, contact_name, phone, email, notes } = body;

    if (!company_name || !company_name.trim()) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    const { error } = await supabase.from("clients").insert([
      {
        company_name: company_name.trim(),
        contact_name: contact_name || null,
        phone: phone || null,
        email: email || null,
        notes: notes || null,
      },
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
