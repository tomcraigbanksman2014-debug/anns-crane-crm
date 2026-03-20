import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = String(body?.customer_id ?? "");

  if (!id) {
    return NextResponse.json({ error: "Customer ID required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: customer, error: customerError } = await supabase
    .from("clients")
    .select("id, company_name, archived")
    .eq("id", id)
    .single();

  if (customerError || !customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("clients")
    .update({ archived: true })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditLog({
    actor_user_id: auth.user.id,
    actor_username: fromAuthEmail(auth.user.email ?? null) || null,
    action: "customer_archived",
    entity_type: "customer",
    entity_id: id,
    meta: {
      company_name: customer.company_name ?? null,
    },
  });

  return NextResponse.json({ success: true });
}
