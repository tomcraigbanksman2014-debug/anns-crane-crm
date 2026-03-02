import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type Payload = {
  mode: "create" | "edit";
  id: string | null;
  name: string;
  asset_number: string | null;
  type: string | null;
  capacity: string | null;
  status: string;
  certification_expires_on: string | null;
  notes: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Payload>;

    const mode = body.mode;
    const id = body.id ?? null;

    const name = (body.name ?? "").trim();
    const asset_number = (body.asset_number ?? null)?.trim() || null;
    const type = (body.type ?? null)?.trim() || null;
    const capacity = (body.capacity ?? null)?.trim() || null;
    const status = body.status ?? "available";
    const certification_expires_on =
      (body.certification_expires_on ?? null) || null;
    const notes = (body.notes ?? null)?.trim() || null;

    if (mode !== "create" && mode !== "edit") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (mode === "edit" && !id) {
      return NextResponse.json({ error: "Missing equipment id" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    // Must be signed in
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (mode === "create") {
      const { error } = await supabase.from("equipment").insert([
        {
          name,
          asset_number,
          type,
          capacity,
          status,
          certification_expires_on,
          notes,
        },
      ]);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    // edit
    const { error } = await supabase
      .from("equipment")
      .update({
        name,
        asset_number,
        type,
        capacity,
        status,
        certification_expires_on,
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
