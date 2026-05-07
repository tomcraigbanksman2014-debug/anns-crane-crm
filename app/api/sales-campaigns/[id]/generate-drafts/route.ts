import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { writeAuditLog } from "../../../../lib/audit";
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

type DraftOutput = {
  target_type: "lead" | "customer";
  target_id: string;
  company_name: string;
  contact_name: string;
  channel: Channel;
  subject: string;
  body: string;
  provider: "fallback";
  target_email: string | null;
  target_phone: string | null;
};

type SkippedOutput = {
  target_type: "lead" | "customer";
  target_id: string;
  company_name: string;
  reason: string;
};

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
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function cleanEmail(value: unknown) {
  const email = String(value ?? "")
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^[<>()\[\]{}'";,\s]+/g, "")
    .replace(/[<>()\[\]{}'";,\s]+$/g, "")
    .toLowerCase();

  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  return email;
}

function safeArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normaliseChannel(value: unknown): Channel {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "text" || text === "linkedin") return text;
  return "email";
}

function normaliseGoal(value: unknown): Goal {
  const text = String(value ?? "").trim().toLowerCase();

  if (
    text === "recent_customer_thank_you" ||
    text === "dormant_recovery" ||
    text === "quote_follow_up" ||
    text === "cross_sell" ||
    text === "follow_up" ||
    text === "reactivation" ||
    text === "availability"
  ) {
    return text;
  }

  return "introduction";
}

function normaliseTone(value: unknown): Tone {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "friendly" || text === "direct") return text;
  return "professional";
}

function normaliseRecipientSource(value: unknown): RecipientSource {
  const text = String(value ?? "").trim().toLowerCase();

  if (
    text === "booking_contacts_only" ||
    text === "customer_email_only" ||
    text === "include_accounts_fallback"
  ) {
    return text;
  }

  return "job_quote_first";
}

function recipientSourceLabel(source: RecipientSource) {
  if (source === "booking_contacts_only") return "Booking/job/quote contacts only";
  if (source === "customer_email_only") return "Customer account email only";
  if (source === "include_accounts_fallback") return "Job/quote contacts first, then include accounts fallback";
  return "Job/quote contacts first, then non-accounts customer email";
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

function extractEmailsFromText(value: unknown) {
  const matches =
    String(value ?? "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];

  return Array.from(
    new Set(matches.map((email) => cleanEmail(email)).filter(Boolean) as string[])
  );
}

function dateOnly(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match?.[1]) return match[1];

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString().slice(0, 10);
}

function latestDate(row: any, keys: string[]) {
  const dates = keys.map((key) => dateOnly(row?.[key])).filter(Boolean) as string[];
  if (!dates.length) return null;

  dates.sort();
  return dates[dates.length - 1] || null;
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
    contactName: clean(args.contactName),
    phone: clean(args.phone),
    source: args.source,
    sourceDate: args.sourceDate ?? null,
    priority: args.priority,
    isAccountsEmail: looksLikeAccountsEmail(email),
  });
}

async function fetchRowsWithFallbacks(args: {
  supabase: any;
  table: string;
  clientId: string;
  selects: string[];
}) {
  let lastError: any = null;

  for (const select of args.selects) {
    const { data, error } = await args.supabase
      .from(args.table)
      .select(select)
      .eq("client_id", args.clientId)
      .limit(100);

    if (!error) return data ?? [];
    lastError = error;
  }

  throw new Error(lastError?.message || `Could not read ${args.table}.`);
}

