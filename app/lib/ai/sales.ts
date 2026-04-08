import { cleanWhitespace, normaliseDraftBody, normaliseDraftSubject } from "../emailSignature";

export type Channel = "email" | "text" | "linkedin";
export type Goal = "introduction" | "follow_up" | "reactivation" | "availability";
export type Tone = "professional" | "friendly" | "direct";

export type SocialVariant = {
  key: string;
  title: string;
  description: string;
  body: string;
};

type LeadLike = {
  company_name?: string | null;
  contact_name?: string | null;
  area?: string | null;
  industry?: string | null;
  services?: string[] | null;
};

type SalesDraftArgs = {
  lead: LeadLike;
  channel: Channel;
  goal: Goal;
  tone: Tone;
  serviceFocus?: string | null;
  availabilityNote?: string | null;
  customCta?: string | null;
  subjectHint?: string | null;
  bodyHint?: string | null;
};

type SocialArgs = {
  serviceFocus?: string | null;
  area?: string | null;
  industry?: string | null;
  tone?: string | null;
  objective?: string | null;
  availabilityNote?: string | null;
  assetName?: string | null;
  campaignName?: string | null;
  sourceTemplate?: string | null;
  includePhone?: boolean;
};

type Draft = {
  subject: string;
  body: string;
};

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function finaliseDraftForChannel(draft: Draft, channel: Channel): Draft {
  const subject = normaliseDraftSubject(String(draft.subject ?? ""));
  const body = channel === "email"
    ? normaliseDraftBody(draft.body)
    : cleanWhitespace(draft.body);

  return { subject, body };
}

function companyName(lead: LeadLike) {
  return clean(lead.company_name) || "your business";
}

function contactName(lead: LeadLike) {
  return clean(lead.contact_name) || companyName(lead);
}

function firstService(lead: LeadLike) {
  const services = Array.isArray(lead.services) ? lead.services : [];
  return services.find((item) => String(item ?? "").trim()) ?? null;
}

function interpolate(
  input: string | null | undefined,
  lead: LeadLike,
  values: {
    service_focus: string | null;
    availability_note: string | null;
    custom_cta: string | null;
  }
) {
  let output = String(input ?? "");
  if (!output) return "";

  const replacements: Record<string, string> = {
    company_name: companyName(lead),
    contact_name: clean(lead.contact_name) || companyName(lead),
    area: clean(lead.area) || "",
    industry: clean(lead.industry) || "",
    service_focus: values.service_focus || "",
    availability_note: values.availability_note || "",
    custom_cta: values.custom_cta || "",
  };

  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), value);
    output = output.replace(new RegExp(`\\{\\s*${key}\\s*\\}`, "gi"), value);
  }

  return cleanWhitespace(output);
}

function servicePitch(serviceFocus: string | null) {
  const raw = String(serviceFocus ?? "").trim().toLowerCase();

  if (!raw) {
    return "We support crane hire, HIAB transport, contract lifts, spider cranes, machinery moves, container moves and wider lifting and transport requirements across the UK.";
  }

  if (raw.includes("hiab")) {
    return "We support HIAB transport, container movements, restricted-access deliveries and positioning work, with a responsive service for planned and short-notice jobs.";
  }

  if (raw.includes("spider")) {
    return "We support restricted-access lifting with spider cranes, along with careful planning and a practical approach on awkward sites.";
  }

  if (raw.includes("contract")) {
    return "We support full contract lift requirements with planning, lifting operations and transport support where needed.";
  }

  if (
    raw.includes("transport") ||
    raw.includes("haulage") ||
    raw.includes("machinery") ||
    raw.includes("container")
  ) {
    return "We support transport, machinery and container movements, as well as HIAB and specialist lifting support where required.";
  }

  if (raw.includes("crane")) {
    return "We support crane hire, contract lifts, transport assistance and short-notice lifting requirements across the UK.";
  }

  return `We can support ${serviceFocus} as well as wider crane and transport requirements where needed.`;
}

function relevanceLine(lead: LeadLike, serviceFocus: string | null) {
  const industry = clean(lead.industry);
  const area = clean(lead.area);

  if (industry && area) {
    return `I thought it was worth reaching out as we regularly support businesses in ${industry} work and can cover jobs in and around ${area}, as well as nationwide when required.`;
  }

  if (industry) {
    return `I thought it was worth reaching out as we regularly support businesses working in ${industry} and can help with both planned and short-notice requirements.`;
  }

  if (area) {
    return `I thought it was worth reaching out as we can cover work in and around ${area}, as well as nationwide when required.`;
  }

  if (serviceFocus) {
    return "I thought it was worth reaching out as this may be relevant to the sort of support your team uses from time to time.";
  }

  return "I thought it was worth making an introduction in case we can help on any upcoming requirements.";
}

