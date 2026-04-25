import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { getGmailSenderEmail, getStoredGmailConnection } from "../../../../lib/email/gmail";

export async function GET() {
  try {
    const authSupabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();

    if (!user) return NextResponse.json({ connected: false, error: "Not authenticated" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const connection = await getStoredGmailConnection(admin);

    return NextResponse.json({
      connected: Boolean(connection?.refresh_token || connection?.access_token),
      emailAddress: connection?.email_address ?? getGmailSenderEmail(),
      expectedEmail: getGmailSenderEmail(),
      expiryDate: connection?.expiry_date ?? null,
      connectedByUsername: connection?.connected_by_username ?? null,
      updatedAt: connection?.updated_at ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        connected: false,
        expectedEmail: getGmailSenderEmail(),
        error: e?.message || "Could not check Gmail connection.",
      },
      { status: 200 }
    );
  }
}
