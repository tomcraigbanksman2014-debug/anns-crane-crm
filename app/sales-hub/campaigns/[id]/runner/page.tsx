import type { CSSProperties } from "react";
import ClientShell from "../../../../ClientShell";
import { canCreateCustomers, getAccessContext } from "../../../../lib/access";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import CampaignRunner from "./CampaignRunner";

export default async function CampaignRunnerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string; error?: string };
}) {
  const access = await getAccessContext();

  if (!access.user) {
    return (
      <ClientShell>
        <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
          <div style={errorCard}>Not authenticated.</div>
        </div>
      </ClientShell>
    );
  }

  if (!canCreateCustomers(access)) {
    return (
      <ClientShell>
        <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
          <div style={errorCard}>You do not have permission to access campaign runner.</div>
        </div>
      </ClientShell>
    );
  }

  const admin = createSupabaseAdminClient();

  const [
    { data: campaign, error },
    { count: leadCount },
    { count: customerCount },
    { count: supplierCount },
  ] = await Promise.all([
    admin
      .from("sales_campaigns")
      .select("id, name, status, channel, goal, tone")
      .eq("id", params.id)
      .maybeSingle(),
    admin
      .from("sales_campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", params.id),
    admin
      .from("sales_campaign_customers")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", params.id),
    admin
      .from("sales_campaign_suppliers")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", params.id),
  ]);

  if (error) {
    return (
      <ClientShell>
        <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
          <div style={errorCard}>{error.message}</div>
        </div>
      </ClientShell>
    );
  }

  if (!campaign) {
    return (
      <ClientShell>
        <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
          <div style={errorCard}>Campaign not found.</div>
        </div>
      </ClientShell>
    );
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Campaign Runner</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Generate drafts across all leads, customers and suppliers linked to this campaign.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub/campaigns" style={secondaryBtn}>
              ← Campaigns
            </a>
          </div>
        </div>

        {searchParams?.success ? (
          <div style={successCard}>{decodeURIComponent(String(searchParams.success))}</div>
        ) : null}
        {searchParams?.error ? (
          <div style={errorCard}>{decodeURIComponent(String(searchParams.error))}</div>
        ) : null}

        <div style={statsGrid}>
          <StatCard label="Campaign" value={String((campaign as any).name ?? "-")} />
          <StatCard label="Status" value={String((campaign as any).status ?? "Draft")} />
          <StatCard label="Channel" value={String((campaign as any).channel ?? "email")} />
          <StatCard label="Goal" value={String((campaign as any).goal ?? "introduction")} />
          <StatCard label="Tone" value={String((campaign as any).tone ?? "professional")} />
          <StatCard label="Linked leads" value={String(leadCount ?? 0)} />
          <StatCard label="Linked customers" value={String(customerCount ?? 0)} />
          <StatCard label="Linked suppliers" value={String(supplierCount ?? 0)} />
          <StatCard
            label="Total targets"
            value={String((leadCount ?? 0) + (customerCount ?? 0) + (supplierCount ?? 0))}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <CampaignRunner
            campaignId={params.id}
            campaignName={String((campaign as any).name ?? "Campaign")}
          />
        </div>
      </div>
    </ClientShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900, wordBreak: "break-word" }}>
        {value}
      </div>
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
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const statCard: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
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
};
