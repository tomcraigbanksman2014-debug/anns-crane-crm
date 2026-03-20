import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const form = await req.formData();
  const id = String(form.get("id") || "");

  if (!id) {
    return NextResponse.redirect(new URL("/customers", req.url));
  }

  const { data: customer } = await supabase
    .from("clients")
    .select("id, company_name")
    .eq("id", id)
    .single();

  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("client_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.redirect(new URL(`/customers/${id}/delete`, req.url));
  }

  await supabase.from("clients").delete().eq("id", id);

  await writeAuditLog({
    actor_user_id: userRes.user.id,
    actor_username: fromAuthEmail(userRes.user.email ?? null) || null,
    action: "customer_deleted",
    entity_type: "customer",
    entity_id: id,
    meta: {
      company_name: customer?.company_name ?? null,
    },
  });

  return NextResponse.redirect(new URL("/customers", req.url));
}
