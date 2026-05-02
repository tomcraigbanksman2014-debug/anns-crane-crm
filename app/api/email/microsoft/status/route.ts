import { NextResponse } from "next/server";
import { getMicrosoftSenderEmail, microsoftGraphConfigured } from "../../../../lib/email/microsoftGraph";
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

export async function GET() {
  const testMode = await readTestModeSettings();

  try {
    const configured = microsoftGraphConfigured();
    return NextResponse.json({
      connected: configured,
      configured,
      provider: "microsoft_graph",
      emailAddress: getMicrosoftSenderEmail(),
      expectedEmail: getMicrosoftSenderEmail(),
      mode: "application_permissions",
      setupRequired: !configured,
      campaignTestModeEnabled: testMode.testModeEnabled,
      campaignTestRecipientEmail: testMode.testRecipientEmail,
      message: configured
        ? "Microsoft Graph sending is configured."
        : "Microsoft Graph sending is not configured until MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET and MICROSOFT_SENDER_EMAIL are added.",
    });
  } catch (error: any) {
    return NextResponse.json({
      connected: false,
      configured: false,
      provider: "microsoft_graph",
      emailAddress: getMicrosoftSenderEmail(),
      expectedEmail: getMicrosoftSenderEmail(),
      mode: "application_permissions",
      setupRequired: true,
      campaignTestModeEnabled: testMode.testModeEnabled,
      campaignTestRecipientEmail: testMode.testRecipientEmail,
      error: error?.message || "Could not check Microsoft Graph configuration.",
    });
  }
}
