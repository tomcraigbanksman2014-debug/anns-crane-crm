import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase/server";

export async function requireApiUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      supabase,
      user: null,
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    } as const;
  }

  return {
    supabase,
    user,
    response: null,
  } as const;
}
