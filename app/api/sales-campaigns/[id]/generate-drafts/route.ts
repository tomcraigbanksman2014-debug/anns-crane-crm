import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { writeAuditLog } from "../../../../lib/audit";
import { generateSalesDraftWithFallback } from "../../../../lib/ai/sales";
import { getCustomerActivityRollups } from "../../../../lib/customerActivity";
import {
  cleanWhitespace,
  normaliseDraftBody,
  normaliseDraftSubject,
} from "../../../../lib/emailSignature";
import { checkMarketingSuppression } from "../../../../lib/marketingSuppression";

type Channel = "email" | "text" | "linkedin";
type Goal =
  | "introduction"
  | "recent_customer_thank_you"
  | "dormant_recovery"
  | "quote_follow_up"
  | "cross_sell"
  | "follow_up"
  | "reactivation"
  | "availability";
type Tone = "professional" | "friendly" | "direct";
type RecipientSource =
  | "job_quote_first"
  | "booking_contacts_only"
  | "customer_email_only"
  | "include_accounts_fallback";

type EmailCandidate = {
  email: string;
  contactName: string | null;
  phone: string | null;
  source: string;
  sourceDate: string | null;
  priority: number;
  isAccountsEmail: boolean;
};

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function normaliseRecipientSource(value: unknown): RecipientSource {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "booking_contacts_only" ||
    raw === "customer_email_only" ||
    raw === "include_accounts_fallback"
  ) {
    return raw;
  }
  return "job_quote_first";
}

function cleanEmail(value: unknown) {
  const email = String(value ?? "")
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/[<>()\[\]{}'";,]+$/g, "")
    .replace(/^[<>()\[\]{}'";,]+/g, "");

  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email.toLowerCase();
}

function extractEmailsFromText(value: unknown) {
  const text = String(value ?? "");
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return Array.from(new Set(matches.map((email) => cleanEmail(email)).filter(Boolean) as string[]));
}

function looksLikeAccountsEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email.includes("@")) return false;

  const local = email.split("@")[0] || "";
  const blocked = [
    "account",
    "accounts",
    "invoice",
    "invoices",
    "invoicing",
    "finance",
    "purchaseledger",
    "purchase.ledger",
    "ledger",
    "payments",
    "payment",
    "payables",
    "payable",
    "ap",
    "admin",
    "bookkeeping",
    "bookkeeper",
  ];

  return blocked.some((word) => local === word || local.includes(word));
}

function normaliseDateOnly(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match?.[1]) return match[1];

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function latestRowDate(row: any, keys: string[]) {
  const values = keys
    .map((key) => normaliseDateOnly(row?.[key]))
    .filter(Boolean) as string[];
  if (!values.length) return null;
  values.sort();
  return values[values.length - 1] || null;
}

function compareCandidateDate(a: string | null, b: string | null) {
  if (a && b) return b.localeCompare(a);
  if (a && !b) return -1;
  if (!a && b) return 1;
  return 0;
}

function recipientSourceLabel(source: RecipientSource) {
  if (source === "booking_contacts_only") return "Booking/job/quote contacts only";
  if (source === "customer_email_only") return "Customer account email only";
  if (source === "include_accounts_fallback") return "Job/quote contacts first, then include accounts fallback";
  return "Job/quote contacts first, then non-accounts customer email";
}

function addCandidate(
  list: EmailCandidate[],
  args: {
    email: unknown;
    contactName?: unknown;
    phone?: unknown;
    source: string;
    sourceDate?: string | null;
    priority: number;
  }
) {
  const email = cleanEmail(args.email);
  if (!email) return;

  if (list.some((item) => item.email === email)) return;

  list.push({
    email,
    contactName: clean(args.contactName) || null,
    phone: clean(args.phone) || null,
    source: args.source,
    sourceDate: args.sourceDate ?? null,
    priority: args.priority,
    isAccountsEmail: looksLikeAccountsEmail(email),
  });
}

async function fetchRowsWithFallbacks(args: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  table: string;
  selects: string[];
  clientIds: string[];
}) {
  if (!args.clientIds.length) return [] as any[];

  let lastError: any = null;

  for (const select of args.selects) {
    const { data, error } = await args.supabase
      .from(args.table)
      .select(select)
      .in("client_id", args.clientIds);

    if (!error) return data ?? [];
    lastError = error;
  }

  throw new Error(lastError?.message || `Could not read ${args.table}.`);
}

