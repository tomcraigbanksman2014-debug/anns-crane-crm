import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../../lib/access";
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
  opportunity_value: number | null;
  probability_percent: number | null;
  expected_close_date: string | null;
  next_follow_up_on: string | null;
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

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
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
  const manual = Number(lead?.probability_percent);
  if (Number.isFinite(manual)) {
    return Math.max(0, Math.min(100, manual));
  }

  const status = String(lead?.status ?? "").toLowerCase();

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

type CampaignDetailPageProps = {
  params: { id: string };
  searchParams?: {
    success?: string;
    error?: string;
  };
};

export default async function CampaignDetailPage({
  params,
  searchParams,
}: CampaignDetailPageProps) {
  const supabase = createSupabaseServerClient();

  async function updateCampaignStatus(formData: FormData) {
    "use server";

    const access = await getAccessContext();

    if (!access.user || !canCreateCustomers(access)) {
      redirect(`/sales-hub/campaigns/${params.id}?error=${encodeURIComponent("You do not have permission to update campaigns.")}`);
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const status = String(formData.get("status") ?? "").trim() || "Draft";

    const { error } = await supabase
      .from("sales_campaigns")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (error) {
      redirect(`/sales-hub/campaigns/${params.id}?error=${encodeURIComponent(error.message)}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_campaign_status_updated",
      entity_type: "sales_campaign",
      entity_id: params.id,
      meta: { status },
    });

    redirect(`/sales-hub/campaigns/${params.id}?success=${encodeURIComponent("Campaign updated.")}`);
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("sales_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (campaignError || !campaign) {
    return (
      <ClientShell>
        <div style={{ width: "min(1260px, 96vw)", margin: "0 auto" }}>
          <div style={errorCard}>{campaignError?.message || "Campaign not found."}</div>
        </div>
      </ClientShell>
    );
  }

  const [
    { data: template },
    { data: campaignLeadLinks, error: linkError },
  ] = await Promise.all([
    campaign.template_id
      ? supabase
          .from("sales_templates")
          .select("*")
          .eq("id", campaign.template_id)
          .single()
      : Promise.resolve({ data: null as TemplateRow | null }),
    supabase
      .from("sales_campaign_leads")
      .select("lead_id")
      .eq("campaign_id", params.id),
  ]);

  const leadIds = (campaignLeadLinks ?? [])
    .map((row: any) => String(row.lead_id ?? "").trim())
    .filter(Boolean);

  const { data: linkedLeads, error: leadsError } =
    leadIds.length > 0
      ? await supabase
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
            opportunity_value,
            probability_percent,
            expected_close_date,
            next_follow_up_on
          `)
          .in("id", leadIds)
      : { data: [] as LeadRow[], error: null as any };

  const orderedLeads = leadIds
    .map((id) => (linkedLeads ?? []).find((lead: any) => String(lead.id) === id))
    .filter(Boolean) as LeadRow[];

  return (
    <ClientShell>
      <div style={{ width: "min(1260px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>{campaign.name}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Review target leads, preview messages and manage campaign status.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub/campaigns" style={secondaryBtn}>
              ← Campaigns
            </a>
            <a href="/sales-hub/templates" style={secondaryBtn}>
              Templates
            </a>
          </div>
        </div>

        {searchParams?.success ? (
          <div style={successCard}>{decodeURIComponent(String(searchParams.success))}</div>
        ) : null}

        {searchParams?.error ? (
          <div style={errorCard}>{decodeURIComponent(String(searchParams.error))}</div>
        ) : null}

        {linkError ? <div style={errorCard}>{linkError.message}</div> : null}
        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Status" value={String(campaign.status ?? "Draft")} />
          <StatCard label="Channel" value={String(campaign.channel ?? "email")} />
          <StatCard label="Goal" value={String(campaign.goal ?? "introduction")} />
          <StatCard label="Linked leads" value={String(orderedLeads.length)} />
        </div>

        <div style={twoColGrid}>
          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Campaign summary</h2>

            <div style={{ display: "grid", gap: 10 }}>
              <InfoRow label="Name">{campaign.name}</InfoRow>
              <InfoRow label="Description">{campaign.description || "—"}</InfoRow>
              <InfoRow label="Template">{template?.name || "No template linked"}</InfoRow>
              <InfoRow label="Channel">{campaign.channel || "email"}</InfoRow>
              <InfoRow label="Goal">{campaign.goal || "introduction"}</InfoRow>
              <InfoRow label="Tone">{campaign.tone || "professional"}</InfoRow>
              <InfoRow label="Service focus">{campaign.service_focus || "—"}</InfoRow>
              <InfoRow label="Availability note">{campaign.availability_note || "—"}</InfoRow>
              <InfoRow label="Created by">{campaign.created_by_username || "—"}</InfoRow>
              <InfoRow label="Created">{fmtDateTime(campaign.created_at)}</InfoRow>
            </div>

            <form action={updateCampaignStatus} style={{ marginTop: 18, display: "grid", gap: 10 }}>
              <div>
                <label style={labelStyle}>Update status</label>
                <select name="status" defaultValue={String(campaign.status ?? "Draft")} style={inputStyle}>
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <button type="submit" style={primaryBtn}>
                  Save campaign status
                </button>
              </div>
            </form>
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Target list</h2>

            {!orderedLeads.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No linked leads in this campaign.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {orderedLeads.map((lead) => (
                  <a
                    key={lead.id}
                    href={`/sales-hub/leads/${lead.id}`}
                    style={leadCard}
                  >
                    <div style={{ fontWeight: 900 }}>{lead.company_name}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                      {lead.contact_name || "No contact"} • {lead.status || "New"} •{" "}
                      {lead.assigned_to_username || "Unassigned"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                      Weighted {moneyGBP(weightedValueForLead(lead))}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Generated message previews</h2>

          {!orderedLeads.length ? (
            <p style={{ margin: 0, opacity: 0.78 }}>No message previews available because no leads are linked.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {orderedLeads.map((lead) => {
                const preview = buildPreview({
                  lead,
                  template: (template as TemplateRow | null) || null,
                  channel: String(campaign.channel ?? "email"),
                  goal: String(campaign.goal ?? "introduction"),
                  tone: String(campaign.tone ?? "professional"),
                  serviceFocus: String(campaign.service_focus ?? "") || "crane hire and transport support",
                  availabilityNote: String(campaign.availability_note ?? ""),
                });

                return (
                  <div key={lead.id} style={previewCard}>
                    <div style={{ fontWeight: 900 }}>
                      {lead.company_name} {lead.contact_name ? `• ${lead.contact_name}` : ""}
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.72 }}>
                      {String(campaign.channel ?? "email").toUpperCase()} • {String(campaign.goal ?? "introduction")}
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
                );
              })}
            </div>
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

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 700, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

const topBar = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const panelStyle = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const statCard = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle = {
  marginTop: 0,
  fontSize: 22,
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const inputStyle = {
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

const primaryBtn = {
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

const secondaryBtn = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const successCard = {
  background: "rgba(0,160,80,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,160,80,0.18)",
  marginBottom: 12,
};

const errorCard = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const twoColGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.9fr)",
  gap: 16,
};

const leadCard = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const previewCard = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const miniLabel = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.68,
};

const messageBox = {
  marginTop: 4,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "pre-wrap" as const,
  fontSize: 14,
  lineHeight: 1.5,
};
