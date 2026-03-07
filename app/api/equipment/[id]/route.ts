import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await req.json();

    const { error } = await supabase
      .from("equipment")
      .update({
        name: body.name ?? null,
        asset_number: body.asset_number ?? null,
        type: body.type ?? null,
        capacity: body.capacity ?? null,
        status: body.status ?? null,
        notes: body.notes ?? null,
      })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
