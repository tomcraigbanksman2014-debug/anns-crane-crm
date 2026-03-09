import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./lib/supabase/server";

export default async function Page() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}