async function buildCustomerRecipientCandidates(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  clientIds: string[]
) {
  const uniqueClientIds = Array.from(new Set(clientIds.map((id) => String(id ?? "").trim()).filter(Boolean)));
  const map = new Map<string, EmailCandidate[]>();
  for (const id of uniqueClientIds) map.set(id, []);

  if (!uniqueClientIds.length) return map;

  const [jobs, transportJobs, quotes] = await Promise.all([
    fetchRowsWithFallbacks({
      supabase,
      table: "jobs",
      clientIds: uniqueClientIds,
      selects: [
        "id, client_id, job_number, site_name, site_address, contact_name, contact_phone, contact_email, site_contact_email, booking_contact_email, customer_email, invoice_email, notes, status, archived, job_date, start_date, end_date, created_at",
        "id, client_id, job_number, site_name, site_address, contact_name, contact_phone, invoice_email, notes, status, archived, job_date, start_date, end_date, created_at",
        "id, client_id, job_number, site_name, site_address, contact_name, contact_phone, notes, status, archived, job_date, start_date, end_date, created_at",
        "id, client_id, job_number, contact_name, contact_phone, notes, status, archived, job_date, start_date, end_date",
      ],
    }),
    fetchRowsWithFallbacks({
      supabase,
      table: "transport_jobs",
      clientIds: uniqueClientIds,
      selects: [
        "id, client_id, transport_number, collection_contact_name, collection_contact_phone, collection_contact_email, delivery_contact_name, delivery_contact_phone, delivery_contact_email, contact_email, site_contact_email, booking_contact_email, customer_email, invoice_email, load_description, collection_address, delivery_address, notes, status, archived, transport_date, delivery_date, created_at",
        "id, client_id, transport_number, collection_contact_name, collection_contact_phone, delivery_contact_name, delivery_contact_phone, invoice_email, load_description, collection_address, delivery_address, notes, status, archived, transport_date, delivery_date, created_at",
        "id, client_id, transport_number, load_description, collection_address, delivery_address, notes, status, archived, transport_date, delivery_date, created_at",
        "id, client_id, transport_number, load_description, collection_address, delivery_address, notes, status, archived, transport_date, delivery_date",
      ],
    }),
    fetchRowsWithFallbacks({
      supabase,
      table: "quotes",
      clientIds: uniqueClientIds,
      selects: [
        "id, client_id, subject, notes, status, quote_date, created_at, contact_name, contact_email, customer_email, email",
        "id, client_id, subject, notes, status, quote_date, created_at",
        "id, client_id, subject, notes, status, quote_date",
      ],
    }),
  ]);

  for (const job of jobs) {
    const clientId = String(job?.client_id ?? "").trim();
    if (!clientId || !map.has(clientId)) continue;
    if (Boolean(job?.archived)) continue;

    const sourceDate = latestRowDate(job, ["end_date", "start_date", "job_date", "created_at"]);
    const label = `crane job${job?.job_number ? ` #${job.job_number}` : ""}`;
    const candidates = map.get(clientId)!;

    addCandidate(candidates, { email: job?.contact_email, contactName: job?.contact_name, phone: job?.contact_phone, source: `${label} contact email`, sourceDate, priority: 1 });
    addCandidate(candidates, { email: job?.site_contact_email, contactName: job?.contact_name, phone: job?.contact_phone, source: `${label} site contact email`, sourceDate, priority: 1 });
    addCandidate(candidates, { email: job?.booking_contact_email, contactName: job?.contact_name, phone: job?.contact_phone, source: `${label} booking contact email`, sourceDate, priority: 1 });
    addCandidate(candidates, { email: job?.customer_email, contactName: job?.contact_name, phone: job?.contact_phone, source: `${label} customer email`, sourceDate, priority: 2 });

    for (const email of extractEmailsFromText([job?.contact_name, job?.site_name, job?.site_address, job?.notes].join("\n"))) {
      addCandidate(candidates, { email, contactName: job?.contact_name, phone: job?.contact_phone, source: `${label} notes/details`, sourceDate, priority: 4 });
    }

    addCandidate(candidates, { email: job?.invoice_email, contactName: job?.contact_name, phone: job?.contact_phone, source: `${label} invoice email`, sourceDate, priority: 8 });
  }

  for (const job of transportJobs) {
    const clientId = String(job?.client_id ?? "").trim();
    if (!clientId || !map.has(clientId)) continue;
    if (Boolean(job?.archived)) continue;

    const sourceDate = latestRowDate(job, ["delivery_date", "transport_date", "created_at"]);
    const label = `transport job${job?.transport_number ? ` ${job.transport_number}` : ""}`;
    const candidates = map.get(clientId)!;

    addCandidate(candidates, { email: job?.collection_contact_email, contactName: job?.collection_contact_name, phone: job?.collection_contact_phone, source: `${label} collection contact email`, sourceDate, priority: 1 });
    addCandidate(candidates, { email: job?.delivery_contact_email, contactName: job?.delivery_contact_name, phone: job?.delivery_contact_phone, source: `${label} delivery contact email`, sourceDate, priority: 1 });
    addCandidate(candidates, { email: job?.contact_email, contactName: job?.collection_contact_name || job?.delivery_contact_name, phone: job?.collection_contact_phone || job?.delivery_contact_phone, source: `${label} contact email`, sourceDate, priority: 1 });
    addCandidate(candidates, { email: job?.site_contact_email, contactName: job?.delivery_contact_name || job?.collection_contact_name, phone: job?.delivery_contact_phone || job?.collection_contact_phone, source: `${label} site contact email`, sourceDate, priority: 1 });
    addCandidate(candidates, { email: job?.booking_contact_email, contactName: job?.collection_contact_name || job?.delivery_contact_name, phone: job?.collection_contact_phone || job?.delivery_contact_phone, source: `${label} booking contact email`, sourceDate, priority: 1 });
    addCandidate(candidates, { email: job?.customer_email, contactName: job?.collection_contact_name || job?.delivery_contact_name, phone: job?.collection_contact_phone || job?.delivery_contact_phone, source: `${label} customer email`, sourceDate, priority: 2 });

    for (const email of extractEmailsFromText([job?.collection_address, job?.delivery_address, job?.load_description, job?.notes].join("\n"))) {
      addCandidate(candidates, { email, contactName: job?.collection_contact_name || job?.delivery_contact_name, phone: job?.collection_contact_phone || job?.delivery_contact_phone, source: `${label} notes/details`, sourceDate, priority: 4 });
    }

    addCandidate(candidates, { email: job?.invoice_email, contactName: job?.collection_contact_name || job?.delivery_contact_name, phone: job?.collection_contact_phone || job?.delivery_contact_phone, source: `${label} invoice email`, sourceDate, priority: 8 });
  }

  for (const quote of quotes) {
    const clientId = String(quote?.client_id ?? "").trim();
    if (!clientId || !map.has(clientId)) continue;

    const sourceDate = latestRowDate(quote, ["quote_date", "created_at"]);
    const label = `quote${quote?.subject ? ` ${quote.subject}` : ""}`;
    const candidates = map.get(clientId)!;

    addCandidate(candidates, { email: quote?.contact_email, contactName: quote?.contact_name, source: `${label} contact email`, sourceDate, priority: 1 });
    addCandidate(candidates, { email: quote?.customer_email, contactName: quote?.contact_name, source: `${label} customer email`, sourceDate, priority: 2 });
    addCandidate(candidates, { email: quote?.email, contactName: quote?.contact_name, source: `${label} email`, sourceDate, priority: 2 });

    for (const email of extractEmailsFromText([quote?.subject, quote?.notes].join("\n"))) {
      addCandidate(candidates, { email, contactName: quote?.contact_name, source: `${label} notes`, sourceDate, priority: 3 });
    }
  }

  for (const [clientId, candidates] of map.entries()) {
    map.set(
      clientId,
      candidates.sort((a, b) => {
        const accountScore = Number(a.isAccountsEmail) - Number(b.isAccountsEmail);
        if (accountScore !== 0) return accountScore;
        const priorityScore = a.priority - b.priority;
        if (priorityScore !== 0) return priorityScore;
        return compareCandidateDate(a.sourceDate, b.sourceDate);
      })
    );
  }

  return map;
}