function introLine(goal: Goal, tone: Tone) {
  if (goal === "follow_up") {
    if (tone === "friendly") return "I just wanted to follow up in case my last message was missed.";
    if (tone === "direct") return "I am following up on my earlier message to see whether this is something worth discussing.";
    return "I wanted to follow up on my earlier message in case it was missed.";
  }

  if (goal === "reactivation") {
    if (tone === "friendly") return "I just wanted to get back in touch and put ourselves back on your radar.";
    if (tone === "direct") return "I am getting back in touch to see whether you have any upcoming requirements we could help with.";
    return "I wanted to reintroduce ourselves and see whether you have any upcoming requirements we could assist with.";
  }

  if (goal === "availability") {
    if (tone === "friendly") return "I wanted to drop you a quick note as we currently have availability coming up.";
    if (tone === "direct") return "We currently have availability coming up and I wanted to make you aware in case it helps your planning.";
    return "I wanted to let you know that we currently have availability coming up that may be useful for any planned or short-notice work.";
  }

  if (tone === "friendly") return "I hope you are well. I wanted to introduce myself and AnnS Crane Hire.";
  if (tone === "direct") return "I am reaching out to introduce AnnS Crane Hire and see whether we could support your team.";
  return "I hope you are well. I am reaching out to introduce AnnS Crane Hire and see whether we may be able to support your business.";
}

function ctaLine(goal: Goal, channel: Channel, customCta: string | null) {
  if (customCta) return customCta;

  if (channel === "text") {
    if (goal === "availability") {
      return "If useful, reply here and I will send over availability and pricing.";
    }
    return "If it is worth a quick chat, just reply here and I can come back to you.";
  }

  if (channel === "linkedin") {
    if (goal === "availability") {
      return "If useful, feel free to message me back and I can send over more detail.";
    }
    return "If it would be useful, I would be happy to message over more detail or have a quick call.";
  }

  if (goal === "availability") {
    return "If this could help with any upcoming jobs, I would be happy to send over availability and discuss the best option.";
  }

  if (goal === "follow_up") {
    return "If this is of interest, I would be happy to have a quick call or send over more detail.";
  }

  if (goal === "reactivation") {
    return "If you have anything coming up, I would be glad to discuss how we may be able to help.";
  }

  return "If it would be useful, I would be happy to have a quick call or send over more information.";
}

function closeLine(channel: Channel, tone: Tone) {
  if (channel === "text") {
    return "Tom Craig, AnnS Crane Hire";
  }

  if (channel === "linkedin") {
    return tone === "friendly"
      ? "Best regards,\nTom Craig\nAnnS Crane Hire"
      : "Kind regards,\nTom Craig\nAnnS Crane Hire";
  }

  return tone === "friendly"
    ? "Best regards,\nTom Craig\nAnnS Crane Hire Ltd"
    : "Kind regards,\nTom Craig\nAnnS Crane Hire Ltd";
}

function subjectLine(goal: Goal, serviceFocus: string | null, availabilityNote: string | null) {
  const service = clean(serviceFocus);

  if (goal === "availability") {
    return service
      ? `${service} availability from AnnS Crane Hire`
      : clean(availabilityNote) || "Availability from AnnS Crane Hire";
  }

  if (goal === "follow_up") {
    return service ? `Following up – ${service} support` : "Following up from AnnS Crane Hire";
  }

  if (goal === "reactivation") {
    return service
      ? `Support for upcoming ${service} requirements`
      : "Support for upcoming lifting and transport requirements";
  }

  return service ? `${service} support from AnnS Crane Hire` : "AnnS Crane Hire introduction";
}

