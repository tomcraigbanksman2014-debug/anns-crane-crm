import type { CSSProperties } from "react";
import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

async function getExactCount(query: any) {
  const { count, error } = await query;
  return {
    count: count ?? 0,
    error: error ? String(error.message ?? error) : null,
  };
}

export default async function SalesHubPage() {
  const supabase = createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const oneEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    liveLeadsResult,
    newLeadsResult,
    toContactResult,
    followUpResult,
    quotedResult,
    wonResult,
    dormantResult,
    dueTodayResult,
    activeTemplatesResult,
    activeCampaignsResult,
    openTasksResult,
    overdueTasksResult,
    recentCraneJobsResult,
    recentTransportJobsResult,
    dormant90CraneResult,
    dormant90TransportResult,
    dormant180CraneResult,
    dormant180TransportResult,
    dormant365CraneResult,
    dormant365TransportResult,
    quoteFollowUpResult,
    craneHistoryResponse,
    transportHistoryResponse,
    nextFiveResponse,
    nextCampaignsResponse,
  ] = await Promise.all([
    getExactCount(
      supabase
        .from("sales_leads")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
    ),
    getExactCount(
      supabase
        .from("sales_leads")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .eq("status", "New")
    ),
    getExactCount(
      supabase
        .from("sales_leads")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .eq("status", "To Contact")
    ),
    getExactCount(
      supabase
        .from("sales_leads")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .eq("status", "Follow Up")
    ),
    getExactCount(
      supabase
        .from("sales_leads")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .eq("status", "Quoted")
    ),
    getExactCount(
      supabase
        .from("sales_leads")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .eq("status", "Won")
    ),
    getExactCount(
      supabase
        .from("sales_leads")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .eq("status", "Dormant")
    ),
    getExactCount(
      supabase
        .from("sales_leads")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .not("next_follow_up_on", "is", null)
        .lte("next_follow_up_on", today)
    ),
    getExactCount(
      supabase
        .from("sales_templates")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
    ),
    getExactCount(
      supabase
        .from("sales_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("status", "Active")
    ),
    getExactCount(
      supabase
        .from("sales_workflow_tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
    ),
    getExactCount(
      supabase
        .from("sales_workflow_tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .not("due_on", "is", null)
        .lt("due_on", today)
    ),
    getExactCount(
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .gte("start_date", thirtyDaysAgo)
        .not("client_id", "is", null)
    ),
    getExactCount(
      supabase
        .from("transport_jobs")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .gte("transport_date", thirtyDaysAgo)
        .not("client_id", "is", null)
    ),
    getExactCount(
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .lt("start_date", ninetyDaysAgo)
        .not("client_id", "is", null)
    ),
    getExactCount(
      supabase
        .from("transport_jobs")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .lt("transport_date", ninetyDaysAgo)
        .not("client_id", "is", null)
    ),
    getExactCount(
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .lt("start_date", oneEightyDaysAgo)
        .not("client_id", "is", null)
    ),
    getExactCount(
      supabase
        .from("transport_jobs")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .lt("transport_date", oneEightyDaysAgo)
        .not("client_id", "is", null)
    ),
    getExactCount(
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .lt("start_date", yearAgo)
        .not("client_id", "is", null)
    ),
    getExactCount(
      supabase
        .from("transport_jobs")
        .select("id", { count: "exact", head: true })
        .eq("archived", false)
        .lt("transport_date", yearAgo)
        .not("client_id", "is", null)
    ),
    getExactCount(
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .not("status", "in", "(Accepted,accepted,Won,won)")
    ),
    supabase
      .from("jobs")
      .select("client_id")
      .eq("archived", false)
      .not("client_id", "is", null)
      .limit(5000),
    supabase
      .from("transport_jobs")
      .select("client_id")
      .eq("archived", false)
      .not("client_id", "is", null)
      .limit(5000),
    supabase
      .from("sales_leads")
      .select("id, company_name, status, next_follow_up_on")
      .eq("archived", false)
      .not("next_follow_up_on", "is", null)
      .order("next_follow_up_on", { ascending: true })
      .limit(5),
    supabase
      .from("sales_campaigns")
      .select("id, name, status, scheduled_for")
      .not("scheduled_for", "is", null)
      .order("scheduled_for", { ascending: true })
      .limit(4),
  ]);

  const errors = [
    liveLeadsResult.error,
    newLeadsResult.error,
    toContactResult.error,
    followUpResult.error,
    quotedResult.error,
    wonResult.error,
    dormantResult.error,
    dueTodayResult.error,
    activeTemplatesResult.error,
    activeCampaignsResult.error,
    openTasksResult.error,
    overdueTasksResult.error,
    recentCraneJobsResult.error,
    recentTransportJobsResult.error,
    dormant90CraneResult.error,
    dormant90TransportResult.error,
    dormant180CraneResult.error,
    dormant180TransportResult.error,
    dormant365CraneResult.error,
    dormant365TransportResult.error,
    quoteFollowUpResult.error,
    craneHistoryResponse.error ? String(craneHistoryResponse.error.message ?? craneHistoryResponse.error) : null,
    transportHistoryResponse.error ? String(transportHistoryResponse.error.message ?? transportHistoryResponse.error) : null,
    nextFiveResponse.error ? String(nextFiveResponse.error.message ?? nextFiveResponse.error) : null,
    nextCampaignsResponse.error
      ? String(nextCampaignsResponse.error.message ?? nextCampaignsResponse.error)
      : null,
  ].filter(Boolean);

  const liveLeads = liveLeadsResult.count;
  const newLeads = newLeadsResult.count;
  const toContact = toContactResult.count;
  const followUp = followUpResult.count;
  const quoted = quotedResult.count;
  const won = wonResult.count;
  const dormant = dormantResult.count;
  const dueToday = dueTodayResult.count;
  const activeTemplates = activeTemplatesResult.count;
  const activeCampaigns = activeCampaignsResult.count;
  const openTasks = openTasksResult.count;
  const overdueTasks = overdueTasksResult.count;
  const recentCustomerJobs = recentCraneJobsResult.count + recentTransportJobsResult.count;
  const dormant90Jobs = dormant90CraneResult.count + dormant90TransportResult.count;
  const dormant180Jobs = dormant180CraneResult.count + dormant180TransportResult.count;
  const dormant365Jobs = dormant365CraneResult.count + dormant365TransportResult.count;
  const quoteFollowUps = quoteFollowUpResult.count;

  const craneCustomerIds = new Set(
    (craneHistoryResponse.data ?? [])
      .map((row: any) => String(row.client_id ?? ""))
      .filter(Boolean)
  );

  const transportCustomerIds = new Set(
    (transportHistoryResponse.data ?? [])
      .map((row: any) => String(row.client_id ?? ""))
      .filter(Boolean)
  );

  const transportOnlyPromptCount = Array.from(transportCustomerIds).filter(
    (clientId) => !craneCustomerIds.has(clientId)
  ).length;

  const craneOnlyPromptCount = Array.from(craneCustomerIds).filter(
    (clientId) => !transportCustomerIds.has(clientId)
  ).length;

  const smartPrompts = [
    {
      label: "Equipment history availability",
      count: craneCustomerIds.size + transportCustomerIds.size,
      href: "/sales-hub/equipment-history-campaign",
      note: "Target customers by what they have actually used before: low loader, HIAB, spider crane, HK40, Grove 80t and more.",
    },
    {
      label: "Recent customer thank-you",
      count: recentCustomerJobs,
      href: "/sales-hub/campaigns?goal=recent_customer_thank_you&customer_group=recent_30",
      note: "Actual crane/transport jobs in the last 30 days.",
    },
    {
      label: "Dormant 90 / 180 / 365",
      count: dormant90Jobs,
      href: "/sales-hub/campaigns?goal=dormant_recovery&customer_group=dormant_90",
      note: `Dormant job history: 90d ${dormant90Jobs}, 180d ${dormant180Jobs}, 365d ${dormant365Jobs}.`,
    },
    {
      label: "Quote follow-up",
      count: quoteFollowUps,
      href: "/sales-hub/campaigns?goal=quote_follow_up&customer_group=quotes_not_accepted",
      note: "Quotes not yet accepted or won.",
    },
    {
      label: "Transport-only cross-sell",
      count: transportOnlyPromptCount,
      href: "/sales-hub/campaigns?goal=cross_sell&customer_group=transport_cross_sell&service_focus=mobile%20crane%20hire",
      note: "Prompt crane hire to transport customers.",
    },
    {
      label: "Crane-only cross-sell",
      count: craneOnlyPromptCount,
      href: "/sales-hub/campaigns?goal=cross_sell&customer_group=crane_cross_sell&service_focus=HIAB%20low%20loader%20transport",
      note: "Prompt HIAB, low loader and transport support.",
    },
    {
      label: "General availability notice",
      count: 0,
      href: "/sales-hub/campaigns?goal=availability",
      note: "Start a general availability-led campaign when kit or labour opens up.",
    },
  ];

  const nextFive = (nextFiveResponse.data ?? []).sort((a: any, b: any) =>
    String(a.next_follow_up_on ?? "").localeCompare(String(b.next_follow_up_on ?? ""))
  );

  const nextCampaigns = (nextCampaignsResponse.data ?? []).sort((a: any, b: any) =>
    String(a.scheduled_for ?? "").localeCompare(String(b.scheduled_for ?? ""))
  );

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Sales Hub</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Manage leads, campaigns, tasks and follow-ups to win more work.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub/equipment-history-campaign" style={primaryBtnStyle}>
              Equipment history campaign
            </a>
            <a href="/sales-hub/leads" style={secondaryBtnStyle}>
              View leads
            </a>
            <a href="/sales-hub/workflows" style={secondaryBtnStyle}>
              Workflow tasks
            </a>
            <a href="/sales-hub/leads/new" style={primaryBtnStyle}>
              + Add lead
            </a>
          </div>
        </div>

        {errors.length > 0 ? (
          <div style={errorBox}>{errors.join(" | ")}</div>
        ) : null}

        <div style={statsGrid}>
          <StatCard label="Live leads" value={String(liveLeads)} />
          <StatCard label="New" value={String(newLeads)} />
          <StatCard label="To contact" value={String(toContact)} />
          <StatCard label="Follow up" value={String(followUp)} />
          <StatCard label="Quoted" value={String(quoted)} />
          <StatCard label="Won" value={String(won)} />
          <StatCard label="Dormant" value={String(dormant)} />
          <StatCard label="Follow-ups due" value={String(dueToday)} />
          <StatCard label="Open tasks" value={String(openTasks)} />
          <StatCard label="Overdue tasks" value={String(overdueTasks)} />
          <StatCard label="Active templates" value={String(activeTemplates)} />
          <StatCard label="Active campaigns" value={String(activeCampaigns)} />
        </div>

        <section style={{ ...cardStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Smart campaign prompts</h2>
          <p style={{ marginTop: -8, opacity: 0.75 }}>
            Suggestions are based on actual crane/transport job history and quote status, not broad activity.
          </p>

          <div style={promptGrid}>
            {smartPrompts.map((prompt) => (
              <a key={prompt.label} href={prompt.href} style={promptCard}>
                <div style={{ fontWeight: 900 }}>{prompt.label}</div>
                <div style={{ marginTop: 6, fontSize: 24, fontWeight: 1000 }}>
                  {prompt.count}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
                  {prompt.note}
                </div>
              </a>
            ))}
          </div>
        </section>

        <div style={twoColGrid}>
          <section style={cardStyle}>
            <h2 style={sectionTitle}>Sales tools</h2>

            <div style={{ display: "grid", gap: 10 }}>
              <a href="/sales-hub/equipment-history-campaign" style={toolCardHighlight}>
                <div style={{ fontWeight: 1000 }}>Equipment History Campaigns</div>
                <div style={toolCardSub}>
                  Target customers by past equipment/service use
                </div>
              </a>

              <a href="/sales-hub/automation" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Automation Centre</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/workflows" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Workflow Tasks</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/call-planning" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Call Planning Dashboard</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/leads" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Leads / Potential Customers</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/templates" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Template Library</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/campaigns" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Campaigns</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/dormant-customers" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Dormant Customer Recovery</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/availability-driven-selling" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Availability-Driven Selling</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/cross-sell-prompts" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Cross-Sell Prompts</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/social-media-content" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Social Media Content Studio</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/opportunities" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Opportunity Tracking</div>
                <div style={toolCardSub}>Live now</div>
              </a>
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>Next follow-ups</h2>

            {nextFive.length === 0 ? (
              <p style={{ margin: 0, opacity: 0.75 }}>No follow-up dates set yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {nextFive.map((lead: any) => (
                  <a key={lead.id} href={`/sales-hub/leads/${lead.id}`} style={followUpCard}>
                    <div style={{ fontWeight: 900 }}>{lead.company_name ?? "Lead"}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                      {lead.status ?? "New"} • Next follow-up {fmtDate(lead.next_follow_up_on)}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        <section style={{ ...cardStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Upcoming campaigns</h2>

          {nextCampaigns.length === 0 ? (
            <p style={{ margin: 0, opacity: 0.75 }}>No campaign dates set yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {nextCampaigns.map((campaign: any) => (
                <a key={campaign.id} href={`/sales-hub/campaigns/${campaign.id}`} style={followUpCard}>
                  <div style={{ fontWeight: 900 }}>{campaign.name ?? "Campaign"}</div>
                  <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                    {campaign.status ?? "Draft"} • Scheduled {fmtDate(campaign.scheduled_for)}
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </ClientShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCardStyle}>
      <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

const statsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const promptGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
  marginTop: 12,
};

const promptCard: CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "14px 16px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.76)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const twoColGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  marginTop: 16,
};

const cardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const statCardStyle: CSSProperties = {
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

const primaryBtnStyle: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
};

const secondaryBtnStyle: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};

const followUpCard: CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const toolCardLink: CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const toolCardHighlight: CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(219,234,254,0.9)",
  border: "1px solid rgba(37,99,235,0.22)",
};

const toolCardSub: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  opacity: 0.75,
};
