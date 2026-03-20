import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  // Must be signed in
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Read form body
  const form = await req.formData();
  const id = String(form.get("id") || "");

  if (!id) {
    return NextResponse.redirect(new URL("/customers", req.url));
  }

  // Block delete if bookings exist
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("client_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.redirect(new URL(`/customers/${id}/delete`, req.url));
  }

  await supabase.from("clients").delete().eq("id", id);

  return NextResponse.redirect(new URL("/customers", req.url));
}
