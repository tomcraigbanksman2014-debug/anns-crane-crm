import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import CampaignForm from "./new/CampaignForm";

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

export default async function SalesCampaignsPage() {
  const supabase = createSupabaseServerClient();

  const [
    { data: campaigns, error },
    { data: templates },
    { data: campaignLeads },
  ] = await Promise.all([
    supabase
      .from("sales_campaigns")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("sales_templates")
      .select("id, name, channel, goal")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("sales_campaign_leads")
      .select("campaign_id"),
  ]);

  const leadCounts = new Map<string, number>();
  for (const row of campaignLeads ?? []) {
    const key = String((row as any).campaign_id ?? "");
    leadCounts.set(key, (leadCounts.get(key) ?? 0) + 1);
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Campaigns</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Group leads under one sales push and organise the work behind it.
            </p>
          </div>

          <a href="/sales-hub" style={secondaryBtn}>
            ← Sales Hub
          </a>
        </div>

        <div style={layoutGrid}>
          <div style={{ minWidth: 0 }}>
            <CampaignForm mode="create" templates={(templates ?? []) as any[]} />
          </div>

          <section style={sideCard}>
            <h2 style={{ marginTop: 0, fontSize: 22 }}>Saved campaigns</h2>

            {error ? <div style={errorBox}>{error.message}</div> : null}

            {!campaigns || campaigns.length === 0 ? (
              <p style={{ margin: 0, opacity: 0.75 }}>No campaigns yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {campaigns.map((campaign: any) => (
                  <a key={campaign.id} href={`/sales-hub/campaigns/${campaign.id}`} style={itemCard}>
                    <div style={{ fontWeight: 900 }}>{campaign.name ?? "Campaign"}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                      {campaign.status ?? "Draft"} • {campaign.channel ?? "email"} • {campaign.goal ?? "introduction"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                      Leads {leadCounts.get(String(campaign.id)) ?? 0} • Scheduled {fmtDateTime(campaign.scheduled_for)}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </ClientShell>
  );
}

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
  gap: 16,
  alignItems: "start",
};

const sideCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const itemCard: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};
