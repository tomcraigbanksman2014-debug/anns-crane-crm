import { NextResponse } from "next/server";
import { canCreateCustomers, getAccessContext } from "../../../../lib/access";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { writeAuditLog } from "../../../../lib/audit";
import { GMAIL_PROVIDER, getGmailSenderEmail } from "../../../../lib/email/gmail";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function DELETE() {
  try {
    const access = await getAccessContext();

    if (!access.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!canCreateCustomers(access)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

    const admin = createSupabaseAdminClient();
    const email = getGmailSenderEmail();

    const { data: existing } = await admin
      .from("email_oauth_connections")
      .select("id")
      .eq("provider", GMAIL_PROVIDER)
      .eq("email_address", email)
      .maybeSingle();

    const { error } = await admin
      .from("email_oauth_connections")
      .delete()
      .eq("provider", GMAIL_PROVIDER)
      .eq("email_address", email);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAuditLog({
      actor_user_id: access.user.id,
      actor_username: fromAuthEmail(access.user.email ?? null) || null,
      action: "gmail_sender_disconnected",
      entity_type: "email_oauth_connection",
      entity_id: existing?.id ?? null,
      meta: { provider: GMAIL_PROVIDER, email_address: email },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not disconnect Gmail." }, { status: 500 });
  }
}
