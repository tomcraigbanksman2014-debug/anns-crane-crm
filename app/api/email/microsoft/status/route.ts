import { NextResponse } from "next/server";
import {
  getMicrosoftSenderEmail,
  microsoftDelegatedOAuthConfigured,
  microsoftGraphConfigured,
  readMicrosoftDelegatedConnection,
} from "../../../../lib/email/microsoftGraph";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readTestModeSettings() {
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("campaign_email_settings")
      .select("test_mode_enabled, test_recipient_email")
      .eq("id", true)
      .maybeSingle();

    return {
      testModeEnabled: (data as any)?.test_mode_enabled !== false,
      testRecipientEmail: String((data as any)?.test_recipient_email || "sales@annscranehire.co.uk"),
    };
  } catch {
    return {
      testModeEnabled: true,
      testRecipientEmail: "sales@annscranehire.co.uk",
    };
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET() {
  const testMode = await readTestModeSettings();
  const expectedEmail = getMicrosoftSenderEmail();

  try {
    const oauthConfigured = microsoftDelegatedOAuthConfigured();
    const appOnlyConfigured = microsoftGraphConfigured();

    let delegatedConnection: any = null;

    try {
      const admin = createSupabaseAdminClient();
      delegatedConnection = await readMicrosoftDelegatedConnection(admin);
    } catch {
      delegatedConnection = null;
    }

    if (delegatedConnection?.refresh_token) {
      return NextResponse.json({
        connected: true,
        configured: true,
        provider: "microsoft_delegated",
        emailAddress: delegatedConnection.email_address,
        expectedEmail,
        displayName: delegatedConnection.display_name ?? null,
        connectedByUsername: delegatedConnection.connected_by_username ?? null,
        updatedAt: formatDate(delegatedConnection.updated_at),
        connectedAt: formatDate(delegatedConnection.connected_at),
        mode: "delegated_mailbox",
        setupRequired: false,
        appOnlyConfigured,
        delegatedOAuthConfigured: oauthConfigured,
        campaignTestModeEnabled: testMode.testModeEnabled,
        campaignTestRecipientEmail: testMode.testRecipientEmail,
        message: `Microsoft mailbox connected as ${delegatedConnection.email_address}.`,
      });
    }

    return NextResponse.json({
      connected: false,
      configured: oauthConfigured,
      provider: "microsoft_delegated",
      emailAddress: null,
      expectedEmail,
      mode: "delegated_mailbox",
      setupRequired: true,
      appOnlyConfigured,
      delegatedOAuthConfigured: oauthConfigured,
      campaignTestModeEnabled: testMode.testModeEnabled,
      campaignTestRecipientEmail: testMode.testRecipientEmail,
      message: oauthConfigured
        ? `Microsoft OAuth is configured. Connect the ${expectedEmail} mailbox to enable campaign sending.`
        : "Microsoft OAuth is not configured until MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are added.",
    });
  } catch (error: any) {
    return NextResponse.json({
      connected: false,
      configured: false,
      provider: "microsoft_delegated",
      emailAddress: null,
      expectedEmail,
      mode: "delegated_mailbox",
      setupRequired: true,
      campaignTestModeEnabled: testMode.testModeEnabled,
      campaignTestRecipientEmail: testMode.testRecipientEmail,
      error: error?.message || "Could not check Microsoft mailbox status.",
    });
  }
}
