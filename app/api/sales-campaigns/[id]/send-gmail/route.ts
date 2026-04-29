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
} from "../../../../lib/email/gmail";

type DraftInput = {
  target_type?: "lead" | "customer" | "supplier";
  target_id?: string;
  company_name?: string;
  contact_name?: string;
  channel?: string;
  subject?: string;
  body?: string;
  target_email?: string | null;
};

type CampaignImageAttachment = {
  filename: string;
  mimeType: string;
  cid: string;
  base64: string;
  size: number;
};

const MAX_CAMPAIGN_IMAGES = 5;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

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

function stripHeaderUnsafe(value: string) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  const safe = stripHeaderUnsafe(value);
  if (!safe) return "";
  if (/^[\x20-\x7E]*$/.test(safe)) return safe;
  return `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

function sanitizeFilename(value: string, fallback: string) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 90);

  return cleaned || fallback;
}

function foldBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function toBase64(value: string) {
  return foldBase64(Buffer.from(value, "utf8").toString("base64"));
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value;
}

async function readCampaignImages(formData: FormData) {
  const files = formData.getAll("images").filter(isFile);

  if (files.length > MAX_CAMPAIGN_IMAGES) {
    throw new Error(`Maximum ${MAX_CAMPAIGN_IMAGES} campaign images allowed.`);
  }

  const attachments: CampaignImageAttachment[] = [];
  let totalBytes = 0;

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const mimeType = String(file.type || "application/octet-stream").toLowerCase();

    if (!mimeType.startsWith("image/")) {
      throw new Error("Only image files can be attached to campaign emails.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    totalBytes += buffer.byteLength;

    if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
      throw new Error("Campaign images are too large. Keep total image size under 20MB.");
    }

    attachments.push({
      filename: sanitizeFilename(file.name, `campaign-image-${i + 1}`),
      mimeType,
      cid: `campaign-image-${i + 1}-${Date.now()}@annscranehire`,
      base64: foldBase64(buffer.toString("base64")),
      size: buffer.byteLength,
    });
  }

  return attachments;
}

function campaignImageHtml(images: CampaignImageAttachment[]) {
  if (!images.length) return "";

  const blocks = images
    .map(
      (image) => `
        <div style="margin:16px 0;">
          <img
            src="cid:${image.cid}"
            alt="${image.filename.replace(/"/g, "&quot;")}"
            style="display:block;max-width:100%;height:auto;border-radius:12px;border:1px solid #e5e7eb;"
          />
        </div>`
    )
    .join("");

  return `
    <div style="margin-top:18px;">
      ${blocks}
    </div>`;
}

function injectCampaignImagesIntoHtml(html: string, images: CampaignImageAttachment[]) {
  if (!images.length) return html;

  const gallery = campaignImageHtml(images);

  if (html.includes("</body>")) {
    return html.replace("</body>", `${gallery}</body>`);
  }

  return `${html}${gallery}`;
}

function buildMimeMessage(args: {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  plainText: string;
  html: string;
  images: CampaignImageAttachment[];
}) {
  const mixedBoundary = `mixed_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const relatedBoundary = `related_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const alternativeBoundary = `alt_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const lines: string[] = [];

  lines.push(`From: ${encodeHeader(args.fromName)} <${stripHeaderUnsafe(args.fromEmail)}>`);
  lines.push(`To: ${stripHeaderUnsafe(args.toEmail)}`);
  lines.push(`Subject: ${encodeHeader(args.subject)}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
  lines.push("");

  lines.push(`--${mixedBoundary}`);
  lines.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"`);
  lines.push("");

  lines.push(`--${relatedBoundary}`);
  lines.push(`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`);
  lines.push("");

  lines.push(`--${alternativeBoundary}`);
  lines.push(`Content-Type: text/plain; charset="UTF-8"`);
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(toBase64(args.plainText));
  lines.push("");

  lines.push(`--${alternativeBoundary}`);
  lines.push(`Content-Type: text/html; charset="UTF-8"`);
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(toBase64(args.html));
  lines.push("");

  lines.push(`--${alternativeBoundary}--`);
  lines.push("");

  for (const image of args.images) {
    lines.push(`--${relatedBoundary}`);
    lines.push(`Content-Type: ${image.mimeType}; name="${sanitizeFilename(image.filename, "campaign-image")}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-ID: <${image.cid}>`);
    lines.push(`Content-Disposition: inline; filename="${sanitizeFilename(image.filename, "campaign-image")}"`);
    lines.push("");
    lines.push(image.base64);
    lines.push("");
  }

  lines.push(`--${relatedBoundary}--`);
  lines.push("");
  lines.push(`--${mixedBoundary}--`);
  lines.push("");

  return lines.join("\r\n");
}

async function sendGmailMimeMessage(args: {
  accessToken: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  plainText: string;
  html: string;
  images: CampaignImageAttachment[];
}) {
  const mime = buildMimeMessage(args);
  const raw = toBase64Url(mime);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error?.message || "Gmail send failed.");
  }

  return {
    id: String(data?.id ?? ""),
    threadId: String(data?.threadId ?? ""),
  };
}

async function readRequestPayload(req: Request) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const draftsRaw = String(formData.get("drafts") ?? "[]");
    const drafts = JSON.parse(draftsRaw);
    const batchLimit = Number(formData.get("batch_limit") ?? DEFAULT_GMAIL_BATCH_LIMIT);
    const images = await readCampaignImages(formData);

    return {
      drafts: Array.isArray(drafts) ? drafts : [],
      batchLimit,
      images,
    };
  }

  const body = await req.json().catch(() => ({}));

  return {
    drafts: Array.isArray(body?.drafts) ? (body.drafts as DraftInput[]) : [],
    batchLimit: Number(body?.batch_limit ?? DEFAULT_GMAIL_BATCH_LIMIT),
    images: [] as CampaignImageAttachment[],
  };
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

    const payload = await readRequestPayload(req);

    const drafts = payload.drafts;
    const batchLimit = Math.min(
      DEFAULT_GMAIL_BATCH_LIMIT,
      Math.max(1, Number(payload.batchLimit || DEFAULT_GMAIL_BATCH_LIMIT))
    );
    const campaignImages = payload.images;

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
      const baseHtml = buildFormattedEmailHtml({
        body: String(draft.body ?? ""),
        origin,
      });
      const html = injectCampaignImagesIntoHtml(baseHtml, campaignImages);

      try {
        const result = await sendGmailMimeMessage({
          accessToken,
          fromEmail: senderEmail,
          fromName: "AnnS Crane Hire",
          toEmail,
          subject,
          plainText,
          html,
          images: campaignImages,
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
        image_count: campaignImages.length,
        image_total_bytes: campaignImages.reduce((sum, image) => sum + image.size, 0),
      },
    });

    return NextResponse.json({
      ok: true,
      senderEmail,
      batchLimit,
      requestedCount: drafts.length,
      processedCount: selectedDrafts.length,
      remainingCount: Math.max(0, drafts.length - selectedDrafts.length),
      imageCount: campaignImages.length,
      imageFilenames: campaignImages.map((image) => image.filename),
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
