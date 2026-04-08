export const SHARED_EMAIL_SIGNATURE_LINES = [
  "Kind regards",
  "Tom Craig",
  "Ann’s Crane Hire Ltd",
  "",
  "📞 01792 641653",
  "📧 info@annscranehire.co.uk",
  "https://www.linkedin.com/company/annscranehire/",
  "📍 6 Bay Street, Port Tennant, Swansea, SA1 8LB",
];

export const SHARED_EMAIL_SIGNATURE_TEXT = SHARED_EMAIL_SIGNATURE_LINES.join("\n");

const PROMPT_LEAK_PATTERNS: RegExp[] = [
  /This is an existing customer called[^.]*\.?/gi,
  /This is an existing lead called[^.]*\.?/gi,
  /This is a returning customer called[^.]*\.?/gi,
  /This is a returning lead called[^.]*\.?/gi,
  /Relationship history:[^.]*\.?/gi,
  /Write as an availability push[^.]*\.?/gi,
  /Write as a warm reactivation[^.]*\.?/gi,
  /Write as a professional follow[- ]up[^.]*\.?/gi,
  /Write as an introduction[^.]*\.?/gi,
  /Write as a follow[- ]up[^.]*\.?/gi,
  /Write the message like[^.]*\.?/gi,
  /Keep it commercially useful, warm and professional\.?/gi,
  /Previous relationship summary:[^.]*\.?/gi,
  /Most recent crane job:[^.]*\.?/gi,
  /Most recent transport job:[^.]*\.?/gi,
  /Most recent logged contact:[^.]*\.?/gi,
  /\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g,
  /\{\s*[a-zA-Z0-9_]+\s*\}/g,
];

export function cleanWhitespace(value: string) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function stripPromptLeakage(value: string) {
  let output = String(value ?? "");

  for (const pattern of PROMPT_LEAK_PATTERNS) {
    output = output.replace(pattern, "");
  }

  return cleanWhitespace(output);
}

export function stripTrailingSignoff(value: string) {
  return String(value ?? "")
    .replace(/\n*(kind regards|best regards|regards|many thanks|thanks)[\s\S]*$/i, "")
    .trim();
}

export function normaliseDraftSubject(value: string) {
  return cleanWhitespace(stripPromptLeakage(String(value ?? "")).replace(/^[\[{]+|[\]}]+$/g, ""));
}

export function normaliseDraftBody(value: string) {
  return cleanWhitespace(stripTrailingSignoff(stripPromptLeakage(String(value ?? ""))));
}

function escapeHtml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlParagraphsFromPlainText(value: string) {
  const cleaned = normaliseDraftBody(value);
  if (!cleaned) return "";

  return cleaned
    .split(/\n\n+/)
    .map((paragraph) => `<p style=\"margin:0 0 14px 0;\">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function buildSharedEmailSignatureHtml(origin?: string | null) {
  const safeOrigin = String(origin ?? "").trim().replace(/\/$/, "");
  const logoUrl = safeOrigin ? `${safeOrigin}/logo.png` : "";
  const emailHref = "mailto:info@annscranehire.co.uk";
  const linkedInHref = "https://www.linkedin.com/company/annscranehire/";

  return `
<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin-top:18px;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:16px;color:#111;\">
  <tr>
    <td style=\"padding:0 0 6px 0;\">Kind regards</td>
  </tr>
  <tr>
    <td style=\"padding:0 0 12px 0;font-size:18px;font-weight:700;\">Tom Craig</td>
  </tr>
  <tr>
    <td style=\"padding:0 0 14px 0;\">Ann’s Crane Hire Ltd</td>
  </tr>
  <tr>
    <td style=\"padding:0 0 6px 0;\">📞 01792 641653</td>
  </tr>
  <tr>
    <td style=\"padding:0 0 6px 0;\">📧 <a href=\"${emailHref}\" style=\"color:#0b57d0;text-decoration:underline;\">info@annscranehire.co.uk</a></td>
  </tr>
  <tr>
    <td style=\"padding:0 0 6px 0;\"><a href=\"${linkedInHref}\" style=\"color:#0b57d0;text-decoration:underline;\">https://www.linkedin.com/company/annscranehire/</a></td>
  </tr>
  <tr>
    <td style=\"padding:0 0 14px 0;\">📍 6 Bay Street, Port Tennant, Swansea, SA1 8LB</td>
  </tr>
  ${logoUrl ? `<tr><td style=\"padding-top:8px;\"><img src=\"${logoUrl}\" alt=\"Ann’s Crane Hire Ltd\" style=\"display:block;max-width:460px;width:100%;height:auto;border:0;\" /></td></tr>` : ""}
</table>`.trim();
}

export function buildFormattedEmailHtml(args: { body: string; origin?: string | null }) {
  const bodyHtml = htmlParagraphsFromPlainText(args.body);
  const signatureHtml = buildSharedEmailSignatureHtml(args.origin);

  return `
<div style=\"font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.5;color:#111;\">
  ${bodyHtml}
  ${signatureHtml}
</div>`.trim();
}
