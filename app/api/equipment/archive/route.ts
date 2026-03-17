import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const equipmentId = String(body?.equipment_id ?? "").trim();

    if (!equipmentId) {
      return NextResponse.json(
        { error: "Equipment ID is required." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

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

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
