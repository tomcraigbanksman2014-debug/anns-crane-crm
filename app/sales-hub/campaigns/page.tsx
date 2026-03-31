import type { CSSProperties } from "react";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../lib/access";
import { redirect } from "next/navigation";

type LeadRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  area: string | null;
  industry: string | null;
  lead_source: string | null;
  status: string | null;
  services: string[] | null;
  assigned_to_username: string | null;
  archived: boolean | null;
  do_not_contact: boolean | null;
  opportunity_value: number | null;
  probability_percent: number | null;
  expected_close_date: string | null;
  next_follow_up_on: string | null;
  updated_at: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  channel: string;
  goal: string;
  tone: string;
  service_focus: string | null;
  availability_note: string | null;
  custom_cta: string | null;
  subject_hint: string | null;
  body_hint: string | null;
  is_active: boolean;
};

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function moneyGBP(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  });
}

function probabilityForLead(lead: LeadRow) {
  const manual = Number(lead.probability_percent);
  if (Number.isFinite(manual)) {
    return Math.max(0, Math.min(100, manual));
  }

  const status = String(lead.status ?? "").toLowerCase();

  if (status === "new") return 10;
  if (status === "to contact") return 15;
  if (status === "contacted") return 25;
  if (status === "follow up") return 40;
  if (status === "quoted") return 65;
  if (status === "won") return 100;
  if (status === "dormant") return 8;
  return 0;
}

function weightedValueForLead(lead: LeadRow) {
  return Number(lead.opportunity_value ?? 0) * (probabilityForLead(lead) / 100);
}

function fillTokens(
  text: string,
  values: Record<string, string>
) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key] ?? "");
}

function buildDefaultBody(channel: string, goal: string) {
  if (channel === "text") {
    if (goal === "availability") {
      return "Hi {{contact_name}}, it’s Tom from AnnS Crane Hire. We currently have {{service_focus}} availability {{availability_note}}. Let me know if you have anything coming up that we can price for you. {{cta}}";
    }
    if (goal === "reactivation") {
      return "Hi {{contact_name}}, it’s Tom from AnnS Crane Hire. Just reaching out as we haven’t worked together for a while and wanted to see if you have any upcoming lifting or transport requirements. {{cta}}";
    }
    return "Hi {{contact_name}}, it’s Tom from AnnS Crane Hire. We support businesses with {{service_focus}} across the UK and I wanted to introduce our service. {{cta}}";
  }

  if (channel === "linkedin") {
    if (goal === "availability") {
      return "Hi {{contact_name}}, I wanted to reach out as we currently have {{service_focus}} availability {{availability_note}}. If you have any upcoming requirements, I’d be happy to help.";
    }
    if (goal === "reactivation") {
      return "Hi {{contact_name}}, I hope you’re well. I wanted to reconnect and see whether you have any upcoming lifting or transport requirements we may be able to support.";
    }
    return "Hi {{contact_name}}, I’m reaching out from AnnS Crane Hire. We support businesses across the UK with {{service_focus}}, and I thought it would be useful to introduce ourselves.";
  }

  if (goal === "availability") {
    return `Hi {{contact_name}},

I’m reaching out from AnnS Crane Hire as we currently have {{service_focus}} availability {{availability_note}}.

If you have any upcoming requirements, we’d be very happy to help with pricing and availability.

{{cta}}

Kind regards,
Tom Craig
AnnS Crane Hire`;
  }

  if (goal === "reactivation") {
    return `Hi {{contact_name}},

I hope you’re well.

I wanted to get back in touch from AnnS Crane Hire as we haven’t worked together for a little while, and I just wanted to see whether you have any upcoming lifting or transport requirements we may be able to support.

We cover the UK with cranes and transport and would be happy to assist if anything is coming up.

{{cta}}

Kind regards,
Tom Craig
AnnS Crane Hire`;
  }

  if (goal === "follow_up") {
    return `Hi {{contact_name}},

I just wanted to follow up from AnnS Crane Hire regarding your current or upcoming requirements.

We can support with {{service_focus}} and would be happy to provide availability and pricing if useful.

{{cta}}

Kind regards,
Tom Craig
AnnS Crane Hire`;
  }

  return `Hi {{contact_name}},

I’m reaching out from AnnS Crane Hire to introduce our business.

We support customers across the UK with {{service_focus}}, offering a professional and responsive service for both crane and transport requirements.

{{cta}}

Kind regards,
Tom Craig
AnnS Crane Hire`;
}

