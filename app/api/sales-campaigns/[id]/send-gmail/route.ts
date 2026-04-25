import { NextResponse } from "next/server";
import { canCreateCustomers, getAccessContext } from "../../../../lib/access";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { writeAuditLog } from "../../../../lib/audit";
import {
  buildFormattedEmailHtml,
  normaliseDraftBody,
  normaliseDraftSubject,
  SHARED_EMAIL_SIGNATURE_TEXT,
} from "../../../../lib/emailSignature";
import {
  DEFAULT_GMAIL_BATCH_LIMIT,
  getFreshGmailAccessToken,
  getGmailSenderEmail,
  sendGmailMessage,
} from "../../../../lib/email/gmail";

type DraftInput = {
  target_type?: "lead" | "customer";
  target_id?: string;
  company_name?: string;
  contact_name?: string;
  channel?: string;
  subject?: string;
  body?: string;
  target_email?: string | null;
};

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function getOrigin(req: Request) {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function keyForDraft(draft: DraftInput, index: number) {
  const type = String(draft.target_type ?? "target");
  const id = String(draft.target_id ?? index);
  return `${type}:${id}`;
}

function plainTextWithSignature(body: string) {
  const cleaned = normaliseDraftBody(body);
  if (!cleaned) return SHARED_EMAIL_SIGNATURE_TEXT;
  return `${cleaned}\n\n${SHARED_EMAIL_SIGNATURE_TEXT}`;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const access = await getAccessContext();

    if (!access.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!canCreateCustomers(access)) {
      return NextResponse.json({ error: "You do not have permission to send campaign emails." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const drafts = Array.isArray(body?.drafts) ? (body.drafts as DraftInput[]) : [];
    const batchLimit = Math.min(
      DEFAULT_GMAIL_BATCH_LIMIT,
      Math.max(1, Number(body?.batch_limit ?? DEFAULT_GMAIL_BATCH_LIMIT))
    );

    if (!drafts.length) {
      return NextResponse.json({ error: "No email drafts supplied." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    const { data: campaign, error: campaignError } = await admin
      .from("sales_campaigns")
      .select("id, name, channel")
      .eq("id", params.id)
      .maybeSingle();

    if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 400 });
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

    const { accessToken, connection } = await getFreshGmailAccessToken(admin);
    const senderEmail = getGmailSenderEmail();

    const sent: Array<{ key: string; to: string; messageId: string; threadId: string }> = [];
    const failed: Array<{ key: string; to: string | null; error: string }> = [];
    const skipped: Array<{ key: string; reason: string }> = [];

    const selectedDrafts = drafts.slice(0, batchLimit);
    const origin = getOrigin(req);

    for (let i = 0; i < selectedDrafts.length; i += 1) {
      const draft = selectedDrafts[i];
      const key = keyForDraft(draft, i);

      if (String(draft.channel ?? "email").toLowerCase() !== "email") {
        skipped.push({ key, reason: "Draft is not an email channel draft." });
        continue;
      }

      const toEmail = cleanEmail(draft.target_email);
      if (!toEmail) {
        skipped.push({ key, reason: "No valid recipient email address." });
        continue;
      }

      const subject = normaliseDraftSubject(String(draft.subject ?? "")) || "AnnS Crane Hire";
      const plainText = plainTextWithSignature(String(draft.body ?? ""));
      const html = buildFormattedEmailHtml({
        body: String(draft.body ?? ""),
        origin,
      });

      try {
        const result = await sendGmailMessage({
          accessToken,
          fromEmail: senderEmail,
          fromName: "AnnS Crane Hire",
          toEmail,
          subject,
          plainText,
          html,
        });

        sent.push({
          key,
          to: toEmail,
          messageId: result.id,
          threadId: result.threadId,
        });
      } catch (e: any) {
        failed.push({
          key,
          to: toEmail,
          error: e?.message || "Gmail send failed.",
        });
      }
    }

    await writeAuditLog({
      actor_user_id: access.user.id,
      actor_username: fromAuthEmail(access.user.email ?? null) || null,
      action: "sales_campaign_gmail_batch_sent",
      entity_type: "sales_campaign",
      entity_id: params.id,
      meta: {
        campaign_name: (campaign as any).name ?? null,
        gmail_connection_id: connection.id,
        sender_email: senderEmail,
        requested_count: drafts.length,
        batch_count: selectedDrafts.length,
        sent_count: sent.length,
        failed_count: failed.length,
        skipped_count: skipped.length,
      },
    });

    return NextResponse.json({
      ok: true,
      senderEmail,
      batchLimit,
      requestedCount: drafts.length,
      processedCount: selectedDrafts.length,
      remainingCount: Math.max(0, drafts.length - selectedDrafts.length),
      sent,
      failed,
      skipped,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not send campaign emails through Gmail." },
      { status: 500 }
    );
  }
}
