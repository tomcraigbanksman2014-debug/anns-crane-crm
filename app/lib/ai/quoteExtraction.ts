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

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function tryParseJsonObject(text: string) {
  const cleaned = stripCodeFence(text);
  const trimmed = cleaned.trim();
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

function extractResponseText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks: string[] = [];

  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (!Array.isArray(item?.content)) continue;

    for (const content of item.content) {
      const text =
        typeof content?.text === "string"
          ? content.text
          : typeof content?.output_text === "string"
            ? content.output_text
            : "";

      if (text) chunks.push(text);
    }
  }

  return chunks.join("\n").trim();
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
  if (lower.includes("transport") || lower.includes("haulage") || lower.includes("move ")) {
    return "Transport / haulage";
  }
  return "";
}

function linesOf(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function findLineIndex(lines: string[], matcher: RegExp) {
  return lines.findIndex((line) => matcher.test(line));
}

function takeSection(lines: string[], startMatcher: RegExp, endMatcher?: RegExp) {
  const startIndex = findLineIndex(lines, startMatcher);
  if (startIndex < 0) return [] as string[];

  let endIndex = lines.length;
  if (endMatcher) {
    const relativeEnd = lines.slice(startIndex + 1).findIndex((line) => endMatcher.test(line));
    if (relativeEnd >= 0) endIndex = startIndex + 1 + relativeEnd;
  }

  return lines.slice(startIndex + 1, endIndex).filter(Boolean);
}

function findDatePhrase(text: string) {
  const patterns = [
    /((?:first|second|third|fourth|last)\s+week\s+of\s+[A-Za-z]+)/i,
    /(week\s+commencing\s+[^\n.]+)/i,
    /((?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})(?:\s*(?:to|-|–)\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

function extractSignature(lines: string[]) {
  const startIndex = lines.findIndex((line) => /^(thanks|kind regards|regards|many thanks)\b/i.test(line));
  const block = startIndex >= 0 ? lines.slice(startIndex) : lines.slice(Math.max(0, lines.length - 6));

  const phone = pickFirstPhone(block.join("\n"));
  const nameLine =
    block.find((line) => /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(line)) ||
    block.find((line) => /^(mr|mrs|ms|miss)\.?\s+/i.test(line)) ||
    "";

  const roleLine = block.find((line) => /(manager|director|engineer|estimator|surveyor|coordinator|buyer|procurement|office)/i.test(line)) || "";

  return { name: nameLine, role: roleLine, phone };
}

function extractAddressAndLocations(lines: string[]) {
  const siteSection = takeSection(lines, /^site details\b/i, /^(thanks|kind regards|regards|many thanks)\b/i);
  if (!siteSection.length) {
    return { siteLocation: "", workLocation: "", extraNotes: "" };
  }

  const collectionLines = siteSection.filter((line) => /wingrave/i.test(line));
  const deliveryLines = siteSection.filter((line) => !/wingrave/i.test(line) && !/^site details\b/i.test(line));

  const workLocation = deliveryLines.join("\n");

  const siteBits: string[] = [];
  if (collectionLines.length) siteBits.push(`Collection: ${collectionLines.join(", ")}`);
  if (deliveryLines.length) siteBits.push(`Delivery: ${deliveryLines.join(", ")}`);

  const extraNotes = collectionLines.some((line) => /attached/i.test(line))
    ? "Collection drawing / AP attachment referenced for Wingrave."
    : "";

  return {
    siteLocation: siteBits.join("\n"),
    workLocation,
    extraNotes,
  };
}

function extractRoutes(text: string) {
  const routes: string[] = [];
  const routeRegexes = [
    /collected from\s+(.+?)\s*&\s*transported to\s+(.+?)(?:\)|\n|$)/gi,
    /transported from\s+(.+?)\s+to\s+(.+?)(?:\)|\n|$)/gi,
    /move\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+?)(?:\.|\n|$)/gi,
  ];

  for (const regex of routeRegexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text))) {
      if (match.length >= 3) {
        const from = clean(match[match.length - 2]);
        const to = clean(match[match.length - 1]);
        if (from && to) routes.push(`From ${from} to ${to}`);
      }
    }
  }

  return Array.from(new Set(routes));
}

function extractItemLines(lines: string[]) {
  const itemSection = takeSection(lines, /^(mesh details|items|materials|load details)\b/i, /^site details\b/i);
  if (!itemSection.length) return [] as string[];

  return itemSection.filter((line) => {
    const lower = line.toLowerCase();
    if (lower.includes("highlighted in purple") || lower.includes("highlighted in blue")) return true;
    if (lower.startsWith("(") && lower.endsWith(")")) return true;
    if (/\d/.test(line)) return true;
    if (/container|pallet|ducting|sheet|steel|bar|mesh/i.test(line)) return true;
    return false;
  });
}

