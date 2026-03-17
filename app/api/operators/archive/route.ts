import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await req.json().catch(() => null);
    const operatorId = String(body?.operatorId ?? "").trim();

    if (!operatorId) {
      return NextResponse.json({ error: "Operator id is required." }, { status: 400 });
    }

    const { error } = await supabase
      .from("operators")
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", operatorId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not archive operator." },
      { status: 500 }
    );
  }
}
