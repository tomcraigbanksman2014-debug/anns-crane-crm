import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = String(body?.customer_id ?? "");

  if (!id) {
    return NextResponse.json({ error: "Customer ID required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from("clients")
    .update({ archived: false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