function makeSubject(hireType: string, routes: string[], siteLocation: string) {
  const prefix = hireType || "Quote request";
  if (routes.length) {
    return `${prefix} - ${routes[0].replace(/^From\s+/i, "").replace(/\s+to\s+/i, " to ")}`;
  }
  if (siteLocation) {
    return `${prefix} - ${siteLocation.split("\n")[0].replace(/^Collection:\s*/i, "")}`;
  }
  return "";
}

function buildScopeSummary(datePhrase: string, routes: string[], itemLines: string[]) {
  const parts: string[] = [];
  if (datePhrase) parts.push(`Requested timing: ${datePhrase}.`);
  for (const route of routes) parts.push(route + ".");

  const nonRouteItems = itemLines.filter((line) => !/highlighted in purple|highlighted in blue/i.test(line));
  if (nonRouteItems.length) {
    parts.push("Items requested for movement:");
    parts.push(nonRouteItems.join("\n"));
  }

  return parts.join("\n\n").trim();
}

function fallbackExtract(text: string): QuoteExtractionResult {
  const raw = normaliseWhitespace(text);
  const fields = getEmptyStructuredQuoteFields();
  const lines = linesOf(raw);

  const signature = extractSignature(lines);
  const routes = extractRoutes(raw);
  const datePhrase = findDatePhrase(raw);
  const items = extractItemLines(lines);
  const locationInfo = extractAddressAndLocations(lines);

  const customerName = pickLineAfterLabel(raw, ["client", "customer", "company"]);

  fields.contactName = pickLineAfterLabel(raw, ["contact", "contact name", "attn"]) || signature.name;
  fields.contactPhone = pickLineAfterLabel(raw, ["tel", "phone", "telephone", "mobile"]) || signature.phone;
  fields.projectDateTime = pickLineAfterLabel(raw, ["date & time of project", "date and time of project", "project date", "date/time"]) || datePhrase;
  fields.siteLocation = pickLineAfterLabel(raw, ["site location", "site", "project", "job location"]) || locationInfo.siteLocation;
  fields.hireType = inferHireType(raw);
  fields.toSupply = pickLineAfterLabel(raw, ["to supply", "supply", "equipment required"]) || items.filter((line) => !/highlighted/i.test(line)).join("\n");
  fields.scopeOfWork = pickLineAfterLabel(raw, ["scope of work", "scope", "works", "description"]) || buildScopeSummary(datePhrase, routes, items);
  fields.workLocation = pickLineAfterLabel(raw, ["location", "work location", "address", "site address"]) || locationInfo.workLocation;
  fields.workDates = pickLineAfterLabel(raw, ["date(s)", "dates", "week commencing"]) || datePhrase;
  fields.duration = pickLineAfterLabel(raw, ["duration", "hire duration", "minimum hire"]);
  fields.workingHours = pickLineAfterLabel(raw, ["working pattern", "working hours", "hours"]);
  fields.costSummary = pickLineAfterLabel(raw, ["cost", "cost summary", "price", "rate"]) || (pickFirstMoney(raw) ? `£${pickFirstMoney(raw)}` : "");

  const extrasBlock = pickLineAfterLabel(raw, ["additional equipment & personnel", "additional equipment", "personnel"]);
  if (extrasBlock) fields.additionalEquipment = extrasBlock;

  const includedBlock = pickLineAfterLabel(raw, ["included under full cpa terms", "included", "included items"]);
  if (includedBlock) fields.includedItems = includedBlock;

  const notes: string[] = [];
  if (signature.role) notes.push(`Contact role: ${signature.role}`);
  if (locationInfo.extraNotes) notes.push(locationInfo.extraNotes);
  const colourNotes = items.filter((line) => /highlighted in purple|highlighted in blue/i.test(line));
  if (colourNotes.length) notes.push(colourNotes.join("\n"));
  const routeNotes = routes.slice(1);
  if (routeNotes.length) notes.push(routeNotes.join("\n"));
  fields.additionalNotes = notes.join("\n\n").trim();

  const subject =
    pickLineAfterLabel(raw, ["subject", "re", "project", "site location"]) ||
    makeSubject(fields.hireType, routes, fields.siteLocation);

  const missing: string[] = [];
  if (!customerName) missing.push("Customer");
  if (!fields.siteLocation && !fields.workLocation) missing.push("Site location");
  if (!fields.workDates && !fields.projectDateTime) missing.push("Dates");
  if (!fields.costSummary && !pickFirstMoney(raw)) missing.push("Pricing");

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
      temperature: 0.2,
      input,
      max_output_tokens: maxOutputTokens,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenAI request failed.");
  }

  const text = extractResponseText(payload);
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
    "For breakdown, only include rows when a rate/price is explicitly present.",
    "For toSupply, use the item list or materials being moved/supplied.",
    "For scopeOfWork, summarise the requested movement or lifting work in plain business language using only facts from the source text.",
    "For workLocation, prefer the delivery / working site address block when one is present.",
    "For siteLocation, combine collection and delivery route details when the enquiry includes a from/to movement.",
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
