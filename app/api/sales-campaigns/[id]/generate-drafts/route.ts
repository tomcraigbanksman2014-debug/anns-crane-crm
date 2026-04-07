import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";
import { generateSalesDraftWithFallback } from "../../../../lib/ai/sales";
import { getCustomerActivityRollups } from "../../../../lib/customerActivity";

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

function inferCustomerServiceFocus(rollup: any, campaignServiceFocus: string | null) {
  if (campaignServiceFocus) return campaignServiceFocus;
  const craneJobs = Number(rollup?.crm_job_count ?? 0);
  const transportJobs = Number(rollup?.crm_transport_job_count ?? 0);
  if (craneJobs > 0 && transportJobs > 0) return "crane hire, contract lifts and transport support";
  if (transportJobs > 0) return "HIAB transport and transport support";
  if (craneJobs > 0) return "crane hire and lifting support";
  return "crane hire and transport support";
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

    const drafts: Array<{
      target_type: "lead" | "customer";
      target_id: string;
      company_name: string;
      contact_name: string;
      channel: Channel;
      subject: string;
      body: string;
      provider: "openai" | "fallback";
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

      const serviceFocus = clean((campaign as any).service_focus) || clean(template?.service_focus) || firstService(lead);
      const availabilityNote = clean((campaign as any).availability_note) || clean(template?.availability_note);
      const customCta = clean(template?.custom_cta);
      const subjectHint = clean(template?.subject_hint);
      const bodyHint = clean(template?.body_hint);

      const { draft, provider } = await generateSalesDraftWithFallback({
        lead: {
          company_name: lead.company_name,
          contact_name: lead.contact_name,
          area: lead.area,
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
      });

      drafts.push({
        target_type: "lead",
        target_id: String(lead.id),
        company_name: String(lead.company_name ?? "Unknown lead"),
        contact_name: String(lead.contact_name ?? ""),
        channel,
        subject: draft.subject,
        body: draft.body,
        provider,
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

      if (!customer.email && !customer.phone) {
        skipped.push({
          target_type: "customer",
          target_id: String(customer.id),
          company_name: String(customer.company_name ?? "Unknown customer"),
          reason: "Customer has no email or phone saved.",
        });
        continue;
      }

      const rollup = rollupByCustomerId.get(String(customer.id)) ?? null;
      const serviceFocus = inferCustomerServiceFocus(
        rollup,
        clean((campaign as any).service_focus) || clean(template?.service_focus)
      );
      const availabilityNote = clean((campaign as any).availability_note) || clean(template?.availability_note);
      const customCta = clean(template?.custom_cta);
      const subjectHint =
        clean(template?.subject_hint) ||
        (goal === "availability"
          ? "{{service_focus}} availability from AnnS Crane Hire"
          : goal === "reactivation"
          ? "Checking in from AnnS Crane Hire"
          : "Following up from AnnS Crane Hire");

      const relationshipBits = [
        Number(rollup?.crm_job_count ?? 0) > 0 ? `${rollup?.crm_job_count} crane jobs` : "",
        Number(rollup?.crm_transport_job_count ?? 0) > 0 ? `${rollup?.crm_transport_job_count} transport jobs` : "",
        Number(rollup?.imported_history_count ?? 0) > 0 ? `${rollup?.imported_history_count} imported history entries` : "",
      ]
        .filter(Boolean)
        .join(" • ");

      const bodyHint = [
        `This is an existing customer called ${String(customer.company_name ?? "")}.`,
        relationshipBits ? `Relationship history: ${relationshipBits}.` : "",
        goal === "reactivation"
          ? "Write as a warm reactivation message for a returning customer."
          : goal === "availability"
          ? "Write as an availability push to an existing customer."
          : "Write as a professional follow-up for an existing customer, not a cold introduction.",
      ]
        .filter(Boolean)
        .join(" ");

      const { draft, provider } = await generateSalesDraftWithFallback({
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
        bodyHint,
      });

      drafts.push({
        target_type: "customer",
        target_id: String(customer.id),
        company_name: String(customer.company_name ?? "Unknown customer"),
        contact_name: String(customer.contact_name ?? ""),
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
      entity_type: "sales_campaign",
      entity_id: params.id,
      meta: {
        lead_draft_count: drafts.filter((row) => row.target_type === "lead").length,
        customer_draft_count: drafts.filter((row) => row.target_type === "customer").length,
        skipped_count: skipped.length,
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