async function buildCustomerEmailCandidates(supabase: any, clientId: string) {
  const candidates: EmailCandidate[] = [];

  const [jobs, transportJobs, quotes] = await Promise.all([
    fetchRowsWithFallbacks({
      supabase,
      table: "jobs",
      clientId,
      selects: [
        "id, client_id, job_number, site_name, site_address, contact_name, contact_phone, contact_email, site_contact_email, booking_contact_email, customer_email, invoice_email, notes, archived, job_date, start_date, end_date, created_at",
        "id, client_id, job_number, site_name, site_address, contact_name, contact_phone, invoice_email, notes, archived, job_date, start_date, end_date, created_at",
        "id, client_id, job_number, site_name, site_address, contact_name, contact_phone, notes, archived, job_date, start_date, end_date, created_at",
      ],
    }),
    fetchRowsWithFallbacks({
      supabase,
      table: "transport_jobs",
      clientId,
      selects: [
        "id, client_id, transport_number, collection_contact_name, collection_contact_phone, collection_contact_email, delivery_contact_name, delivery_contact_phone, delivery_contact_email, contact_email, site_contact_email, booking_contact_email, customer_email, invoice_email, load_description, collection_address, delivery_address, notes, archived, transport_date, delivery_date, created_at",
        "id, client_id, transport_number, collection_contact_name, collection_contact_phone, delivery_contact_name, delivery_contact_phone, invoice_email, load_description, collection_address, delivery_address, notes, archived, transport_date, delivery_date, created_at",
        "id, client_id, transport_number, load_description, collection_address, delivery_address, notes, archived, transport_date, delivery_date, created_at",
      ],
    }),
    fetchRowsWithFallbacks({
      supabase,
      table: "quotes",
      clientId,
      selects: [
        "id, client_id, subject, notes, quote_date, created_at, contact_name, contact_email, customer_email, email",
        "id, client_id, subject, notes, quote_date, created_at",
        "id, client_id, subject, notes, quote_date",
      ],
    }),
  ]);

  for (const job of jobs) {
    if (Boolean(job?.archived)) continue;

    const sourceDate = latestDate(job, ["end_date", "start_date", "job_date", "created_at"]);
    const label = `crane job${job?.job_number ? ` #${job.job_number}` : ""}`;

    addCandidate(candidates, {
      email: job?.contact_email,
      contactName: job?.contact_name,
      phone: job?.contact_phone,
      source: `${label} contact email`,
      sourceDate,
      priority: 1,
    });

    addCandidate(candidates, {
      email: job?.site_contact_email,
      contactName: job?.contact_name,
      phone: job?.contact_phone,
      source: `${label} site contact email`,
      sourceDate,
      priority: 1,
    });

    addCandidate(candidates, {
      email: job?.booking_contact_email,
      contactName: job?.contact_name,
      phone: job?.contact_phone,
      source: `${label} booking contact email`,
      sourceDate,
      priority: 1,
    });

    addCandidate(candidates, {
      email: job?.customer_email,
      contactName: job?.contact_name,
      phone: job?.contact_phone,
      source: `${label} customer email`,
      sourceDate,
      priority: 2,
    });

    for (const email of extractEmailsFromText([job?.site_name, job?.site_address, job?.notes].join("\n"))) {
      addCandidate(candidates, {
        email,
        contactName: job?.contact_name,
        phone: job?.contact_phone,
        source: `${label} notes/details`,
        sourceDate,
        priority: 4,
      });
    }

    addCandidate(candidates, {
      email: job?.invoice_email,
      contactName: job?.contact_name,
      phone: job?.contact_phone,
      source: `${label} invoice email`,
      sourceDate,
      priority: 8,
    });
  }

  for (const job of transportJobs) {
    if (Boolean(job?.archived)) continue;

    const sourceDate = latestDate(job, ["delivery_date", "transport_date", "created_at"]);
    const label = `transport job${job?.transport_number ? ` #${job.transport_number}` : ""}`;
    const contactName = job?.collection_contact_name || job?.delivery_contact_name;
    const phone = job?.collection_contact_phone || job?.delivery_contact_phone;

    addCandidate(candidates, {
      email: job?.collection_contact_email,
      contactName: job?.collection_contact_name,
      phone: job?.collection_contact_phone,
      source: `${label} collection contact email`,
      sourceDate,
      priority: 1,
    });

    addCandidate(candidates, {
      email: job?.delivery_contact_email,
      contactName: job?.delivery_contact_name,
      phone: job?.delivery_contact_phone,
      source: `${label} delivery contact email`,
      sourceDate,
      priority: 1,
    });

    addCandidate(candidates, {
      email: job?.contact_email,
      contactName,
      phone,
      source: `${label} contact email`,
      sourceDate,
      priority: 1,
    });

    addCandidate(candidates, {
      email: job?.site_contact_email,
      contactName,
      phone,
      source: `${label} site contact email`,
      sourceDate,
      priority: 1,
    });

    addCandidate(candidates, {
      email: job?.booking_contact_email,
      contactName,
      phone,
      source: `${label} booking contact email`,
      sourceDate,
      priority: 1,
    });

    addCandidate(candidates, {
      email: job?.customer_email,
      contactName,
      phone,
      source: `${label} customer email`,
      sourceDate,
      priority: 2,
    });

    for (const email of extractEmailsFromText([job?.load_description, job?.collection_address, job?.delivery_address, job?.notes].join("\n"))) {
      addCandidate(candidates, {
        email,
        contactName,
        phone,
        source: `${label} notes/details`,
        sourceDate,
        priority: 4,
      });
    }

    addCandidate(candidates, {
      email: job?.invoice_email,
      contactName,
      phone,
      source: `${label} invoice email`,
      sourceDate,
      priority: 8,
    });
  }

  for (const quote of quotes) {
    const sourceDate = latestDate(quote, ["quote_date", "created_at"]);
    const label = `quote${quote?.subject ? ` ${quote.subject}` : ""}`;

    addCandidate(candidates, {
      email: quote?.contact_email,
      contactName: quote?.contact_name,
      source: `${label} contact email`,
      sourceDate,
      priority: 1,
    });

    addCandidate(candidates, {
      email: quote?.customer_email,
      contactName: quote?.contact_name,
      source: `${label} customer email`,
      sourceDate,
      priority: 2,
    });

    addCandidate(candidates, {
      email: quote?.email,
      contactName: quote?.contact_name,
      source: `${label} email`,
      sourceDate,
      priority: 2,
    });

    for (const email of extractEmailsFromText([quote?.subject, quote?.notes].join("\n"))) {
      addCandidate(candidates, {
        email,
        contactName: quote?.contact_name,
        source: `${label} notes/details`,
        sourceDate,
        priority: 4,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;

    if (a.sourceDate && b.sourceDate) {
      const dateCompare = b.sourceDate.localeCompare(a.sourceDate);
      if (dateCompare !== 0) return dateCompare;
    }

    if (a.sourceDate && !b.sourceDate) return -1;
    if (!a.sourceDate && b.sourceDate) return 1;

    return Number(a.isAccountsEmail) - Number(b.isAccountsEmail);
  });

  return candidates;
}

function resolveCustomerRecipient(args: {
  customer: any;
  source: RecipientSource;
  candidates: EmailCandidate[];
}) {
  const customerEmail = cleanEmail(args.customer?.email);
  const customerEmailIsAccounts = looksLikeAccountsEmail(customerEmail);
  const nonAccountsCandidate = args.candidates.find((candidate) => !candidate.isAccountsEmail) ?? null;
  const anyCandidate = args.candidates[0] ?? null;

  if (args.source === "customer_email_only") {
    if (!customerEmail) {
      return { recipient: null, reason: "Customer account has no email saved." };
    }

    if (customerEmailIsAccounts) {
      return {
        recipient: null,
        reason: "Customer account email looks like an accounts/invoice address. Choose Include accounts fallback if you want to email it.",
      };
    }

    return {
      recipient: {
        email: customerEmail,
        contactName: clean(args.customer?.contact_name),
        phone: clean(args.customer?.phone),
        source: "customer account",
        isAccountsEmail: false,
      },
      reason: "",
    };
  }

  if (args.source === "booking_contacts_only") {
    if (nonAccountsCandidate) return { recipient: nonAccountsCandidate, reason: "" };

    return {
      recipient: null,
      reason: args.candidates.length
        ? "Only accounts/invoice-style booking emails were found."
        : "No job, quote or booking contact email found.",
    };
  }

  if (args.source === "include_accounts_fallback") {
    if (nonAccountsCandidate) return { recipient: nonAccountsCandidate, reason: "" };
    if (anyCandidate) return { recipient: anyCandidate, reason: "" };

    if (customerEmail) {
      return {
        recipient: {
          email: customerEmail,
          contactName: clean(args.customer?.contact_name),
          phone: clean(args.customer?.phone),
          source: "customer account",
          isAccountsEmail: customerEmailIsAccounts,
        },
        reason: "",
      };
    }

    return { recipient: null, reason: "No email address found." };
  }

  if (nonAccountsCandidate) return { recipient: nonAccountsCandidate, reason: "" };

  if (customerEmail && !customerEmailIsAccounts) {
    return {
      recipient: {
        email: customerEmail,
        contactName: clean(args.customer?.contact_name),
        phone: clean(args.customer?.phone),
        source: "customer account",
        isAccountsEmail: false,
      },
      reason: "",
    };
  }

  if (customerEmailIsAccounts || args.candidates.some((candidate) => candidate.isAccountsEmail)) {
    return {
      recipient: null,
      reason: "Only accounts/invoice-style email addresses were found. Choose Include accounts fallback if you want to email them.",
    };
  }

  return { recipient: null, reason: "No usable marketing email found." };
}

function companyName(lead: any) {
  return clean(lead?.company_name) || "your business";
}

function looksLikeBusinessName(value: unknown) {
  const name = String(value ?? "").trim().toLowerCase();
  if (!name) return false;

  const businessWords = [
    "ltd",
    "limited",
    "plc",
    "group",
    "services",
    "scaffolding",
    "construction",
    "engineering",
    "hire",
    "plant",
    "steel",
  ];

  if (businessWords.some((word) => name.includes(word))) return true;

  return name.split(/\s+/).filter(Boolean).length > 3;
}

function contactName(lead: any) {
  const contact = clean(lead?.contact_name);
  if (!contact) return "there";
  if (looksLikeBusinessName(contact)) return "there";
  return contact;
}

function inferServiceFocusFromText(value: unknown) {
  const text = String(value ?? "").toLowerCase();

  if (text.includes("jekko") || text.includes("spider")) return "Jekko / spider crane hire";
  if (text.includes("hk40") || text.includes("hk 40")) return "HK40 crane hire";
  if (text.includes("80t") || text.includes("80 t") || text.includes("80 tonne") || text.includes("grove")) return "80t mobile crane hire";
  if (text.includes("low loader") || text.includes("lowloader") || text.includes("step frame")) return "low loader transport";
  if (text.includes("hiab")) return "HIAB transport";
  if (text.includes("abnormal") || text.includes("escort")) return "abnormal load transport";
  if (text.includes("contract lift")) return "contract lift support";
  if (text.includes("crane")) return "mobile crane hire";

  return null;
}

function noteConflictsWithService(note: string | null, serviceFocus: string | null) {
  if (!note || !serviceFocus) return false;

  const noteText = note.toLowerCase();
  const serviceText = serviceFocus.toLowerCase();

  const serviceGroups = [
    { key: "spider", words: ["spider", "jekko"] },
    { key: "lowloader", words: ["low loader", "lowloader", "step frame"] },
    { key: "hiab", words: ["hiab"] },
    { key: "hk40", words: ["hk40", "hk 40"] },
    { key: "abnormal", words: ["abnormal", "escort"] },
    { key: "contract", words: ["contract lift"] },
  ];

  const serviceGroup = serviceGroups.find((group) =>
    group.words.some((word) => serviceText.includes(word))
  );

  if (!serviceGroup) return false;

  return serviceGroups.some((group) => {
    if (group.key === serviceGroup.key) return false;
    return group.words.some((word) => noteText.includes(word));
  });
}

function servicePitch(serviceFocus: string | null) {
  const raw = String(serviceFocus ?? "").trim().toLowerCase();

  if (!raw) {
    return "We support mobile crane hire, contract lifts, HIAB transport, spider cranes, machinery moves, container moves and wider lifting and transport requirements across the UK.";
  }

  if (raw.includes("spider") || raw.includes("jekko")) {
    return "This is ideal for restricted-access lifting, tight sites, internal lifts, glazing, machinery positioning and awkward places where a larger crane is not practical.";
  }

  if (raw.includes("hiab")) {
    return "This is ideal for loads that need collecting, delivering, lifting, placing or positioning without needing a separate crane on site.";
  }

  if (
    raw.includes("low loader") ||
    raw.includes("lowloader") ||
    raw.includes("haulage") ||
    raw.includes("transport")
  ) {
    return "This is ideal for plant, machinery, containers, site-to-site moves and heavy or awkward loads that need planning properly.";
  }

  if (raw.includes("contract")) {
    return "This is ideal where you need the lift planned and managed properly, with the right paperwork, personnel and supervision in place.";
  }

  if (raw.includes("crane")) {
    return "This is ideal for planned lifts, short-notice lifting requirements, site support and keeping jobs moving safely.";
  }

  return `We can support ${serviceFocus} as well as wider mobile crane hire, lifting and transport requirements where needed.`;
}

function subjectLine(goal: Goal, serviceFocus: string | null) {
  const service = clean(serviceFocus);

  if (goal === "recent_customer_thank_you") return "Thank you from AnnS Crane Hire";
  if (goal === "dormant_recovery") return "Checking in from AnnS Crane Hire";
  if (goal === "quote_follow_up") return "Following up on our quote";
  if (goal === "cross_sell") return "More ways AnnS Crane Hire can support you";
  if (goal === "availability") return service ? `${service} availability from AnnS Crane Hire` : "Availability from AnnS Crane Hire";
  if (goal === "follow_up") return service ? `Following up – ${service} support` : "Following up from AnnS Crane Hire";
  if (goal === "reactivation") return service ? `Support for upcoming ${service} requirements` : "Support for upcoming mobile crane hire and lifting requirements";

  return service ? `${service} support from AnnS Crane Hire` : "Mobile crane hire and lifting support from AnnS Crane Hire";
}

function ctaLine(goal: Goal, channel: Channel) {
  if (channel === "text") {
    if (goal === "availability") return "If useful, reply here and I will send over availability and pricing.";
    return "If it is worth a quick chat, just reply here and I can come back to you.";
  }

  if (channel === "linkedin") {
    if (goal === "availability") return "If useful, feel free to message me back and I can send over more detail.";
    return "If it would be useful, I would be happy to message over more detail or have a quick call.";
  }

  if (goal === "availability") return "If this could help with any upcoming work, just reply to this email and I can confirm availability and get pricing over to you.";
  if (goal === "recent_customer_thank_you") return "If you have any further lifting, transport, HIAB, low loader, spider crane or contract lift requirements coming up, we would be happy to help again.";
  if (goal === "quote_follow_up") return "If the job is still live, I would be happy to firm up availability or make any amendments required.";
  if (goal === "cross_sell") return "If any of these services would be useful on upcoming work, please keep us in mind and I would be happy to help with pricing or availability.";

  return "If it would be useful, I would be happy to have a quick call or send over more information.";
}

function closeLine(channel: Channel, tone: Tone) {
  if (channel === "text") return "Tom Craig, AnnS Crane Hire";

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

function buildDraft(args: {
  lead: any;
  channel: Channel;
  goal: Goal;
  tone: Tone;
  serviceFocus: string | null;
  availabilityNote: string | null;
}) {
  const { lead, channel, goal, tone, serviceFocus } = args;

  const availabilityNote = noteConflictsWithService(args.availabilityNote, serviceFocus)
    ? null
    : args.availabilityNote;

  if (channel === "text") {
    let body = `Hi, Tom from AnnS Crane Hire here. We support ${serviceFocus || "mobile crane hire and lifting support"} and I wanted to introduce us to ${companyName(lead)}.`;

    if (goal === "availability") {
      body = `Hi, Tom from AnnS Crane Hire here. We have upcoming availability for ${serviceFocus || "mobile crane hire and lifting support"}. ${availabilityNote ? `${availabilityNote}. ` : ""}Thought I would let ${companyName(lead)} know in case it helps.`;
    }

    if (goal === "recent_customer_thank_you") {
      body = "Hi, Tom from AnnS Crane Hire here. Thank you for using us recently. Just wanted to keep our wider crane hire, contract lift, HIAB, transport and spider crane services on your radar.";
    }

    if (goal === "follow_up" || goal === "quote_follow_up") {
      body = `Hi, Tom from AnnS Crane Hire here. Just following up to see if ${companyName(lead)} may need any ${serviceFocus || "mobile crane hire and lifting"} support.`;
    }

    if (goal === "reactivation" || goal === "dormant_recovery") {
      body = `Hi, Tom from AnnS Crane Hire here. Just getting back in touch in case ${companyName(lead)} has any upcoming ${serviceFocus || "mobile crane hire and lifting"} requirements we could help with.`;
    }

    if (tone === "friendly") {
      body = body.replace("I wanted to", "just wanted to");
    }

    return {
      subject: "",
      body: `${body} ${ctaLine(goal, "text")} ${closeLine("text", tone)}`.trim(),
    };
  }

  const lines: string[] = [`Hi ${contactName(lead)},`, ""];

  if (goal === "availability") {
    lines.push(
      serviceFocus
        ? `I wanted to let you know that we have upcoming availability for ${serviceFocus}.`
        : "I wanted to let you know that we have upcoming availability that may be useful for any planned or short-notice work.",
      ""
    );

    if (availabilityNote) {
      lines.push(availabilityNote, "");
    }

    lines.push(servicePitch(serviceFocus), "", ctaLine(goal, channel));
  } else if (goal === "recent_customer_thank_you") {
    lines.push(
      "Thank you for using AnnS Crane Hire recently. We appreciate the work and wanted to keep our wider support on your radar.",
      "",
      servicePitch(serviceFocus),
      "",
      ctaLine(goal, channel)
    );
  } else if (goal === "quote_follow_up") {
    lines.push(
      "I wanted to follow up on the quote and check whether you need anything amended or confirmed.",
      "",
      ctaLine(goal, channel)
    );
  } else if (goal === "dormant_recovery" || goal === "reactivation") {
    lines.push(
      "I wanted to check back in as we have not worked together for a little while and see whether we can support anything coming up.",
      "",
      servicePitch(serviceFocus),
      "",
      ctaLine(goal, channel)
    );
  } else if (goal === "cross_sell") {
    lines.push(
      "I wanted to make sure you are aware of the wider services AnnS Crane Hire can provide.",
      "",
      servicePitch(serviceFocus),
      "",
      ctaLine(goal, channel)
    );
  } else {
    lines.push(
      `I am reaching out to introduce AnnS Crane Hire and see whether we could support ${companyName(lead)} with upcoming lifting or transport requirements.`,
      "",
      servicePitch(serviceFocus),
      "",
      ctaLine(goal, channel)
    );
  }

  if (channel !== "email") {
    lines.push("", closeLine(channel, tone));
  }

  return {
    subject: channel === "email" ? subjectLine(goal, serviceFocus) : "",
    body: cleanWhitespace(lines.join("\n")),
  };
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

function resolveServiceFocus(args: {
  campaign: any;
  template: any;
}) {
  return (
    clean(args.campaign?.service_focus) ||
    clean(args.template?.service_focus) ||
    inferServiceFocusFromText(args.campaign?.name) ||
    inferServiceFocusFromText(args.template?.name) ||
    null
  );
}

function resolveAvailabilityNote(args: {
  campaign: any;
  template: any;
  serviceFocus: string | null;
}) {
  const note = clean(args.campaign?.availability_note) || clean(args.template?.availability_note);

  if (noteConflictsWithService(note, args.serviceFocus)) {
    return null;
  }

  return note;
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
    const serviceFocus = resolveServiceFocus({ campaign, template });
    const availabilityNote = resolveAvailabilityNote({ campaign, template, serviceFocus });

    const totalTargets = (leadLinks?.length ?? 0) + (customerLinks?.length ?? 0);
    const drafts: DraftOutput[] = [];
    const skipped: SkippedOutput[] = [];

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

      const draft = buildDraft({
        lead,
        channel,
        goal,
        tone,
        serviceFocus,
        availabilityNote,
      });

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
        provider: "fallback",
        target_email: String(lead.email ?? "").trim() || null,
        target_phone: String(lead.phone ?? "").trim() || null,
      });
    }

    for (const row of customerLinks ?? []) {
      const customer = safeArray((row as any).clients)[0] ?? null;
      if (!customer?.id) continue;

      const customerId = String(customer.id);
      const candidates =
        channel === "email"
          ? await buildCustomerEmailCandidates(supabase, customerId)
          : [];

      const recipientResult =
        channel === "email"
          ? resolveCustomerRecipient({
              customer,
              source: recipientSource,
              candidates,
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

      const contactName =
        clean(recipient?.contactName) ||
        clean(customer.contact_name) ||
        "";

      const draft = buildDraft({
        lead: {
          company_name: customer.company_name,
          contact_name: contactName,
        },
        channel,
        goal,
        tone,
        serviceFocus,
        availabilityNote,
      });

      const finalDraft = finaliseCampaignDraftOutput({
        channel,
        subject: draft.subject,
        body: draft.body,
      });

      drafts.push({
        target_type: "customer",
        target_id: customerId,
        company_name: String(customer.company_name ?? "Unknown customer"),
        contact_name: contactName,
        channel,
        subject: finalDraft.subject,
        body: finalDraft.body,
        provider: "fallback",
        target_email:
          channel === "email"
            ? String(recipient?.email ?? "").trim() || null
            : String(customer.email ?? "").trim() || null,
        target_phone:
          channel === "text"
            ? String(customer.phone ?? "").trim() || null
            : String(recipient?.phone ?? customer.phone ?? "").trim() || null,
      });
    }

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
        provider_mode: "controlled_fallback",
        total_targets: totalTargets,
        customer_recipient_source: recipientSource,
        customer_recipient_source_label: recipientSourceLabel(recipientSource),
        service_focus: serviceFocus,
        availability_note_used: availabilityNote,
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