function resolveCustomerRecipient(args: {
  customer: any;
  source: RecipientSource;
  candidates: EmailCandidate[];
}) {
  const candidateList = args.candidates ?? [];
  const nonAccountsCandidates = candidateList.filter((candidate) => !candidate.isAccountsEmail);
  const customerEmail = cleanEmail(args.customer?.email);
  const customerEmailIsAccounts = customerEmail ? looksLikeAccountsEmail(customerEmail) : false;

  if (args.source === "customer_email_only") {
    if (!customerEmail) return { recipient: null, reason: "Customer has no email saved." };
    return {
      recipient: {
        email: customerEmail,
        contactName: clean(args.customer?.contact_name) || null,
        phone: clean(args.customer?.phone) || null,
        source: customerEmailIsAccounts ? "customer account email (accounts-style address)" : "customer account email",
        isAccountsEmail: customerEmailIsAccounts,
      },
      reason: "",
    };
  }

  if (args.source === "booking_contacts_only") {
    const picked = nonAccountsCandidates[0] ?? null;
    if (!picked) {
      const accountsOnly = candidateList.some((candidate) => candidate.isAccountsEmail) || customerEmailIsAccounts;
      return {
        recipient: null,
        reason: accountsOnly
          ? "Only accounts/invoice-style email addresses were found. Booking contacts only is selected."
          : "No job, transport or quote contact email found for this customer.",
      };
    }
    return { recipient: picked, reason: "" };
  }

  if (args.source === "include_accounts_fallback") {
    const picked = nonAccountsCandidates[0] ?? candidateList[0] ?? null;
    if (picked) return { recipient: picked, reason: "" };
    if (!customerEmail) return { recipient: null, reason: "No job/quote contact email or customer email found." };
    return {
      recipient: {
        email: customerEmail,
        contactName: clean(args.customer?.contact_name) || null,
        phone: clean(args.customer?.phone) || null,
        source: customerEmailIsAccounts ? "customer account email fallback (accounts-style address)" : "customer account email fallback",
        isAccountsEmail: customerEmailIsAccounts,
      },
      reason: "",
    };
  }

  const picked = nonAccountsCandidates[0] ?? null;
  if (picked) return { recipient: picked, reason: "" };

  if (customerEmail && !customerEmailIsAccounts) {
    return {
      recipient: {
        email: customerEmail,
        contactName: clean(args.customer?.contact_name) || null,
        phone: clean(args.customer?.phone) || null,
        source: "customer account email fallback",
        isAccountsEmail: false,
      },
      reason: "",
    };
  }

  if (customerEmailIsAccounts || candidateList.some((candidate) => candidate.isAccountsEmail)) {
    return {
      recipient: null,
      reason: "Only accounts/invoice-style email addresses were found. Choose Include accounts fallback if you want to email them.",
    };
  }

  return { recipient: null, reason: "No usable marketing email found." };
}

