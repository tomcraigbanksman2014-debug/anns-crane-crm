import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getFreshMicrosoftGraphAccessToken,
  getMicrosoftSenderEmail,
  sendMicrosoftRawMimeMessage,
} from "./email/microsoftGraph";

function stripHeaderUnsafe(value: string) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  const clean = stripHeaderUnsafe(value);
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function toBase64(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function htmlEscape(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildMime(args: {
  fromEmail: string;
  toEmail: string;
  subject: string;
  plainText: string;
  html: string;
}) {
  const boundary = `alt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return [
    `From: ${encodeHeader("AnnS Crane Hire")} <${stripHeaderUnsafe(args.fromEmail)}>`,
    `To: ${stripHeaderUnsafe(args.toEmail)}`,
    `Subject: ${encodeHeader(args.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    toBase64(args.plainText),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    toBase64(args.html),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function sendSubcontractorOnboardingEmail(args: {
  admin: SupabaseClient;
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  buttonLabel?: string;
  buttonUrl?: string;
}) {
  const to = stripHeaderUnsafe(args.to).toLowerCase();
  if (!to || !to.includes("@")) {
    throw new Error("A valid recipient email address is required.");
  }

  const { accessToken, connection } = await getFreshMicrosoftGraphAccessToken(args.admin);
  const fromEmail = String((connection as any)?.email_address || getMicrosoftSenderEmail()).trim();
  const sendAsMe = (connection as any)?.mode === "delegated";

  const plainText = [
    args.heading,
    "",
    ...args.paragraphs,
    args.buttonUrl ? "" : null,
    args.buttonUrl ? `${args.buttonLabel || "Open form"}: ${args.buttonUrl}` : null,
    "",
    "AnnS Crane Hire",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const paragraphsHtml = args.paragraphs
    .map((paragraph) => `<p style="margin:0 0 14px;line-height:1.55;color:#1f2937">${htmlEscape(paragraph)}</p>`)
    .join("");

  const buttonHtml = args.buttonUrl
    ? `<p style="margin:24px 0"><a href="${htmlEscape(args.buttonUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">${htmlEscape(args.buttonLabel || "Open form")}</a></p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:28px 16px"><div style="background:#ffffff;border-radius:14px;padding:28px;border:1px solid #e5e7eb"><h1 style="font-size:24px;margin:0 0 18px;color:#111827">${htmlEscape(args.heading)}</h1>${paragraphsHtml}${buttonHtml}<p style="margin:24px 0 0;color:#6b7280;font-size:13px">AnnS Crane Hire</p></div></div></body></html>`;

  const mime = buildMime({
    fromEmail,
    toEmail: to,
    subject: args.subject,
    plainText,
    html,
  });

  return sendMicrosoftRawMimeMessage({
    accessToken,
    senderEmail: fromEmail,
    mime,
    sendAsMe,
  });
}
