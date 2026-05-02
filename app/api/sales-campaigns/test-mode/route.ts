import { NextResponse } from "next/server";
import { canCreateCustomers, getAccessContext } from "../../../lib/access";
import { isMasterAdminEmail } from "../../../lib/admin";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { writeAuditLog } from "../../../lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fromAuthEmail(email: string | null | undefined) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function isValidEmail(value: unknown) {
  const email = String(value ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function ensureSettings(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await admin
    .from("campaign_email_settings")
    .select("test_mode_enabled, test_recipient_email, updated_at, updated_by_username")
    .eq("id", true)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data) return data;

  const { data: inserted, error: insertError } = await admin
    .from("campaign_email_settings")
    .insert([{ id: true, test_mode_enabled: true, test_recipient_email: "sales@annscranehire.co.uk" }])
    .select("test_mode_enabled, test_recipient_email, updated_at, updated_by_username")
    .single();

  if (insertError) throw new Error(insertError.message);
  return inserted;
}

export async function GET() {
  try {
    const access = await getAccessContext();

    if (!access.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!canCreateCustomers(access)) {
      return NextResponse.json({ error: "You do not have permission to view campaign settings." }, { status: 403 });
    }

    const admin = createSupabaseAdminClient();
    const settings = await ensureSettings(admin);
    const isMaster = isMasterAdminEmail(access.user.email ?? null);

    return NextResponse.json({
      ok: true,
      testModeEnabled: Boolean((settings as any).test_mode_enabled),
      testRecipientEmail: String((settings as any).test_recipient_email || "sales@annscranehire.co.uk"),
      updatedAt: (settings as any).updated_at ?? null,
      updatedByUsername: (settings as any).updated_by_username ?? null,
      canUpdate: isMaster,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load campaign test mode settings." },
      { status: 400 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const access = await getAccessContext();

    if (!access.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!isMasterAdminEmail(access.user.email ?? null)) {
      return NextResponse.json({ error: "Only masteradmin can change campaign test mode." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const testModeEnabled = Boolean(body?.testModeEnabled);
    const testRecipientEmail = String(body?.testRecipientEmail ?? "").trim().toLowerCase();

    if (!isValidEmail(testRecipientEmail)) {
      return NextResponse.json({ error: "Enter a valid test recipient email." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const username = fromAuthEmail(access.user.email ?? null) || null;

    const { data, error } = await admin
      .from("campaign_email_settings")
      .upsert(
        {
          id: true,
          test_mode_enabled: testModeEnabled,
          test_recipient_email: testRecipientEmail,
          updated_at: new Date().toISOString(),
          updated_by_user_id: access.user.id,
          updated_by_username: username,
        },
        { onConflict: "id" }
      )
      .select("test_mode_enabled, test_recipient_email, updated_at, updated_by_username")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: access.user.id,
      actor_username: username,
      action: "campaign_test_mode_updated",
      entity_type: "campaign_email_settings",
      entity_id: "singleton",
      meta: {
        test_mode_enabled: testModeEnabled,
        test_recipient_email: testRecipientEmail,
      },
    });

    return NextResponse.json({
      ok: true,
      testModeEnabled: Boolean((data as any).test_mode_enabled),
      testRecipientEmail: String((data as any).test_recipient_email || "sales@annscranehire.co.uk"),
      updatedAt: (data as any).updated_at ?? null,
      updatedByUsername: (data as any).updated_by_username ?? null,
      canUpdate: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not save campaign test mode settings." },
      { status: 400 }
    );
  }
}
