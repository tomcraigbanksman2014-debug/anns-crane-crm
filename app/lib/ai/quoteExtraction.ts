import { getEmptyStructuredQuoteFields, type StructuredQuoteFields } from "../../quotes/quoteTemplate";

export type QuoteExtractionResult = {
  customerName: string;
  amount: string;
  subject: string;
  fields: StructuredQuoteFields;
  missing: string[];
};

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : "";
}

function normaliseWhitespace(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function tryParseJsonObject(text: string) {
  const trimmed = text.trim();
  const candidates: string[] = [];

  if (trimmed.startsWith("{")) candidates.push(trimmed);

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  throw new Error("AI response did not contain valid JSON.");
}

function pickFirstMoney(text: string) {
  const match = text.match(/£\s?([\d,.]+(?:\.\d{1,2})?)/i);
  return match ? match[1].replace(/,/g, "") : "";
}

function pickFirstPhone(text: string) {
  const match = text.match(/(?:\+44\s?7\d{3}|0\d{4}|0\d{3}|0\d{2})[\d\s]{6,12}/);
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
}

function pickLineAfterLabel(text: string, labels: string[]) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const lower = line.toLowerCase();
    for (const label of labels) {
      const labelLower = label.toLowerCase();
      if (lower.startsWith(`${labelLower}:`)) {
        return line.slice(label.length + 1).trim();
      }
      if (lower === labelLower && lines[i + 1]?.trim()) {
        return lines[i + 1].trim();
      }
    }
  }
  return "";
}

function inferHireType(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("contract lift")) {
    return "Contract lift (subject to CPA contract lift term and conditions)";
  }
  if (lower.includes("hiab")) return "HIAB hire / transport";
  if (lower.includes("crane hire")) return "Crane hire only";
  if (lower.includes("transport")) return "Transport / haulage";
  return "";
}

function fallbackExtract(text: string): QuoteExtractionResult {
  const raw = normaliseWhitespace(text);
  const fields = getEmptyStructuredQuoteFields();
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);

  const customerName = pickLineAfterLabel(raw, ["client", "customer", "company"]);
  const subject =
    pickLineAfterLabel(raw, ["subject", "re", "project", "site location"]) ||
    lines.find((line) => line.length > 8 && !line.includes("@") && !line.startsWith("From:")) ||
    "";

  fields.contactName = pickLineAfterLabel(raw, ["contact", "contact name", "attn"]) || "";
  fields.contactPhone = pickLineAfterLabel(raw, ["tel", "phone", "telephone", "mobile"]) || pickFirstPhone(raw);
  fields.projectDateTime = pickLineAfterLabel(raw, ["date & time of project", "date and time of project", "project date", "date/time"]) || pickLineAfterLabel(raw, ["date"]);
  fields.siteLocation = pickLineAfterLabel(raw, ["site location", "site", "project", "job location"]);
  fields.hireType = inferHireType(raw);
  fields.toSupply = pickLineAfterLabel(raw, ["to supply", "supply", "equipment required"]);
  fields.scopeOfWork = pickLineAfterLabel(raw, ["scope of work", "scope", "works", "description"]) || raw;
  fields.workLocation = pickLineAfterLabel(raw, ["location", "work location", "address", "site address"]);
  fields.workDates = pickLineAfterLabel(raw, ["date(s)", "dates", "week commencing"]);
  fields.duration = pickLineAfterLabel(raw, ["duration", "hire duration", "minimum hire"]);
  fields.workingHours = pickLineAfterLabel(raw, ["working pattern", "working hours", "hours"]);
  fields.costSummary = pickLineAfterLabel(raw, ["cost", "cost summary", "price", "rate"]) || (pickFirstMoney(raw) ? `£${pickFirstMoney(raw)}` : "");

  const moneyLines = lines.filter((line) => /£\s?\d|vat/i.test(line)).slice(0, 6);
  if (moneyLines.length) {
    fields.breakdown = moneyLines.map((line) => `1x | ${line} | —`).join("\n");
  }

  const extrasBlock = pickLineAfterLabel(raw, ["additional equipment & personnel", "additional equipment", "personnel"]);
  if (extrasBlock) fields.additionalEquipment = extrasBlock;

  const includedBlock = pickLineAfterLabel(raw, ["included under full cpa terms", "included", "included items"]);
  if (includedBlock) fields.includedItems = includedBlock;

  fields.additionalNotes = raw;

  const missing: string[] = [];
  if (!customerName) missing.push("Customer");
  if (!fields.siteLocation) missing.push("Site location");
  if (!fields.workDates && !fields.projectDateTime) missing.push("Dates");
  if (!fields.costSummary && !fields.breakdown) missing.push("Pricing");

  return {
    customerName,
    amount: pickFirstMoney(raw),
    subject,
    fields,
    missing,
  };
}

function sanitizeFields(value: any): StructuredQuoteFields {
  const empty = getEmptyStructuredQuoteFields();
  const next: StructuredQuoteFields = { ...empty };
  for (const key of Object.keys(empty) as Array<keyof StructuredQuoteFields>) {
    next[key] = safeString(value?.[key]);
  }
  return next;
}

function sanitiseExtraction(payload: any): QuoteExtractionResult {
  const fallback = fallbackExtract("");
  return {
    customerName: safeString(payload?.customerName),
    amount: safeString(payload?.amount),
    subject: safeString(payload?.subject),
    fields: sanitizeFields(payload?.fields),
    missing: Array.isArray(payload?.missing)
      ? payload.missing.map((item: any) => safeString(item)).filter(Boolean)
      : fallback.missing,
  };
}

async function callOpenAI(input: string, maxOutputTokens: number) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
      max_output_tokens: maxOutputTokens,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenAI request failed.");
  }

  const text = String(payload?.output_text ?? "").trim();
  if (!text) throw new Error("OpenAI returned no text.");
  return text;
}

async function extractWithOpenAI(sourceText: string): Promise<QuoteExtractionResult> {
  const prompt = [
    "You extract quote fields from an incoming customer email or enquiry.",
    "Return JSON only. Do not include markdown fences.",
    "Only use information that is explicitly present in the source text.",
    "Never invent prices, dates, legal wording, payment terms, or customer details.",
    "If a field is unclear, return an empty string.",
    "For amount, return only the numeric amount without £ or VAT text when a clear total or quoted price exists.",
    "For breakdown, use one line per row in the format: Qty | Description | Rate.",
    "For additionalEquipment and includedItems, use one item per line when present.",
    "For additionalNotes, place any useful leftover context that should be reviewed by staff.",
    "JSON schema:",
    JSON.stringify({
      customerName: "",
      amount: "",
      subject: "",
      fields: getEmptyStructuredQuoteFields(),
      missing: ["Customer", "Site location", "Dates", "Pricing"],
    }),
    "Source text:",
    sourceText,
  ].join("\n\n");

  const text = await callOpenAI(prompt, 1800);
  return sanitiseExtraction(tryParseJsonObject(text));
}

export async function extractQuoteFromTextWithFallback(sourceText: string) {
  const cleaned = normaliseWhitespace(sourceText);
  if (!cleaned) {
    return {
      provider: "fallback" as const,
      extraction: fallbackExtract(""),
    };
  }

  try {
    const extraction = await extractWithOpenAI(cleaned);
    return { provider: "openai" as const, extraction };
  } catch {
    return {
      provider: "fallback" as const,
      extraction: fallbackExtract(cleaned),
    };
  }
}
