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

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.map((item) => clean(item)).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function stripCourtesyPrefix(value: string) {
  return clean(value)
    .replace(/^(thanks|many thanks|kind regards|regards|best regards|best|cheers)[,:\-\s]*/i, "")
    .trim();
}

function looksLikePersonName(value: string) {
  const line = clean(value);
  if (!line) return false;
  if (/^(mr|mrs|ms|miss)\.?\s+[A-Z]/i.test(line)) return true;
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(line);
}

function stripAttachmentWords(value: string) {
  return clean(value)
    .replace(/\b(attached|attachment)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function stripMarkdownFences(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, "").replace(/\s*```$/, "").trim();
}

function tryParseJsonObject(text: string) {
  const trimmed = stripMarkdownFences(text).trim();
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
  const startIndex = lines.findIndex((line) => /^(thanks|kind regards|regards|many thanks|best regards|best|cheers)\b/i.test(line));
  const block = startIndex >= 0 ? lines.slice(startIndex) : lines.slice(Math.max(0, lines.length - 8));

  const phone = pickFirstPhone(block.join("\n"));
  const roleLine =
    block.find((line) => /(manager|director|engineer|estimator|surveyor|coordinator|buyer|procurement|office)/i.test(line)) || "";

  const cleanedCandidates = block
    .map((rawLine, index) => ({
      index,
      raw: clean(rawLine),
      cleaned: stripCourtesyPrefix(rawLine),
    }))
    .filter((item) => item.cleaned && !/(manager|director|engineer|estimator|surveyor|coordinator|buyer|procurement|office)/i.test(item.raw));

  const fullNameCandidate =
    cleanedCandidates.find((item) => item.index > 0 && looksLikePersonName(item.cleaned)) ||
    cleanedCandidates.find((item) => looksLikePersonName(item.cleaned));

  const signoffOnlyCandidate = cleanedCandidates.find(
    (item) => item.index === 0 && /^(thanks|kind regards|regards|many thanks|best regards|best|cheers)\b/i.test(item.raw)
  );

  const nameLine = fullNameCandidate?.cleaned || signoffOnlyCandidate?.cleaned || "";

  return { name: nameLine, role: roleLine, phone };
}

type RouteInfo = {
  colour: string;
  from: string;
  to: string;
  summary: string;
};

function normaliseLocationFragment(value: string) {
  return stripAttachmentWords(value)
    .replace(/^our yard in\s+/i, "")
    .replace(/^the yard in\s+/i, "")
    .replace(/[.)]+$/g, "")
    .trim();
}

function extractColourRoutes(lines: string[]): RouteInfo[] {
  const routeLines = lines.filter((line) => /highlighted in\s+(purple|blue|green|red|orange|yellow)/i.test(line));
  const routes: RouteInfo[] = [];

  for (const line of routeLines) {
    const colour = clean(line.match(/highlighted in\s+(purple|blue|green|red|orange|yellow)/i)?.[1]);
    let from = "";
    let to = "";

    const collected = line.match(/collected from\s+(.+?)\s*(?:&|and)\s*transported to\s+(.+?)(?:\)|$)/i);
    if (collected) {
      from = normaliseLocationFragment(collected[1]);
      to = normaliseLocationFragment(collected[2]);
    }

    if (!from || !to) {
      const transported = line.match(/transported from\s+(.+?)\s+to\s+(.+?)(?:\)|$)/i);
      if (transported) {
        from = normaliseLocationFragment(transported[1]);
        to = normaliseLocationFragment(transported[2]);
      }
    }

    if (!from || !to) continue;
    routes.push({
      colour: colour || "items",
      from,
      to,
      summary: `${titleCase(colour || "Items")} items: ${from} to ${to}`,
    });
  }

  return routes;
}

function extractRoutes(text: string) {
  const routes: string[] = [];
  const routeRegexes = [
    /collected from\s+(.+?)\s*(?:&|and)\s*transported to\s+(.+?)(?:\)|\n|$)/gi,
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
    if (/\d/.test(line)) return true;
    if (/container|pallet|ducting|sheet|steel|bar|mesh/i.test(line)) return true;
    return false;
  });
}

function summariseLocation(value: string) {
  return stripAttachmentWords(value).replace(/\s{2,}/g, " ").replace(/\n/g, ", ").replace(/\s+,/g, ",").trim();
}

function extractAddressAndLocations(lines: string[]) {
  const siteSection = takeSection(lines, /^site details\b/i, /^(thanks|kind regards|regards|many thanks|best regards|best|cheers)\b/i);
  if (!siteSection.length) {
    return {
      collectionSite: "",
      deliverySite: "",
      siteLocation: "",
      workLocation: "",
      extraNotes: "",
    };
  }

  const attachmentLines = siteSection.filter((line) => /attached/i.test(line));
  const rawCollectionLines = siteSection.filter((line) => /wingrave/i.test(line));
  const collectionLines = rawCollectionLines.map(stripAttachmentWords).filter(Boolean);
  const deliveryLines = siteSection
    .filter((line) => !/^site details\b/i.test(line) && !/wingrave/i.test(line) && !/attached/i.test(line))
    .map(stripAttachmentWords)
    .filter(Boolean);

  const collectionSite = summariseLocation(collectionLines.join("\n"));
  const deliverySite = summariseLocation(deliveryLines.join("\n"));
  const siteLocation = collectionSite && deliverySite ? `${collectionSite} to ${deliverySite}` : collectionSite || deliverySite;
  const workLocation = deliveryLines.join("\n").trim();

  const extraNotes = attachmentLines.length ? "Wingrave AP1 attachment referenced." : "";

  return {
    collectionSite,
    deliverySite,
    siteLocation,
    workLocation,
    extraNotes,
  };
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

function findDurationPhrase(text: string) {
  const patterns = [
    /(minimum\s+\d+\s+day\s+hire)/i,
    /(min(?:imum)?\s+\d+\s+day\s+hire)/i,
    /(\d+\s+day\s+hire)/i,
    /(half\s+day|full\s+day)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }

  return "";
}

function findWorkingHoursPhrase(text: string) {
  const parts = uniqueNonEmpty([
    clean(text.match(/(\d+\s*hours?\s+per\s+day(?:\s*\([^\n)]+\))?)/i)?.[1] || ""),
    clean(text.match(/(weekday\s+working)/i)?.[1] || ""),
    clean(text.match(/(weekend\s+working)/i)?.[1] || ""),
    clean(text.match(/(night\s+working)/i)?.[1] || ""),
  ]);

  return parts.join("\n");
}

function hasExplicitPricing(text: string) {
  return !!pickFirstMoney(text);
}

function hasExplicitDuration(text: string) {
  return !!findDurationPhrase(text);
}

function hasExplicitWorkingHours(text: string) {
  return !!findWorkingHoursPhrase(text);
}

function looksLikeTransportEnquiry(text: string) {
  const lower = text.toLowerCase();
  return (
    (lower.includes("transport") || lower.includes("move") || lower.includes("haulage")) &&
    (lower.includes("site details") || lower.includes("collected from") || lower.includes("transported to"))
  );
}

function buildTransportHeuristics(text: string) {
  const raw = normaliseWhitespace(text);
  const lines = linesOf(raw);
  const signature = extractSignature(lines);
  const colourRoutes = extractColourRoutes(lines);
  const genericRoutes = extractRoutes(raw);
  const datePhrase = findDatePhrase(raw);
  const items = extractItemLines(lines);
  const addressInfo = extractAddressAndLocations(lines);

  const filteredItems = items.filter((line) => !/highlighted in\s+(purple|blue|green|red|orange|yellow)/i.test(line));
  const routeSummaries = colourRoutes.length ? colourRoutes.map((route) => route.summary) : genericRoutes;
  const primaryRoute = colourRoutes[0];
  const secondaryRoutes = colourRoutes.slice(1);

  const siteLocation =
    addressInfo.siteLocation ||
    (primaryRoute ? `${primaryRoute.from} to ${primaryRoute.to}` : routeSummaries[0]?.replace(/^From\s+/i, "") || "");

  const workLocation = addressInfo.workLocation || primaryRoute?.to || "";
  const toSupply = filteredItems.join("\n");

  const scopeParts: string[] = [];
  if (primaryRoute) {
    scopeParts.push(
      `Provide a transport / haulage quotation to move the listed materials from ${primaryRoute.from} to ${primaryRoute.to}${datePhrase ? ` in the ${datePhrase}` : ""}.`
    );
  } else if (routeSummaries.length) {
    scopeParts.push(`Provide a transport / haulage quotation for the requested movement${datePhrase ? ` in the ${datePhrase}` : ""}.`);
    scopeParts.push(routeSummaries.join("\n"));
  }
  if (secondaryRoutes.length) {
    scopeParts.push(`Possible additional movement: ${secondaryRoutes.map((route) => `${route.from} to ${route.to} (${route.colour} items)`).join("; ")}.`);
  }
  if (!scopeParts.length) {
    scopeParts.push(buildScopeSummary(datePhrase, routeSummaries, items));
  }

  const notes = uniqueNonEmpty([
    secondaryRoutes.length
      ? `Possible further movement requested for ${secondaryRoutes.map((route) => `${route.colour} items from ${route.from} to ${route.to}`).join("; ")}.`
      : "",
    addressInfo.extraNotes,
    signature.role ? `Contact role: ${signature.role}` : "",
  ]).join("\n\n");

  const subject = makeSubject("Transport / haulage", routeSummaries, siteLocation);

  return {
    customerName: "",
    amount: pickFirstMoney(raw),
    subject,
    fields: {
      ...getEmptyStructuredQuoteFields(),
      contactName: signature.name,
      contactPhone: signature.phone,
      projectDateTime: datePhrase,
      siteLocation,
      hireType: "Transport / haulage",
      toSupply,
      scopeOfWork: scopeParts.filter(Boolean).join("\n\n").trim(),
      workLocation,
      workDates: datePhrase,
      duration: findDurationPhrase(raw),
      workingHours: findWorkingHoursPhrase(raw),
      costSummary: pickFirstMoney(raw) ? `£${pickFirstMoney(raw)}` : "",
      additionalEquipment: "",
      includedItems: "",
      breakdown: "",
      additionalNotes: notes,
      paymentTerms: getEmptyStructuredQuoteFields().paymentTerms,
    } as StructuredQuoteFields,
    missing: ["Customer", "Pricing"],
  } as QuoteExtractionResult;
}

function looksLikeRawEmailBlob(value: string) {
  const lower = value.toLowerCase();
  return (
    lower.includes("please can you provide a quote") ||
    lower.includes("site details") ||
    lower.includes("thanks ") ||
    lower.includes("project manager") ||
    value.split("\n").length >= 8
  );
}

function mergeExtractionWithHeuristics(text: string, extraction: QuoteExtractionResult): QuoteExtractionResult {
  const heuristics = buildTransportHeuristics(text);
  const transportEnquiry = looksLikeTransportEnquiry(text);

  const next: QuoteExtractionResult = {
    customerName: extraction.customerName,
    amount: extraction.amount,
    subject: extraction.subject,
    fields: { ...extraction.fields },
    missing: Array.isArray(extraction.missing) ? [...extraction.missing] : [],
  };

  const alwaysPreferHeuristic: Array<keyof StructuredQuoteFields> = transportEnquiry
    ? [
        "contactName",
        "contactPhone",
        "projectDateTime",
        "siteLocation",
        "hireType",
        "toSupply",
        "scopeOfWork",
        "workLocation",
        "workDates",
        "duration",
        "workingHours",
        "costSummary",
        "additionalNotes",
      ]
    : [];

  for (const key of Object.keys(next.fields) as Array<keyof StructuredQuoteFields>) {
    const current = clean(next.fields[key]);
    const heuristicValue = clean(heuristics.fields[key]);
    if (!heuristicValue) continue;

    if (!current) {
      next.fields[key] = heuristicValue;
      continue;
    }

    if (alwaysPreferHeuristic.includes(key)) {
      next.fields[key] = heuristicValue;
      continue;
    }

    if ((key === "siteLocation" || key === "workLocation") && current.length < heuristicValue.length) {
      next.fields[key] = heuristicValue;
      continue;
    }

    if (key === "hireType" && /contract lift/i.test(current) && /transport/i.test(heuristicValue)) {
      next.fields[key] = heuristicValue;
      continue;
    }
  }

  if (!clean(next.subject) || looksLikeRawEmailBlob(next.subject)) {
    next.subject = heuristics.subject || next.subject;
  }

  if (!clean(next.amount) && clean(heuristics.amount)) {
    next.amount = heuristics.amount;
  }

  if (!clean(next.customerName) && clean(heuristics.customerName)) {
    next.customerName = heuristics.customerName;
  }

  if (transportEnquiry && !hasExplicitPricing(text)) {
    next.amount = "";
    next.fields.costSummary = "";
    next.fields.breakdown = "";
  }

  if (transportEnquiry && !hasExplicitDuration(text)) {
    next.fields.duration = "";
  }

  if (transportEnquiry && !hasExplicitWorkingHours(text)) {
    next.fields.workingHours = "";
  }

  next.missing = uniqueNonEmpty([
    !clean(next.customerName) ? "Customer" : "",
    !clean(next.fields.siteLocation) && !clean(next.fields.workLocation) ? "Site location" : "",
    !clean(next.fields.workDates) && !clean(next.fields.projectDateTime) ? "Dates" : "",
    !clean(next.amount) && !clean(next.fields.costSummary) ? "Pricing" : "",
  ]);

  return next;
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
  const colourRoutes = extractColourRoutes(lines);

  const customerName = pickLineAfterLabel(raw, ["client", "customer", "company"]);

  fields.contactName = pickLineAfterLabel(raw, ["contact", "contact name", "attn"]) || signature.name;
  fields.contactPhone = pickLineAfterLabel(raw, ["tel", "phone", "telephone", "mobile"]) || signature.phone;
  fields.projectDateTime =
    pickLineAfterLabel(raw, ["date & time of project", "date and time of project", "project date", "date/time"]) || datePhrase;
  fields.siteLocation =
    pickLineAfterLabel(raw, ["site location", "site", "project", "job location"]) ||
    locationInfo.siteLocation ||
    (colourRoutes[0] ? `${colourRoutes[0].from} to ${colourRoutes[0].to}` : "");
  fields.hireType = inferHireType(raw);
  fields.toSupply =
    pickLineAfterLabel(raw, ["to supply", "supply", "equipment required"]) ||
    items.filter((line) => !/highlighted in/i.test(line)).join("\n");
  fields.scopeOfWork =
    pickLineAfterLabel(raw, ["scope of work", "scope", "works", "description"]) || buildScopeSummary(datePhrase, routes, items);
  fields.workLocation =
    pickLineAfterLabel(raw, ["location", "work location", "address", "site address"]) || locationInfo.workLocation;
  fields.workDates = pickLineAfterLabel(raw, ["date(s)", "dates", "week commencing"]) || datePhrase;
  fields.duration = pickLineAfterLabel(raw, ["duration", "hire duration", "minimum hire"]);
  fields.workingHours = pickLineAfterLabel(raw, ["working pattern", "working hours", "hours"]);
  fields.costSummary =
    pickLineAfterLabel(raw, ["cost", "cost summary", "price", "rate"]) || (pickFirstMoney(raw) ? `£${pickFirstMoney(raw)}` : "");

  const extrasBlock = pickLineAfterLabel(raw, ["additional equipment & personnel", "additional equipment", "personnel"]);
  if (extrasBlock) fields.additionalEquipment = extrasBlock;

  const includedBlock = pickLineAfterLabel(raw, ["included under full cpa terms", "included", "included items"]);
  if (includedBlock) fields.includedItems = includedBlock;

  const notes: string[] = [];
  if (signature.role) notes.push(`Contact role: ${signature.role}`);
  if (locationInfo.extraNotes) notes.push(locationInfo.extraNotes);
  const colourNotes = colourRoutes.slice(1).map((route) => `Possible further route: ${route.from} to ${route.to} (${route.colour} items).`);
  if (colourNotes.length) notes.push(colourNotes.join("\n"));
  fields.additionalNotes = notes.join("\n\n").trim();

  const subject =
    pickLineAfterLabel(raw, ["subject", "re", "project", "site location"]) ||
    makeSubject(fields.hireType, routes, fields.siteLocation);

  const missing: string[] = [];
  if (!customerName) missing.push("Customer");
  if (!fields.siteLocation && !fields.workLocation) missing.push("Site location");
  if (!fields.workDates && !fields.projectDateTime) missing.push("Dates");
  if (!fields.costSummary && !pickFirstMoney(raw)) missing.push("Pricing");

  return mergeExtractionWithHeuristics(raw, {
    customerName,
    amount: pickFirstMoney(raw),
    subject,
    fields,
    missing,
  });
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

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenAI request failed.");
  }

  const text = extractResponseText(payload);
  if (!text) throw new Error("OpenAI returned no text.");
  return text;
}

async function extractWithOpenAI(sourceText: string): Promise<QuoteExtractionResult> {
  const prompt = [
    "You extract quote fields from an incoming customer email or enquiry for AnnS Crane Hire Ltd.",
    "Return JSON only. Do not include markdown fences.",
    "Only use information that is explicitly present in the source text.",
    "Never invent prices, dates, legal wording, payment terms, or customer details.",
    "If a field is unclear, return an empty string.",
    "For amount, return only the numeric amount without £ or VAT text when a clear total or quoted price exists.",
    "For transport / haulage enquiries, map collection and delivery carefully:",
    "- siteLocation = short route summary such as 'Wingrave AP1 to Horton, Cullompton, Devon, EX15 2NH'",
    "- workLocation = the main delivery / working address block",
    "- toSupply = clean item list only, one item per line",
    "- scopeOfWork = concise business summary of the requested move, not the raw email",
    "- additionalNotes = useful leftover review points such as possible additional routes or attached drawings",
    "Do not paste the whole email into any field.",
    "If the company name is not explicitly stated, customerName must be an empty string.",
    "If no pricing is present, amount and costSummary must be empty strings.",
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
  return mergeExtractionWithHeuristics(sourceText, sanitiseExtraction(tryParseJsonObject(text)));
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