function finaliseCampaignDraftOutput(args: {
  channel: Channel;
  subject: string;
  body: string;
}) {
  const subject = normaliseDraftSubject(String(args.subject ?? ""));

  if (args.channel === "email") {
    return {
      subject,
      body: normaliseDraftBody(args.body),
    };
  }

  return {
    subject,
    body: String(args.body ?? "").trim(),
  };
}

function safeArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normaliseChannel(value: unknown): Channel {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "text" || v === "linkedin") return v;
  return "email";
}

function normaliseGoal(value: unknown): Goal {
  const v = String(value ?? "").trim().toLowerCase();

  if (
    v === "recent_customer_thank_you" ||
    v === "dormant_recovery" ||
    v === "quote_follow_up" ||
    v === "cross_sell" ||
    v === "follow_up" ||
    v === "reactivation" ||
    v === "availability"
  ) {
    return v;
  }

  return "introduction";
}

function aiSafeGoal(goal: Goal): "introduction" | "follow_up" | "reactivation" | "availability" {
  if (goal === "follow_up" || goal === "reactivation" || goal === "availability") return goal;
  if (goal === "dormant_recovery") return "reactivation";
  if (goal === "quote_follow_up") return "follow_up";
  return "introduction";
}

function normaliseTone(value: unknown): Tone {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "friendly" || v === "direct") return v;
  return "professional";
}

function inferCustomerServiceFocus(rollup: any, campaignServiceFocus: string | null) {
  if (campaignServiceFocus) return campaignServiceFocus;

  const craneJobs = Number(rollup?.crm_job_count ?? 0);
  const transportJobs = Number(rollup?.crm_transport_job_count ?? 0);

  if (craneJobs > 0 && transportJobs > 0) {
    return "mobile crane hire, contract lifts and transport support";
  }

  if (transportJobs > 0) {
    return "HIAB transport, transport support and mobile crane hire where required";
  }

  if (craneJobs > 0) {
    return "mobile crane hire, CPA crane hire and contract lifts";
  }

  return "mobile crane hire, contract lifts, HIAB transport and spider crane support";
}

type LeadLike = {
  company_name?: string | null;
  contact_name?: string | null;
  area?: string | null;
  industry?: string | null;
  services?: string[] | null;
};

function companyName(lead: LeadLike) {
  return clean(lead.company_name) || "your business";
}

