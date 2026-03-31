import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";
import { generateSalesDraftWithFallback } from "../../../../lib/ai/sales";

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

function firstService(lead: any) {
  const services = Array.isArray(lead?.services) ? (lead.services as string[]) : [];
  return services.find((item) => String(item ?? "").trim()) ?? null;
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
      provider: "openai" | "fallback";
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

      const { draft, provider } = await generateSalesDraftWithFallback({
        lead,
        channel,
        goal,
        tone,
        serviceFocus,
        availabilityNote,
        customCta,
        subjectHint,
        bodyHint,
      });

      drafts.push({
        lead_id: String(lead.id),
        company_name: String(lead.company_name ?? "Lead"),
        contact_name: String(lead.contact_name ?? ""),
        channel,
        subject: draft.subject,
        body: draft.body,
        provider,
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
        provider_mode: process.env.OPENAI_API_KEY ? "openai_with_fallback" : "fallback_only",
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
