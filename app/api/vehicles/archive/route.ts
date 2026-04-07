import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;
    const body = await req.json().catch(() => null);
    const vehicleId = String(body?.vehicleId ?? "").trim();

    if (!vehicleId) {
      return NextResponse.json({ error: "Vehicle id is required." }, { status: 400 });
    }

    const { error } = await supabase
      .from("vehicles")
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", vehicleId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not archive vehicle." },
      { status: 500 }
    );
  }
}