function looksLikeBusinessName(value: string | null) {
  const name = String(value ?? "").trim().toLowerCase();
  if (!name) return false;

  const businessWords = [
    " ltd",
    " limited",
    " llp",
    " plc",
    " group",
    " holdings",
    " hire",
    " crane",
    " cranes",
    " transport",
    " haulage",
    " logistics",
    " plant",
    " construction",
    " contractors",
    " services",
    " engineering",
    " steel",
    " containers",
    " glazing",
    " roofing",
    " scaffolding",
  ];

  if (businessWords.some((word) => name.includes(word))) return true;

  const words = name.split(/\s+/).filter(Boolean);
  return words.length > 3;
}

function contactName(lead: LeadLike) {
  const contact = clean(lead.contact_name);
  if (!contact) return "there";
  if (looksLikeBusinessName(contact)) return "there";
  return contact;
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
    contact_name: contactName(lead),
    area: "",
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
    return "We support mobile crane hire, contract lifts, HIAB transport, spider cranes, machinery moves, container moves and wider lifting and transport requirements across the UK.";
  }

  if (raw.includes("hiab")) {
    return "We support HIAB transport, container movements, restricted-access deliveries and positioning work, alongside mobile crane hire and specialist lifting support where required.";
  }

  if (raw.includes("spider")) {
    return "We support restricted-access lifting with spider cranes, as well as mobile crane hire, contract lifts and practical lifting support for awkward sites.";
  }

  if (raw.includes("contract")) {
    return "We support full contract lift requirements, mobile crane hire, lifting operations and transport support where needed.";
  }

  if (
    raw.includes("transport") ||
    raw.includes("haulage") ||
    raw.includes("machinery") ||
    raw.includes("container")
  ) {
    return "We support transport, machinery and container movements, as well as HIAB, mobile crane hire and specialist lifting support where required.";
  }

  if (raw.includes("crane")) {
    return "We support mobile crane hire, CPA crane hire, contract lifts, transport assistance and short-notice lifting requirements across the UK.";
  }

  return `We can support ${serviceFocus} as well as wider mobile crane hire, lifting and transport requirements where needed.`;
}

function relevanceLine(lead: LeadLike, serviceFocus: string | null) {
  const industry = clean(lead.industry);

  if (industry) {
    return `I thought it was worth reaching out as we regularly support businesses working in ${industry} and can help with planned and short-notice mobile crane, lifting or transport requirements.`;
  }

  if (serviceFocus) {
    return "I thought it was worth reaching out as this may be relevant to the sort of mobile crane, lifting or transport support your team uses from time to time.";
  }

  return "I thought it was worth making an introduction in case we can help on any upcoming mobile crane, lifting or transport requirements.";
}

function introLine(goal: Goal, tone: Tone) {
  if (goal === "recent_customer_thank_you") {
    if (tone === "direct") return "Thank you for using AnnS Crane Hire recently. I wanted to follow up and keep our wider services on your radar.";
    return "Thank you for using AnnS Crane Hire recently. I wanted to say we appreciate the work and keep our wider support on your radar.";
  }

  if (goal === "dormant_recovery") {
    if (tone === "friendly") return "I just wanted to check back in and put AnnS Crane Hire back on your radar.";
    if (tone === "direct") return "I am checking back in to see whether you have any upcoming lifting or transport requirements we could support.";
    return "I wanted to check back in as we have not worked together for a little while and see whether we can support anything coming up.";
  }

  if (goal === "quote_follow_up") {
    if (tone === "friendly") return "I just wanted to follow up on the quote and check whether you need anything amended.";
    if (tone === "direct") return "I am following up on the quote to confirm whether the dates or requirements are still live.";
    return "I wanted to follow up on the quote and check whether you need anything amended or confirmed.";
  }

  if (goal === "cross_sell") {
    if (tone === "friendly") return "I wanted to check in and make sure you know the full range of support we can provide.";
    if (tone === "direct") return "I am reaching out to make sure you are aware of the wider crane, transport and lifting services we can support.";
    return "I wanted to get in touch to make sure you are aware of the wider services AnnS Crane Hire can provide.";
  }

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

  if (goal === "recent_customer_thank_you") {
    return "If you have any further lifting, transport, HIAB, low loader, spider crane or contract lift requirements coming up, we would be happy to help again.";
  }

  if (goal === "quote_follow_up") {
    return "If the job is still live, I would be happy to firm up availability or make any amendments required.";
  }

  if (goal === "cross_sell") {
    return "If any of these services would be useful on upcoming work, please keep us in mind and I would be happy to help with pricing or availability.";
  }

  if (goal === "dormant_recovery") {
    return "If you have anything coming up, I would be glad to discuss how we may be able to help.";
  }

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
      ? `Best regards
Tom Craig
AnnS Crane Hire`
      : `Kind regards
Tom Craig
AnnS Crane Hire`;
  }

  return tone === "friendly"
    ? `Best regards
Tom Craig
AnnS Crane Hire Ltd`
    : `Kind regards
Tom Craig
AnnS Crane Hire Ltd`;
}