function buildFallbackDraft(args: {
  lead: LeadLike;
  channel: Channel;
  goal: Goal;
  tone: Tone;
  serviceFocus: string | null;
  availabilityNote: string | null;
  customCta: string | null;
  subjectHint: string | null;
  bodyHint: string | null;
}): Draft {
  const {
    lead,
    channel,
    goal,
    tone,
    serviceFocus,
    availabilityNote,
    customCta,
    subjectHint,
    bodyHint,
  } = args;

  if (channel === "text") {
    let body = `Hi, Tom from AnnS Crane Hire here. We support ${serviceFocus || "crane and transport support"} and I wanted to introduce us to ${companyName(lead)}.`;

    if (goal === "follow_up") {
      body = `Hi, Tom from AnnS Crane Hire here. Just following up to see if ${companyName(lead)} may need any ${serviceFocus || "crane and transport"} support.`;
    }

    if (goal === "reactivation") {
      body = `Hi, Tom from AnnS Crane Hire here. Just getting back in touch in case ${companyName(lead)} has any upcoming ${serviceFocus || "crane and transport"} requirements we could help with.`;
    }

    if (goal === "availability") {
      body = `Hi, Tom from AnnS Crane Hire here. We currently have availability for ${serviceFocus || "crane and transport support"}. ${availabilityNote ? `${availabilityNote}. ` : ""}Thought I would let ${companyName(lead)} know in case it helps.`;
    }

    if (tone === "friendly") {
      body = body.replace("I wanted to", "just wanted to");
    }

    return {
      subject: "",
      body: `${body} ${ctaLine(goal, "text", customCta)} ${closeLine("text", tone)}`.trim(),
    };
  }

  const hintValues = {
    service_focus: serviceFocus,
    availability_note: availabilityNote,
    custom_cta: customCta,
  };

  const lines = [
    `Hi ${contactName(lead)},`,
    "",
    introLine(goal, tone),
    "",
    relevanceLine(lead, serviceFocus),
    "",
    servicePitch(serviceFocus),
  ];

  if (goal === "availability" && availabilityNote) {
    lines.push("", `Current availability: ${availabilityNote}`);
  }

  lines.push("", ctaLine(goal, channel, customCta));

  if (channel !== "email") {
    lines.push("", closeLine(channel, tone));
  }

  return {
    subject:
      channel === "email"
        ? interpolate(subjectHint, lead, hintValues) || subjectLine(goal, serviceFocus, availabilityNote)
        : "",
    body: lines.join("\n"),
  };
}

function compactSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildHashtags(serviceFocus: string, area: string, industry: string) {
  const rawParts = [serviceFocus, area, industry, "AnnS Crane Hire", "Crane Hire", "Transport"]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const cleaned = rawParts.map((value) =>
    "#" +
    value
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")
  );

  return Array.from(new Set(cleaned)).slice(0, 6).join(" ");
}

function buildSocialCTA(style: string, includePhone: boolean) {
  const phonePart = includePhone ? " Call 07442 158822." : "";

  if (style === "direct") {
    return `If you have anything coming up and need a reliable team, get in touch.${phonePart}`;
  }

  if (style === "availability") {
    return `If you need support and want to secure availability, message us now.${phonePart}`;
  }

  if (style === "story") {
    return `If you have a similar requirement coming up, we’d be happy to help.${phonePart}`;
  }

  return `If it would be useful to have a dependable crane and transport partner in place, let’s talk.${phonePart}`;
}

