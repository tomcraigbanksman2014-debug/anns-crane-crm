import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = String(body?.quote_id ?? "");

  if (!id) {
    return NextResponse.json({ error: "Quote ID required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, client_id, subject, status, amount, quote_date, valid_until")
    .eq("id", id)
    .single();

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("quotes")
    .update({ archived: true })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAuditLog({
    actor_user_id: auth.user.id,
    actor_username: fromAuthEmail(auth.user.email ?? null) || null,
    action: "quote_archived",
    entity_type: "quote",
    entity_id: id,
    meta: {
      client_id: quote.client_id ?? null,
      subject: quote.subject ?? null,
      status: quote.status ?? null,
      amount: quote.amount ?? null,
      quote_date: quote.quote_date ?? null,
      valid_until: quote.valid_until ?? null,
    },
  });

  return NextResponse.json({ success: true });
}
