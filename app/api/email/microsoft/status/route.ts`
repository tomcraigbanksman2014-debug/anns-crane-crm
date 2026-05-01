import { NextResponse } from "next/server";
import { getMicrosoftSenderEmail, microsoftGraphConfigured } from "../../../../lib/email/microsoftGraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
      setupRequired: true,
      error: error?.message || "Could not check Microsoft Graph configuration.",
    });
  }
}
