import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type Payload = {
  mode: "create" | "edit";
  id: string | null;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Payload>;

    const mode = body.mode;
    const id = body.id ?? null;

    const company_name = (body.company_name ?? "").trim();
    const contact_name = (body.contact_name ?? null)?.trim() || null;
    const phone = (body.phone ?? null)?.trim() || null;
    const email = (body.email ?? null)?.trim() || null;
    const notes = (body.notes ?? null)?.trim() || null;

    if (mode !== "create" && mode !== "edit") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    if (!company_name) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    if (mode === "edit" && !id) {
      return NextResponse.json({ error: "Missing customer id" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    // Must be signed in
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (mode === "create") {
      const { data, error } = await supabase
        .from("clients")
        .insert([
          {
            company_name,
            contact_name,
            phone,
            email,
            notes,
          },
        ])
        .select("id")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, id: data?.id ?? null });
    }

    // edit
    const { error } = await supabase
      .from("clients")
      .update({
        company_name,
        contact_name,
        phone,
        email,
        notes,
      })
      .eq("id", id as string);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
