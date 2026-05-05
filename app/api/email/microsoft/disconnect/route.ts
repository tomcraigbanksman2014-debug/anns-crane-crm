import { NextResponse } from "next/server";
import { disconnectMicrosoftDelegatedConnection } from "../../../../lib/email/microsoftGraph";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { requireAdminApi } from "../../../../lib/routeGuards";
import { writeAuditLog } from "../../../../lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fromAuthEmail(email: string | null | undefined) {
  const raw = String(email ?? "").trim();
  if (!raw) return "";
  return raw.includes("@") ? raw.split("@")[0] : raw;
}

export async function POST() {
  const auth = await requireAdminApi();

  if (auth.response) return auth.response;

  try {
    const admin = createSupabaseAdminClient();

    await disconnectMicrosoftDelegatedConnection(admin);

    await writeAuditLog({
      actor_user_id: auth.ctx?.user?.id ?? null,
      actor_username: fromAuthEmail(auth.ctx?.user?.email ?? null) || null,
      action: "microsoft_mailbox_disconnected",
      entity_type: "email_connection",
      entity_id: "microsoft_delegated",
      meta: {
        provider: "microsoft_delegated",
      },
    });

    return NextResponse.json({
      success: true,
      connected: false,
      message: "Microsoft mailbox disconnected.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Could not disconnect Microsoft mailbox.",
      },
      { status: 500 }
    );
  }
}
