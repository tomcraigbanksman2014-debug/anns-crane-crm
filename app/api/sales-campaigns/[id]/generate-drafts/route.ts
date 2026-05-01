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

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
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

    for (const row of customerLinks ?? []) {
      const customer = safeArray((row as any).clients)[0] ?? null;
      if (!customer?.id) continue;

      if (channel === "email" && !customer.email) {
        skipped.push({
          target_type: "customer",
          target_id: String(customer.id),
          company_name: String(customer.company_name ?? "Unknown customer"),
          reason: "Customer has no email saved.",
        });
        continue;
      }

      if (channel === "email") {
        const suppression = await checkMarketingSuppression(supabase, customer.email);
        if (suppression.suppressed) {
          skipped.push({
            target_type: "customer",
            target_id: String(customer.id),
            company_name: String(customer.company_name ?? "Unknown customer"),
            reason: suppression.reason || "Email is suppressed for marketing.",
          });
          continue;
        }
      }

      if (channel === "text" && !customer.phone) {
        skipped.push({
          target_type: "customer",
          target_id: String(customer.id),
          company_name: String(customer.company_name ?? "Unknown customer"),
          reason: "Customer has no phone saved.",
        });
        continue;
      }

      const rollup = rollupByCustomerId.get(String(customer.id)) ?? null;

      const serviceFocus = inferCustomerServiceFocus(
        rollup,
        clean((campaign as any).service_focus) || clean(template?.service_focus)
      );

      const availabilityNote =
        clean((campaign as any).availability_note) ||
        clean(template?.availability_note);

      const customCta = clean(template?.custom_cta);
      const subjectHint = clean(template?.subject_hint);

      const customerArgs = {
        lead: {
          company_name: customer.company_name,
          contact_name: customer.contact_name,
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
        target_id: String(customer.id),
        company_name: String(customer.company_name ?? "Unknown customer"),
        contact_name: String(customer.contact_name ?? ""),
        channel,
        subject: finalDraft.subject,
        body: finalDraft.body,
        provider,
        target_email: String(customer.email ?? "").trim() || null,
        target_phone: String(customer.phone ?? "").trim() || null,
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