function buildPreview({
  lead,
  template,
  channel,
  goal,
  tone,
  serviceFocus,
  availabilityNote,
}: {
  lead: LeadRow;
  template: TemplateRow | null;
  channel: string;
  goal: string;
  tone: string;
  serviceFocus: string;
  availabilityNote: string;
}) {
  const cta =
    template?.custom_cta?.trim() ||
    "If this would be of interest, please let me know and I’d be happy to help.";

  const tokenValues = {
    company_name: String(lead.company_name ?? ""),
    contact_name: String(lead.contact_name ?? "there"),
    service_focus: serviceFocus || "crane hire and transport support",
    availability_note: availabilityNote || "",
    cta,
    area: String(lead.area ?? ""),
    industry: String(lead.industry ?? ""),
    lead_source: String(lead.lead_source ?? ""),
    tone,
  };

  const subjectTemplate =
    template?.subject_hint?.trim() ||
    (goal === "availability"
      ? "{{service_focus}} availability for {{company_name}}"
      : goal === "reactivation"
      ? "Checking in from AnnS Crane Hire"
      : "Introduction from AnnS Crane Hire");

  const bodyTemplate =
    template?.body_hint?.trim() || buildDefaultBody(channel, goal);

  return {
    subject: fillTokens(subjectTemplate, tokenValues).trim(),
    body: fillTokens(bodyTemplate, tokenValues).trim(),
  };
}

type CampaignsPageProps = {
  searchParams?: {
    owner?: string;
    service?: string;
    area?: string;
    industry?: string;
    status?: string;
    template_id?: string;
    channel?: string;
    goal?: string;
    tone?: string;
    service_focus?: string;
    availability_note?: string;
    success?: string;
    error?: string;
  };
};

