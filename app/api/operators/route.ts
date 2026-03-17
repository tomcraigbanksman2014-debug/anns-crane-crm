import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normaliseStatus(value: unknown) {
  const status = clean(value).toLowerCase();
  if (status === "active" || status === "inactive") return status;
  return "active";
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("operators")
      .select("*")
      .order("full_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ operators: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load operators." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await req.json().catch(() => null);

    const fullName = clean(body?.full_name);
    const email = clean(body?.email) || null;
    const phone = clean(body?.phone) || null;
    const role = clean(body?.role) || null;
    const status = normaliseStatus(body?.status);
    const notes = clean(body?.notes) || null;

    if (!fullName) {
      return NextResponse.json(
        { error: "Full name is required." },
        { status: 400 }
      );
    }

    const payload = {
      full_name: fullName,
      email,
      phone,
      role,
      status,
      notes,
      archived: false,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("operators")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ operator: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not create operator." },
      { status: 500 }
    );
  }
}