function buildFallbackSocialVariants(args: SocialArgs): SocialVariant[] {
  const focus = compactSpaces(args.serviceFocus || "crane hire and transport support");
  const region = compactSpaces(args.area || "across the UK");
  const sector = compactSpaces(args.industry || "construction and related sectors");
  const tone = compactSpaces(args.tone || "professional");
  const objective = compactSpaces(args.objective || "awareness");
  const availability = compactSpaces(args.availabilityNote || "");
  const asset = compactSpaces(args.assetName || "");
  const campaign = compactSpaces(args.campaignName || "");
  const sourceTemplate = compactSpaces(args.sourceTemplate || "");
  const includePhone = args.includePhone !== false;
  const hashtags = buildHashtags(focus, region, sector);

  const openerTone =
    tone === "direct"
      ? "Need a dependable lifting and transport partner?"
      : tone === "friendly"
      ? "A quick update from AnnS Crane Hire."
      : "Professional support matters when deadlines are tight.";

  const objectiveLine =
    objective === "availability"
      ? `We currently have ${focus}${availability ? ` ${availability}` : ""}.`
      : objective === "reactivation"
      ? `We’re speaking with businesses who may need ${focus} in the coming weeks.`
      : objective === "awareness"
      ? `We want to keep AnnS Crane Hire front of mind for businesses needing ${focus}.`
      : `We’re helping customers with ${focus} ${region}.`;

  const assetLine = asset ? `A good example is our ${asset}, which is available for the right project.` : "";
  const campaignLine = campaign ? `This ties in with our current ${campaign} push.` : "";
  const sectorLine = `We regularly support businesses in ${sector} and related industries ${region}.`;

  const directPost = compactSpaces(`
${openerTone}

At AnnS Crane Hire, we support customers with ${focus} ${region}.

${objectiveLine}
${assetLine}
${campaignLine}

We pride ourselves on being professional, responsive and easy to deal with.

${buildSocialCTA("direct", includePhone)}

${hashtags}
  `).replace(/ \./g, ".");

  const availabilityPost = compactSpaces(`
Availability update from AnnS Crane Hire.

We currently have support available for ${focus}${availability ? ` ${availability}` : ""}.

If your project needs a professional team that can assist with crane and transport requirements ${region}, we’d be happy to help.

${assetLine}

${buildSocialCTA("availability", includePhone)}

${hashtags}
  `).replace(/ \./g, ".");

  const storyPost = compactSpaces(`
One thing we know in this industry is that projects rarely stay simple.

That is why customers value a team that can support ${focus} with a practical and professional approach.

At AnnS Crane Hire, we work with businesses ${region} who need reliable support, clear communication and a service they can trust.

${assetLine}
${campaignLine}
${objectiveLine}

${buildSocialCTA("story", includePhone)}

${hashtags}
  `).replace(/ \./g, ".");

  const relationshipPost = compactSpaces(`
At AnnS Crane Hire, we are not just looking to quote one-off jobs.

We want to build long-term working relationships with businesses that need ${focus} ${region}.

We know that reliability, communication and responsiveness matter just as much as the equipment itself.

${sectorLine}
${objectiveLine}

${buildSocialCTA("relationship", includePhone)}

${hashtags}
  `).replace(/ \./g, ".");

  const variants: SocialVariant[] = [
    {
      key: "direct",
      title: "Direct sales post",
      description: "Best for straightforward lead generation.",
      body: directPost,
    },
    {
      key: "availability",
      title: "Availability update",
      description: "Best when you have short-notice fleet availability.",
      body: availabilityPost,
    },
    {
      key: "story",
      title: "Story / credibility post",
      description: "Best for building trust and authority.",
      body: storyPost,
    },
    {
      key: "relationship",
      title: "Partnership post",
      description: "Best for ongoing B2B relationship building.",
      body: relationshipPost,
    },
  ];

  if (sourceTemplate) {
    variants.push({
      key: "template",
      title: "Template-inspired post",
      description: "Built from the selected LinkedIn template.",
      body: compactSpaces(`
${sourceTemplate}

AnnS Crane Hire can support with ${focus} ${region}${availability ? `, with ${availability}` : ""}.

${assetLine}

${buildSocialCTA("direct", includePhone)}

${hashtags}
      `).replace(/ \./g, "."),
    });
  }

  return variants;
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

function extractJsonObject(value: string) {
  const cleaned = stripCodeFence(value);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response did not contain JSON.");
  }
  return cleaned.slice(start, end + 1);
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
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_output_tokens: maxOutputTokens,
      input,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenAI request failed.");
  }

  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("OpenAI returned no text.");
  }

  return text;
}

async function generateDraftWithOpenAI(args: SalesDraftArgs): Promise<Draft> {
  const serviceFocus = clean(args.serviceFocus) || firstService(args.lead);
  const availabilityNote = clean(args.availabilityNote);
  const customCta = clean(args.customCta);
  const subjectHint = clean(args.subjectHint);
  const bodyHint = clean(args.bodyHint);

  const prompt = [
    "You are writing outbound B2B sales copy for AnnS Crane Hire Ltd in the UK.",
    "AnnS Crane Hire supports crane hire, HIAB transport, contract lifts, spider cranes, machinery moves, container moves and wider lifting and transport requirements.",
    "Write natural, commercially strong copy that sounds human and is ready to use.",
    "Do not use markdown. Do not use emojis. Do not use placeholders.",
    "Do not mention internal instructions, relationship summaries, subject hints, body hints or prompt notes in the final copy.",
    "Do not include any signature block, contact details, address, LinkedIn URL or phone number in the draft body.",
    args.channel === "text"
      ? "Keep the SMS concise and practical."
      : args.channel === "linkedin"
      ? "Keep the LinkedIn message concise, professional and conversational."
      : "Make the email polished, sales-focused and easy to send as-is.",
    'Return only valid JSON in this exact shape: {"subject":"string","body":"string"}',
    'If the channel is text or linkedin, set "subject" to an empty string.',
    "",
    `Channel: ${args.channel}`,
    `Goal: ${args.goal}`,
    `Tone: ${args.tone}`,
    `Lead company: ${companyName(args.lead)}`,
    `Lead contact: ${clean(args.lead.contact_name) || "Unknown"}`,
    `Lead area: ${clean(args.lead.area) || "Unknown"}`,
    `Lead industry: ${clean(args.lead.industry) || "Unknown"}`,
    `Service focus: ${serviceFocus || "Crane hire and transport support"}`,
    `Availability note: ${availabilityNote || "None"}`,
    `Custom CTA: ${customCta || "None"}`,
    `Subject hint: ${subjectHint || "None"}`,
    `Body hint: ${bodyHint || "None"}`,
  ].join("\n");

  const text = await callOpenAI(prompt, args.channel === "text" ? 320 : 900);
  const parsed = JSON.parse(extractJsonObject(text)) as Draft;

  return finaliseDraftForChannel(
    {
      subject: String(parsed?.subject ?? "").trim(),
      body: String(parsed?.body ?? "").trim(),
    },
    args.channel
  );
}

