import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";

type Channel = "email" | "text" | "linkedin";
type Goal = "introduction" | "follow_up" | "reactivation" | "availability";
type Tone = "professional" | "friendly" | "direct";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
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
  if (v === "follow_up" || v === "reactivation" || v === "availability") return v;
  return "introduction";
}

function normaliseTone(value: unknown): Tone {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "friendly" || v === "direct") return v;
  return "professional";
}

function leadName(lead: any) {
  return clean(lead?.contact_name) || clean(lead?.company_name) || "there";
}

function companyName(lead: any) {
  return clean(lead?.company_name) || "your business";
}

function firstService(lead: any) {
  const services = Array.isArray(lead?.services) ? (lead.services as string[]) : [];
  return services.find((item) => String(item ?? "").trim()) ?? null;
}

function interpolate(
  input: string | null | undefined,
  lead: any,
  values: {
    service_focus: string | null;
    availability_note: string | null;
    custom_cta: string | null;
  }
) {
  const raw = String(input ?? "");
  if (!raw) return "";

  return raw
    .replace(/\{company_name\}/gi, companyName(lead))
    .replace(/\{contact_name\}/gi, clean(lead?.contact_name) || companyName(lead))
    .replace(/\{area\}/gi, clean(lead?.area) || "")
    .replace(/\{industry\}/gi, clean(lead?.industry) || "")
    .replace(/\{service_focus\}/gi, values.service_focus || "")
    .replace(/\{availability_note\}/gi, values.availability_note || "")
    .replace(/\{custom_cta\}/gi, values.custom_cta || "");
}

