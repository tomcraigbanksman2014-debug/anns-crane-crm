import type { SupabaseClient } from "@supabase/supabase-js";
import { getFreshMicrosoftGraphAccessToken, getMicrosoftSenderEmail, sendMicrosoftRawMimeMessage } from "./email/microsoftGraph";

function cleanHeader(value: string) { return String(value || "").replace(/[\r\n]+/g, " ").trim(); }
function enc(value: string) { return `=?UTF-8?B?${Buffer.from(cleanHeader(value), "utf8").toString("base64")}?=`; }
function b64(value: string) { return Buffer.from(value, "utf8").toString("base64"); }
function esc(value: string) { return String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

export async function sendShaunDiaryEmail(args: { admin: SupabaseClient; to: string; subject: string; summary: string; }) {
  const to = cleanHeader(args.to).toLowerCase();
  if (!to.includes("@")) throw new Error("A valid recipient email address is required.");
  const { accessToken, connection } = await getFreshMicrosoftGraphAccessToken(args.admin);
  const from = String((connection as any)?.email_address || getMicrosoftSenderEmail()).trim();
  const sendAsMe = (connection as any)?.mode === "delegated";
  const boundary = `diary_${Date.now()}`;
  const html = `<html><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:24px"><div style="max-width:680px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px"><h1 style="margin-top:0">Shaun's Diary Schedule</h1><pre style="white-space:pre-wrap;font:14px/1.55 Arial,sans-serif">${esc(args.summary)}</pre></div></body></html>`;
  const mime = [
    `From: ${enc("AnnS Crane Hire")} <${cleanHeader(from)}>`,
    `To: ${to}`,
    `Subject: ${enc(args.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(args.summary), "",
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(html), "",
    `--${boundary}--`, ""
  ].join("\r\n");
  return sendMicrosoftRawMimeMessage({ accessToken, senderEmail: from, mime, sendAsMe });
}
