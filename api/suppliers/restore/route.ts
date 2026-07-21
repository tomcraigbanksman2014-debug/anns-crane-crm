import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = String(body?.supplier_id ?? "");

  if (!id) {
    return NextResponse.json({ error: "Supplier ID required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from("suppliers")
    .update({ archived: false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
