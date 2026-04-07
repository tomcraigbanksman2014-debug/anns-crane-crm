import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;
    const body = await req.json().catch(() => null);
    const equipmentId = String(body?.equipmentId ?? "").trim();

    if (!equipmentId) {
      return NextResponse.json({ error: "Equipment id is required." }, { status: 400 });
    }

    const { error } = await supabase
      .from("equipment")
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", equipmentId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not archive equipment." },
      { status: 500 }
    );
  }
}