function subjectLine(goal: Goal, serviceFocus: string | null, availabilityNote: string | null) {
  const service = clean(serviceFocus);

  if (goal === "recent_customer_thank_you") return "Thank you from AnnS Crane Hire";
  if (goal === "dormant_recovery") return "Checking in from AnnS Crane Hire";
  if (goal === "quote_follow_up") return "Following up on our quote";
  if (goal === "cross_sell") return "More ways AnnS Crane Hire can support you";

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
      : "Support for upcoming mobile crane hire and lifting requirements";
  }

  return service ? `${service} support from AnnS Crane Hire` : "Mobile crane hire and lifting support from AnnS Crane Hire";
}

function buildQuickCampaignDraft(args: {
  lead: LeadLike;
  channel: Channel;
  goal: Goal;
  tone: Tone;
  serviceFocus: string | null;
  availabilityNote: string | null;
  customCta: string | null;
  subjectHint: string | null;
  bodyHint: string | null;
}) {
  const {
    lead,
    channel,
    goal,
    tone,
    serviceFocus,
    availabilityNote,
    customCta,
    subjectHint,
  } = args;

  if (channel === "text") {
    let body = `Hi, Tom from AnnS Crane Hire here. We support ${serviceFocus || "mobile crane hire and lifting support"} and I wanted to introduce us to ${companyName(lead)}.`;

    if (goal === "recent_customer_thank_you") {
      body = `Hi, Tom from AnnS Crane Hire here. Thank you for using us recently. Just wanted to keep our wider crane hire, contract lift, HIAB, transport and spider crane services on your radar.`;
    }

    if (goal === "follow_up" || goal === "quote_follow_up") {
      body = `Hi, Tom from AnnS Crane Hire here. Just following up to see if ${companyName(lead)} may need any ${serviceFocus || "mobile crane hire and lifting"} support.`;
    }

    if (goal === "reactivation" || goal === "dormant_recovery") {
      body = `Hi, Tom from AnnS Crane Hire here. Just getting back in touch in case ${companyName(lead)} has any upcoming ${serviceFocus || "mobile crane hire and lifting"} requirements we could help with.`;
    }

    if (goal === "availability") {
      body = `Hi, Tom from AnnS Crane Hire here. We currently have availability for ${serviceFocus || "mobile crane hire and lifting support"}. ${availabilityNote ? `${availabilityNote}. ` : ""}Thought I would let ${companyName(lead)} know in case it helps.`;
    }

    if (tone === "friendly") {
      body = body.replace("I wanted to", "just wanted to");
    }

    return {
      subject: "",
      body: `${body} ${ctaLine(goal, "text", customCta)} ${closeLine("text", tone)}`.trim(),
      provider: "fallback" as const,
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
    provider: "fallback" as const,
  };
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authSupabase = createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await authSupabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    const [
      { data: campaign, error: campaignError },
      { data: leadLinks, error: leadLinksError },
      { data: customerLinks, error: customerLinksError },
    ] = await Promise.all([
      supabase
        .from("sales_campaigns")
        .select(`
          *,
          sales_templates:template_id (
            id,
            name,
            channel,
            goal,
            tone,
            service_focus,
            availability_note,
            custom_cta,
            subject_hint,
            body_hint,
            is_active
          )
        `)
        .eq("id", params.id)
        .single(),
      supabase
        .from("sales_campaign_leads")
        .select(`
          id,
          lead_id,
          sales_leads:lead_id (
            id,
            company_name,
            contact_name,
            email,
            phone,
            area,
            industry,
            services,
            status,
            do_not_contact
          )
        `)
        .eq("campaign_id", params.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("sales_campaign_customers")
        .select(`
          id,
          client_id,
          clients:client_id (
            id,
            company_name,
            contact_name,
            email,
            phone,
            notes
          )
        `)
        .eq("campaign_id", params.id)
        .order("created_at", { ascending: true }),
    ]);

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    if (leadLinksError) {
      return NextResponse.json({ error: leadLinksError.message }, { status: 400 });
    }

    if (customerLinksError) {
      return NextResponse.json({ error: customerLinksError.message }, { status: 400 });
    }

    const template = safeArray((campaign as any).sales_templates)[0] ?? null;
    const channel = normaliseChannel((campaign as any).channel || template?.channel);
    const goal = normaliseGoal((campaign as any).goal || template?.goal);
    const tone = normaliseTone((campaign as any).tone || template?.tone);
    const recipientSource = normaliseRecipientSource((campaign as any).recipient_source);

    const totalTargets =
      (leadLinks?.length ?? 0) +
      (customerLinks?.length ?? 0);

    const purposeSpecificFallbackGoals: Goal[] = [
      "recent_customer_thank_you",
      "dormant_recovery",
      "quote_follow_up",
      "cross_sell",
    ];

    const forceFallback = totalTargets > 25 || purposeSpecificFallbackGoals.includes(goal);

    const drafts: Array<{
      target_type: "lead" | "customer";
      target_id: string;
      company_name: string;
      contact_name: string;
      channel: Channel;
      subject: string;
      body: string;
      provider: "openai" | "fallback";
      target_email: string | null;
      target_phone: string | null;
    }> = [];

    const skipped: Array<{
      target_type: "lead" | "customer";
      target_id: string;
      company_name: string;
      reason: string;
    }> = [];

    for (const row of leadLinks ?? []) {
      const lead = safeArray((row as any).sales_leads)[0] ?? null;
      if (!lead?.id) continue;

      if (lead.do_not_contact) {
        skipped.push({
          target_type: "lead",
          target_id: String(lead.id),
          company_name: String(lead.company_name ?? "Unknown lead"),
          reason: "Lead is marked Do Not Contact.",
        });
        continue;
      }

      if (channel === "email" && !lead.email) {
        skipped.push({
          target_type: "lead",
          target_id: String(lead.id),
          company_name: String(lead.company_name ?? "Unknown lead"),
          reason: "Lead has no email saved.",
        });
        continue;
      }

      if (channel === "email") {
        const suppression = await checkMarketingSuppression(supabase, lead.email);
        if (suppression.suppressed) {
          skipped.push({
            target_type: "lead",
            target_id: String(lead.id),
            company_name: String(lead.company_name ?? "Unknown lead"),
            reason: suppression.reason || "Email is suppressed for marketing.",
          });
          continue;
        }
      }

      if (channel === "text" && !lead.phone) {
        skipped.push({
          target_type: "lead",
          target_id: String(lead.id),
          company_name: String(lead.company_name ?? "Unknown lead"),
          reason: "Lead has no phone saved.",
        });
        continue;
      }

      const serviceFocus =
        clean((campaign as any).service_focus) ||
        clean(template?.service_focus) ||
        "mobile crane hire, contract lifts, HIAB transport and spider crane support";

      const availabilityNote =
        clean((campaign as any).availability_note) ||
        clean(template?.availability_note);

      const customCta = clean(template?.custom_cta);
      const subjectHint = clean(template?.subject_hint);
      const bodyHint = clean(template?.body_hint);

      const leadArgs = {
        lead: {
          company_name: lead.company_name,
          contact_name: lead.contact_name,
          area: null,
          industry: lead.industry,
          services: Array.isArray(lead.services) ? lead.services : null,
        },
        channel,
        goal,
        tone,
        serviceFocus,
        availabilityNote,
        customCta,
        subjectHint,
        bodyHint,
      };

      const { draft, provider } = forceFallback
        ? { draft: buildQuickCampaignDraft(leadArgs), provider: "fallback" as const }
        : await generateSalesDraftWithFallback({ ...leadArgs, goal: aiSafeGoal(goal) });

      const finalDraft = finaliseCampaignDraftOutput({
        channel,
        subject: draft.subject,
        body: draft.body,
      });

      drafts.push({
        target_type: "lead",
        target_id: String(lead.id),
        company_name: String(lead.company_name ?? "Unknown lead"),
        contact_name: String(lead.contact_name ?? ""),
        channel,
        subject: finalDraft.subject,
        body: finalDraft.body,
        provider,
        target_email: String(lead.email ?? "").trim() || null,
        target_phone: String(lead.phone ?? "").trim() || null,
      });
    }

    const customerIds = (customerLinks ?? [])
      .map((row: any) => String(row.client_id ?? "").trim())
      .filter(Boolean);

    const rollupByCustomerId = customerIds.length
      ? await getCustomerActivityRollups(supabase, customerIds)
      : new Map<string, any>();

    const recipientCandidatesByCustomerId =
      channel === "email" && customerIds.length
        ? await buildCustomerRecipientCandidates(supabase, customerIds)
        : new Map<string, EmailCandidate[]>();

    for (const row of customerLinks ?? []) {
      const customer = safeArray((row as any).clients)[0] ?? null;
      if (!customer?.id) continue;

      const customerId = String(customer.id);
      const recipientResult =
        channel === "email"
          ? resolveCustomerRecipient({
              customer,
              source: recipientSource,
              candidates: recipientCandidatesByCustomerId.get(customerId) ?? [],
            })
          : {
              recipient: {
                email: cleanEmail(customer.email),
                contactName: clean(customer.contact_name),
                phone: clean(customer.phone),
                source: "customer account",
                isAccountsEmail: looksLikeAccountsEmail(customer.email),
              },
              reason: "",
            };

      const recipient = recipientResult.recipient;

      if (channel === "email" && !recipient?.email) {
        skipped.push({
          target_type: "customer",
          target_id: customerId,
          company_name: String(customer.company_name ?? "Unknown customer"),
          reason: recipientResult.reason || "No usable email address found.",
        });
        continue;
      }

      if (channel === "email" && recipient?.email) {
        const suppression = await checkMarketingSuppression(supabase, recipient.email);
        if (suppression.suppressed) {
          skipped.push({
            target_type: "customer",
            target_id: customerId,
            company_name: String(customer.company_name ?? "Unknown customer"),
            reason: suppression.reason || "Email is suppressed for marketing.",
          });
          continue;
        }
      }

      if (channel === "text" && !customer.phone) {
        skipped.push({
          target_type: "customer",
          target_id: customerId,
          company_name: String(customer.company_name ?? "Unknown customer"),
          reason: "Customer has no phone saved.",
        });
        continue;
      }

      const rollup = rollupByCustomerId.get(customerId) ?? null;

      const serviceFocus = inferCustomerServiceFocus(
        rollup,
        clean((campaign as any).service_focus) || clean(template?.service_focus)
      );

      const availabilityNote =
        clean((campaign as any).availability_note) ||
        clean(template?.availability_note);

      const customCta = clean(template?.custom_cta);
      const subjectHint = clean(template?.subject_hint);
      const customerContactName =
        clean(recipient?.contactName) ||
        clean(customer.contact_name) ||
        "";

      const customerArgs = {
        lead: {
          company_name: customer.company_name,
          contact_name: customerContactName,
          area: null,
          industry: null,
          services: serviceFocus ? [serviceFocus] : null,
        },
        channel,
        goal,
        tone,
        serviceFocus,
        availabilityNote,
        customCta,
        subjectHint,
        bodyHint: null,
      };

      const { draft, provider } = forceFallback
        ? { draft: buildQuickCampaignDraft(customerArgs), provider: "fallback" as const }
        : await generateSalesDraftWithFallback({ ...customerArgs, goal: aiSafeGoal(goal) });

      const finalDraft = finaliseCampaignDraftOutput({
        channel,
        subject: draft.subject,
        body: draft.body,
      });

      drafts.push({
        target_type: "customer",
        target_id: customerId,
        company_name: String(customer.company_name ?? "Unknown customer"),
        contact_name: customerContactName,
        channel,
        subject: finalDraft.subject,
        body: finalDraft.body,
        provider,
        target_email: channel === "email" ? String(recipient?.email ?? "").trim() || null : String(customer.email ?? "").trim() || null,
        target_phone: channel === "text" ? String(customer.phone ?? "").trim() || null : String(recipient?.phone ?? customer.phone ?? "").trim() || null,
      });
    }

    // Supplier/cross-hire campaign targets have been deliberately removed from marketing campaigns.

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "sales_campaign_drafts_generated",
      entity_type: "sales_campaign",
      entity_id: params.id,
      meta: {
        lead_draft_count: drafts.filter((row) => row.target_type === "lead").length,
        customer_draft_count: drafts.filter((row) => row.target_type === "customer").length,
        supplier_draft_count: 0,
        skipped_count: skipped.length,
        provider_mode: forceFallback ? "fallback_batch" : "ai_or_fallback",
        total_targets: totalTargets,
        customer_recipient_source: recipientSource,
        customer_recipient_source_label: recipientSourceLabel(recipientSource),
      },
    });

    return NextResponse.json({
      ok: true,
      campaign: {
        id: params.id,
        name: (campaign as any).name,
        channel,
        goal,
        tone,
      },
      drafts,
      skipped,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to generate campaign drafts." },
      { status: 500 }
    );
  }
}