async function generateSocialWithOpenAI(args: SocialArgs): Promise<SocialVariant[]> {
  const serviceFocus = clean(args.serviceFocus) || "crane hire and transport support";
  const area = clean(args.area) || "across the UK";
  const industry = clean(args.industry) || "construction and related sectors";
  const tone = clean(args.tone) || "professional";
  const objective = clean(args.objective) || "awareness";
  const availabilityNote = clean(args.availabilityNote);
  const assetName = clean(args.assetName);
  const campaignName = clean(args.campaignName);
  const sourceTemplate = clean(args.sourceTemplate);
  const includePhone = args.includePhone !== false;

  const prompt = [
    "You are writing LinkedIn and social media posts for AnnS Crane Hire in the UK.",
    "AnnS Crane Hire supports crane hire, HIAB transport, contract lifts, spider cranes, machinery moves, container moves and wider lifting and transport requirements.",
    "Write natural, commercially useful posts that sound human and ready to publish.",
    "Do not use markdown. Do not use emojis.",
    'Return only valid JSON in this exact shape: {"variants":[{"key":"string","title":"string","description":"string","body":"string"}]}',
    'Always include variants with keys: direct, availability, story, relationship. If a source template is provided, also include template.',
    "",
    `Service focus: ${serviceFocus}`,
    `Area: ${area}`,
    `Industry: ${industry}`,
    `Tone: ${tone}`,
    `Objective: ${objective}`,
    `Availability note: ${availabilityNote || "None"}`,
    `Asset name: ${assetName || "None"}`,
    `Campaign name: ${campaignName || "None"}`,
    `Source template: ${sourceTemplate || "None"}`,
    `Use phone CTA: ${includePhone ? "Yes" : "No"}`,
  ].join("\n");

  const text = await callOpenAI(prompt, 1800);
  const parsed = JSON.parse(extractJsonObject(text)) as { variants?: SocialVariant[] };

  const variants = Array.isArray(parsed?.variants) ? parsed.variants : [];
  if (!variants.length) {
    throw new Error("OpenAI returned no social variants.");
  }

  return variants
    .map((item) => ({
      key: String(item?.key ?? "post").trim() || "post",
      title: String(item?.title ?? "Generated post").trim() || "Generated post",
      description: String(item?.description ?? "AI-generated post.").trim() || "AI-generated post.",
      body: String(item?.body ?? "").trim(),
    }))
    .filter((item) => item.body);
}

export async function generateSalesDraftWithFallback(args: SalesDraftArgs) {
  const serviceFocus = clean(args.serviceFocus) || firstService(args.lead);
  const availabilityNote = clean(args.availabilityNote);
  const customCta = clean(args.customCta);
  const subjectHint = clean(args.subjectHint);
  const bodyHint = clean(args.bodyHint);

  const fallback = finaliseDraftForChannel(
    buildFallbackDraft({
      lead: args.lead,
      channel: args.channel,
      goal: args.goal,
      tone: args.tone,
      serviceFocus,
      availabilityNote,
      customCta,
      subjectHint,
      bodyHint,
    }),
    args.channel
  );

  try {
    const draft = await generateDraftWithOpenAI({
      ...args,
      serviceFocus,
      availabilityNote,
      customCta,
      subjectHint,
      bodyHint,
    });

    return {
      draft: finaliseDraftForChannel(draft, args.channel),
      provider: "openai" as const,
    };
  } catch {
    return {
      draft: fallback,
      provider: "fallback" as const,
    };
  }
}

export async function generateSocialPostsWithFallback(args: SocialArgs) {
  const fallback = buildFallbackSocialVariants(args);

  try {
    const variants = await generateSocialWithOpenAI(args);
    return {
      variants,
      provider: "openai" as const,
    };
  } catch {
    return {
      variants: fallback,
      provider: "fallback" as const,
    };
  }
}