export default async function SalesCampaignsPage({
  searchParams,
}: CampaignsPageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const canManage = !!access.user && canCreateCustomers(access);
  const currentUsername = fromAuthEmail(user?.email ?? null);

  async function createCampaign(formData: FormData) {
    "use server";

    const access = await getAccessContext();

    if (!access.user || !canCreateCustomers(access)) {
      redirect("/sales-hub/campaigns?error=You%20do%20not%20have%20permission%20to%20create%20campaigns.");
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const templateId = String(formData.get("template_id") ?? "").trim() || null;
    const channel = String(formData.get("channel") ?? "email").trim() || "email";
    const goal = String(formData.get("goal") ?? "introduction").trim() || "introduction";
    const tone = String(formData.get("tone") ?? "professional").trim() || "professional";
    const serviceFocus = String(formData.get("service_focus") ?? "").trim() || null;
    const availabilityNote = String(formData.get("availability_note") ?? "").trim() || null;
    const leadIds = formData
      .getAll("lead_ids")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (!name) {
      redirect("/sales-hub/campaigns?error=Campaign%20name%20is%20required.");
    }

    if (!leadIds.length) {
      redirect("/sales-hub/campaigns?error=Select%20at%20least%20one%20lead.");
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("sales_campaigns")
      .insert({
        name,
        description,
        status: "Draft",
        channel,
        goal,
        tone,
        template_id: templateId,
        service_focus: serviceFocus,
        availability_note: availabilityNote,
        created_by_user_id: user?.id ?? null,
        created_by_username: fromAuthEmail(user?.email ?? null) || null,
      })
      .select("id")
      .single();

    if (campaignError || !campaign?.id) {
      redirect(`/sales-hub/campaigns?error=${encodeURIComponent(campaignError?.message || "Could not create campaign.")}`);
    }

    const campaignLeadRows = leadIds.map((leadId) => ({
      campaign_id: campaign.id,
      lead_id: leadId,
    }));

    const { error: linkError } = await supabase
      .from("sales_campaign_leads")
      .insert(campaignLeadRows);

    if (linkError) {
      redirect(`/sales-hub/campaigns?error=${encodeURIComponent(linkError.message)}`);
    }

    const activityRows = leadIds.map((leadId) => ({
      lead_id: leadId,
      entry_type: "campaign",
      subject: `Added to campaign: ${name}`,
      message: `Lead added to campaign "${name}" via Sales Hub Campaign Execution.`,
      created_by_user_id: user?.id ?? null,
      created_by_username: fromAuthEmail(user?.email ?? null) || null,
    }));

    await supabase.from("sales_lead_activity").insert(activityRows);

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_campaign_created",
      entity_type: "sales_campaign",
      entity_id: campaign.id,
      meta: {
        name,
        channel,
        goal,
        tone,
        template_id: templateId,
        selected_lead_count: leadIds.length,
        service_focus: serviceFocus,
      },
    });

    redirect(`/sales-hub/campaigns/${campaign.id}?success=${encodeURIComponent("Campaign created.")}`);
  }

  const [
    { data: leads, error: leadsError },
    { data: templates, error: templatesError },
    { data: campaigns, error: campaignsError },
    { data: campaignLeadLinks },
  ] = await Promise.all([
    supabase
      .from("sales_leads")
      .select(`
        id,
        company_name,
        contact_name,
        email,
        phone,
        area,
        industry,
        lead_source,
        status,
        services,
        assigned_to_username,
        archived,
        do_not_contact,
        opportunity_value,
        probability_percent,
        expected_close_date,
        next_follow_up_on,
        updated_at
      `)
      .eq("archived", false)
      .order("updated_at", { ascending: false }),
    supabase
      .from("sales_templates")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("sales_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("sales_campaign_leads")
      .select("campaign_id, lead_id"),
  ]);

  const allLeads = (leads ?? []) as LeadRow[];
  const activeTemplates = (templates ?? []) as TemplateRow[];

  const selectedOwner = String(searchParams?.owner ?? "all").trim();
  const selectedService = String(searchParams?.service ?? "all").trim();
  const selectedArea = String(searchParams?.area ?? "all").trim();
  const selectedIndustry = String(searchParams?.industry ?? "all").trim();
  const selectedStatus = String(searchParams?.status ?? "all").trim();
  const selectedTemplateId =
    String(searchParams?.template_id ?? "").trim() || String(activeTemplates[0]?.id ?? "");
  const selectedTemplate =
    activeTemplates.find((item) => String(item.id) === selectedTemplateId) || null;

  const selectedChannel =
    String(searchParams?.channel ?? "").trim() ||
    String(selectedTemplate?.channel ?? "email");

  const selectedGoal =
    String(searchParams?.goal ?? "").trim() ||
    String(selectedTemplate?.goal ?? "introduction");

  const selectedTone =
    String(searchParams?.tone ?? "").trim() ||
    String(selectedTemplate?.tone ?? "professional");

  const selectedServiceFocus =
    String(searchParams?.service_focus ?? "").trim() ||
    String(selectedTemplate?.service_focus ?? "") ||
    "crane hire and transport support";

  const selectedAvailabilityNote =
    String(searchParams?.availability_note ?? "").trim() ||
    String(selectedTemplate?.availability_note ?? "");

  const ownerOptions: string[] = Array.from(
    new Set<string>(
      allLeads
        .map((lead) => String(lead.assigned_to_username ?? "").trim())
        .filter(Boolean)
        .concat(currentUsername ? [currentUsername] : [])
    )
  ).sort((a, b) => a.localeCompare(b));

  const serviceOptions: string[] = Array.from(
    new Set<string>(
      allLeads.flatMap((lead) =>
        Array.isArray(lead.services)
          ? lead.services.map((item) => String(item).trim()).filter(Boolean)
          : []
      )
    )
  ).sort((a, b) => a.localeCompare(b));

  const areaOptions: string[] = Array.from(
    new Set<string>(
      allLeads.map((lead) => String(lead.area ?? "").trim()).filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const industryOptions: string[] = Array.from(
    new Set<string>(
      allLeads.map((lead) => String(lead.industry ?? "").trim()).filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const filteredLeads = allLeads.filter((lead) => {
    if (lead.do_not_contact) return false;

    if (selectedOwner !== "all" && String(lead.assigned_to_username ?? "").trim() !== selectedOwner) {
      return false;
    }

    if (
      selectedService !== "all" &&
      !(Array.isArray(lead.services) && lead.services.some((item) => String(item).trim() === selectedService))
    ) {
      return false;
    }

    if (selectedArea !== "all" && String(lead.area ?? "").trim() !== selectedArea) {
      return false;
    }

    if (selectedIndustry !== "all" && String(lead.industry ?? "").trim() !== selectedIndustry) {
      return false;
    }

    if (selectedStatus !== "all" && String(lead.status ?? "").trim() !== selectedStatus) {
      return false;
    }

    return true;
  });

  const leadCountByCampaign = new Map<string, number>();
  for (const link of campaignLeadLinks ?? []) {
    const key = String((link as any).campaign_id ?? "");
    if (!key) continue;
    leadCountByCampaign.set(key, (leadCountByCampaign.get(key) ?? 0) + 1);
  }

  const previews = filteredLeads.slice(0, 5).map((lead) => ({
    lead,
    preview: buildPreview({
      lead,
      template: selectedTemplate,
      channel: selectedChannel,
      goal: selectedGoal,
      tone: selectedTone,
      serviceFocus: selectedServiceFocus,
      availabilityNote: selectedAvailabilityNote,
    }),
  }));

  const stats = {
    totalLeads: filteredLeads.length,
    templates: activeTemplates.length,
    activeCampaigns: (campaigns ?? []).filter((item: any) => String(item.status ?? "") === "Active").length,
    draftCampaigns: (campaigns ?? []).filter((item: any) => String(item.status ?? "") === "Draft").length,
  };

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Campaign Execution</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Build target lists, preview outreach and create campaigns from inside Sales Hub.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub" style={secondaryBtn}>
              ← Sales Hub
            </a>
            <a href="/sales-hub/templates" style={secondaryBtn}>
              Template Library
            </a>
          </div>
        </div>

        {searchParams?.success ? (
          <div style={successCard}>{decodeURIComponent(String(searchParams.success))}</div>
        ) : null}

        {searchParams?.error ? (
          <div style={errorCard}>{decodeURIComponent(String(searchParams.error))}</div>
        ) : null}

        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}
        {templatesError ? <div style={errorCard}>{templatesError.message}</div> : null}
        {campaignsError ? <div style={errorCard}>{campaignsError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Filtered leads" value={String(stats.totalLeads)} />
          <StatCard label="Active templates" value={String(stats.templates)} />
          <StatCard label="Draft campaigns" value={String(stats.draftCampaigns)} />
          <StatCard label="Active campaigns" value={String(stats.activeCampaigns)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Targeting and message settings</h2>

          <form method="get" action="/sales-hub/campaigns" style={filterGrid}>
            <div>
              <label style={labelStyle}>Owner</label>
              <select name="owner" defaultValue={selectedOwner} style={inputStyle}>
                <option value="all">All owners</option>
                {ownerOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Service</label>
              <select name="service" defaultValue={selectedService} style={inputStyle}>
                <option value="all">All services</option>
                {serviceOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Area</label>
              <select name="area" defaultValue={selectedArea} style={inputStyle}>
                <option value="all">All areas</option>
                {areaOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Industry</label>
              <select name="industry" defaultValue={selectedIndustry} style={inputStyle}>
                <option value="all">All industries</option>
                {industryOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Lead status</label>
              <select name="status" defaultValue={selectedStatus} style={inputStyle}>
                <option value="all">All statuses</option>
                <option value="New">New</option>
                <option value="To Contact">To Contact</option>
                <option value="Contacted">Contacted</option>
                <option value="Quoted">Quoted</option>
                <option value="Follow Up">Follow Up</option>
                <option value="Dormant">Dormant</option>
                <option value="Won">Won</option>
                <option value="Lost">Lost</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Template</label>
              <select name="template_id" defaultValue={selectedTemplateId} style={inputStyle}>
                {activeTemplates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Channel</label>
              <select name="channel" defaultValue={selectedChannel} style={inputStyle}>
                <option value="email">Email</option>
                <option value="text">Text</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Goal</label>
              <select name="goal" defaultValue={selectedGoal} style={inputStyle}>
                <option value="introduction">Introduction</option>
                <option value="follow_up">Follow up</option>
                <option value="reactivation">Reactivation</option>
                <option value="availability">Availability</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Tone</label>
              <select name="tone" defaultValue={selectedTone} style={inputStyle}>
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="direct">Direct</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Service focus</label>
              <input
                name="service_focus"
                defaultValue={selectedServiceFocus}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Availability note</label>
              <input
                name="availability_note"
                defaultValue={selectedAvailabilityNote}
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Refresh preview
              </button>
              <a href="/sales-hub/campaigns" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>
        </section>

        <div style={twoColGrid}>
          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Message preview</h2>

            {!previews.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>
                No leads match the current targeting filters.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {previews.map(({ lead, preview }) => (
                  <div key={lead.id} style={previewCard}>
                    <div style={{ fontWeight: 900 }}>
                      {lead.company_name} {lead.contact_name ? `• ${lead.contact_name}` : ""}
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.72 }}>
                      {selectedChannel.toUpperCase()} • {selectedGoal} • {selectedTone}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={miniLabel}>Subject / opener</div>
                      <div style={messageBox}>{preview.subject || "—"}</div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={miniLabel}>Body</div>
                      <div style={messageBox}>{preview.body || "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Recent campaigns</h2>

            {!campaigns?.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No campaigns created yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {(campaigns ?? []).map((campaign: any) => (
                  <a
                    key={campaign.id}
                    href={`/sales-hub/campaigns/${campaign.id}`}
                    style={recentCard}
                  >
                    <div style={{ fontWeight: 900 }}>{campaign.name}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                      {campaign.channel} • {campaign.goal} • {campaign.status}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                      {leadCountByCampaign.get(String(campaign.id)) ?? 0} linked leads
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Create campaign</h2>

          {!canManage ? (
            <div style={mutedBox}>You do not have permission to create campaigns.</div>
          ) : !filteredLeads.length ? (
            <div style={mutedBox}>No leads match the current targeting filters.</div>
          ) : (
            <form action={createCampaign}>
              <input type="hidden" name="template_id" value={selectedTemplateId} />
              <input type="hidden" name="channel" value={selectedChannel} />
              <input type="hidden" name="goal" value={selectedGoal} />
              <input type="hidden" name="tone" value={selectedTone} />
              <input type="hidden" name="service_focus" value={selectedServiceFocus} />
              <input type="hidden" name="availability_note" value={selectedAvailabilityNote} />

              <div style={createGrid}>
                <div>
                  <label style={labelStyle}>Campaign name</label>
                  <input
                    name="name"
                    defaultValue={`${selectedGoal} campaign ${new Date().toLocaleDateString("en-GB")}`}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <input
                    name="description"
                    defaultValue={`Targeted ${selectedChannel} outreach for ${selectedServiceFocus}`}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={miniLabel}>Select leads to include</div>

                <div style={leadList}>
                  {filteredLeads.map((lead) => (
                    <label key={lead.id} style={leadRow}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          name="lead_ids"
                          value={lead.id}
                          style={{ width: 18, height: 18, marginTop: 2 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900 }}>{lead.company_name}</div>
                          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                            {lead.contact_name || "No contact"} • {lead.status || "New"} •{" "}
                            {lead.assigned_to_username || "Unassigned"}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                            {lead.area || "No area"} • {lead.industry || "No industry"} • Weighted{" "}
                            {moneyGBP(weightedValueForLead(lead))}
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <button type="submit" style={primaryBtn}>
                  Create campaign from selected leads
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </ClientShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

const topBar: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const statsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const panelStyle: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const statCard: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const filterGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const createGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box" as const,
};

const primaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const successCard: CSSProperties = {
  background: "rgba(0,160,80,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,160,80,0.18)",
  marginBottom: 12,
};

const errorCard: CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const twoColGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
  gap: 16,
};

const previewCard: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const recentCard: CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const miniLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.68,
};

const messageBox: CSSProperties = {
  marginTop: 4,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "pre-wrap" as const,
  fontSize: 14,
  lineHeight: 1.5,
};

const leadList: CSSProperties = {
  display: "grid",
  gap: 10,
  maxHeight: 520,
  overflow: "auto" as const,
  paddingRight: 4,
};

const leadRow: CSSProperties = {
  display: "block",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  cursor: "pointer",
};

const mutedBox: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.82,
  fontWeight: 700,
};