function servicePitch(serviceFocus: string | null) {
  const raw = String(serviceFocus ?? "").trim().toLowerCase();

  if (!raw) {
    return "We support crane hire, HIAB transport, contract lifts, spider cranes and general lifting and transport work across the UK.";
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

  if (raw.includes("transport") || raw.includes("haulage") || raw.includes("machinery") || raw.includes("container")) {
    return "We support transport, machinery and container movements, as well as HIAB and specialist lifting support where required.";
  }

  if (raw.includes("crane")) {
    return "We support crane hire, contract lifts, transport assistance and short-notice lifting requirements across the UK.";
  }

  return `We can support ${serviceFocus} as well as wider crane and transport requirements where needed.`;
}

function relevanceLine(lead: any, serviceFocus: string | null) {
  const industry = clean(lead?.industry);
  const area = clean(lead?.area);

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

function buildEmailDraft(
  lead: any,
  goal: Goal,
  tone: Tone,
  serviceFocus: string | null,
  availabilityNote: string | null,
  customCta: string | null,
  subjectHint: string | null,
  bodyHint: string | null
) {
  const hintValues = {
    service_focus: serviceFocus,
    availability_note: availabilityNote,
    custom_cta: customCta,
  };

  const hintText = interpolate(bodyHint, lead, hintValues);

  const lines = [
    `Hi ${leadName(lead)},`,
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

  if (hintText) {
    lines.push("", hintText);
  }

  lines.push("", ctaLine(goal, "email", customCta), "", closeLine("email", tone));

  return {
    subject:
      interpolate(subjectHint, lead, hintValues) ||
      subjectLine(goal, serviceFocus, availabilityNote),
    body: lines.join("\n"),
  };
}

function buildLinkedInDraft(
  lead: any,
  goal: Goal,
  tone: Tone,
  serviceFocus: string | null,
  availabilityNote: string | null,
  customCta: string | null,
  bodyHint: string | null
) {
  const hintValues = {
    service_focus: serviceFocus,
    availability_note: availabilityNote,
    custom_cta: customCta,
  };

  const parts = [
    `Hi ${leadName(lead)},`,
    "",
    introLine(goal, tone),
    relevanceLine(lead, serviceFocus),
    servicePitch(serviceFocus),
  ];

  if (goal === "availability" && availabilityNote) {
    parts.push(`Current availability: ${availabilityNote}`);
  }

  const hintText = interpolate(bodyHint, lead, hintValues);
  if (hintText) {
    parts.push(hintText);
  }

  parts.push(ctaLine(goal, "linkedin", customCta), "", closeLine("linkedin", tone));

  return {
    subject: "",
    body: parts.join("\n\n"),
  };
}

function buildTextDraft(
  lead: any,
  goal: Goal,
  tone: Tone,
  serviceFocus: string | null,
  availabilityNote: string | null,
  customCta: string | null
) {
  const company = companyName(lead);
  const service = clean(serviceFocus) || "crane and transport support";

  let body = `Hi, Tom from AnnS Crane Hire here. We support ${service} and I wanted to introduce us to ${company}.`;

  if (goal === "follow_up") {
    body = `Hi, Tom from AnnS Crane Hire here. Just following up to see if ${company} may need any ${service} support.`;
  }

  if (goal === "reactivation") {
    body = `Hi, Tom from AnnS Crane Hire here. Just getting back in touch in case ${company} has any upcoming ${service} requirements we could help with.`;
  }

  if (goal === "availability") {
    body = `Hi, Tom from AnnS Crane Hire here. We currently have availability for ${service}. ${availabilityNote ? `${availabilityNote}. ` : ""}Thought I would let ${company} know in case it helps.`;
  }

  if (tone === "friendly") {
    body = body.replace("I wanted to", "just wanted to");
  }

  return {
    subject: "",
    body: `${body} ${ctaLine(goal, "text", customCta)} ${closeLine("text", tone)}`.trim(),
  };
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [
      { data: campaign, error: campaignError },
      { data: links, error: linksError },
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
    ]);

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 400 });
    }

    const template = safeArray((campaign as any).sales_templates)[0] ?? null;

    const channel = normaliseChannel((campaign as any).channel || template?.channel);
    const goal = normaliseGoal((campaign as any).goal || template?.goal);
    const tone = normaliseTone((campaign as any).tone || template?.tone);

    const drafts: Array<{
      lead_id: string;
      company_name: string;
      contact_name: string;
      channel: Channel;
      subject: string;
      body: string;
    }> = [];

    const skipped: Array<{
      lead_id: string;
      company_name: string;
      reason: string;
    }> = [];

    for (const row of links ?? []) {
      const lead = safeArray((row as any).sales_leads)[0] ?? null;
      if (!lead?.id) continue;

      if (lead.do_not_contact) {
        skipped.push({
          lead_id: String(lead.id),
          company_name: String(lead.company_name ?? "Lead"),
          reason: "Lead marked Do Not Contact",
        });
        continue;
      }

      const serviceFocus =
        clean((campaign as any).service_focus) ||
        clean(template?.service_focus) ||
        firstService(lead);

      const availabilityNote =
        clean((campaign as any).availability_note) ||
        clean(template?.availability_note);

      const customCta = clean(template?.custom_cta);
      const subjectHint = clean(template?.subject_hint);
      const bodyHint = clean(template?.body_hint);

      let draft: { subject: string; body: string };

      if (channel === "text") {
        draft = buildTextDraft(
          lead,
          goal,
          tone,
          serviceFocus,
          availabilityNote,
          customCta
        );
      } else if (channel === "linkedin") {
        draft = buildLinkedInDraft(
          lead,
          goal,
          tone,
          serviceFocus,
          availabilityNote,
          customCta,
          bodyHint
        );
      } else {
        draft = buildEmailDraft(
          lead,
          goal,
          tone,
          serviceFocus,
          availabilityNote,
          customCta,
          subjectHint,
          bodyHint
        );
      }

      drafts.push({
        lead_id: String(lead.id),
        company_name: String(lead.company_name ?? "Lead"),
        contact_name: String(lead.contact_name ?? ""),
        channel,
        subject: draft.subject,
        body: draft.body,
      });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "sales_campaign_drafts_generated",
      entity_type: "sales_campaign_runner",
      entity_id: params.id,
      meta: {
        campaign_id: params.id,
        campaign_name: (campaign as any).name ?? null,
        channel,
        goal,
        tone,
        generated_count: drafts.length,
        skipped_count: skipped.length,
      },
    });

    return NextResponse.json({
      ok: true,
      campaign: {
        id: params.id,
        name: (campaign as any).name ?? "",
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
