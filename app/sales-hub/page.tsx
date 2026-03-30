import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function countWhere(rows: any[], predicate: (row: any) => boolean) {
  return rows.filter(predicate).length;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function normaliseDateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

export default async function SalesHubPage() {
  const supabase = createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: leads, error },
    { data: templates },
    { data: campaigns },
  ] = await Promise.all([
    supabase
      .from("sales_leads")
      .select("id, company_name, status, archived, do_not_contact, next_follow_up_on, created_at, updated_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("sales_templates")
      .select("id, is_active")
      .order("created_at", { ascending: false }),
    supabase
      .from("sales_campaigns")
      .select("id, name, status, scheduled_for, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const rows = (leads ?? []).filter((row: any) => !row.archived);

  const newLeads = countWhere(rows, (row) => String(row.status ?? "") === "New");
  const toContact = countWhere(rows, (row) => String(row.status ?? "") === "To Contact");
  const followUp = countWhere(rows, (row) => String(row.status ?? "") === "Follow Up");
  const quoted = countWhere(rows, (row) => String(row.status ?? "") === "Quoted");
  const won = countWhere(rows, (row) => String(row.status ?? "") === "Won");
  const dormant = countWhere(rows, (row) => String(row.status ?? "") === "Dormant");
  const doNotContact = countWhere(rows, (row) => row.do_not_contact === true);
  const dueToday = countWhere(
    rows,
    (row) => row.next_follow_up_on && normaliseDateOnly(row.next_follow_up_on) <= today
  );

  const nextFive = [...rows]
    .filter((row: any) => row.next_follow_up_on)
    .sort((a: any, b: any) =>
      String(a.next_follow_up_on ?? "").localeCompare(String(b.next_follow_up_on ?? ""))
    )
    .slice(0, 5);

  const activeTemplates = countWhere(templates ?? [], (row) => row.is_active === true);
  const activeCampaigns = countWhere(campaigns ?? [], (row) => String(row.status ?? "") === "Active");

  const nextCampaigns = [...(campaigns ?? [])]
    .filter((row: any) => row.scheduled_for)
    .sort((a: any, b: any) =>
      String(a.scheduled_for ?? "").localeCompare(String(b.scheduled_for ?? ""))
    )
    .slice(0, 4);

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
              Manage leads, track follow-ups and build more work into the diary.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub/leads" style={secondaryBtnStyle}>
              View leads
            </a>
            <a href="/sales-hub/leads/new" style={primaryBtnStyle}>
              + Add lead
            </a>
          </div>
        </div>

        {error ? <div style={errorBox}>{error.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Live leads" value={String(rows.length)} />
          <StatCard label="New" value={String(newLeads)} />
          <StatCard label="To contact" value={String(toContact)} />
          <StatCard label="Follow up" value={String(followUp)} />
          <StatCard label="Quoted" value={String(quoted)} />
          <StatCard label="Won" value={String(won)} />
          <StatCard label="Dormant" value={String(dormant)} />
          <StatCard label="Follow-ups due" value={String(dueToday)} />
          <StatCard label="Do not contact" value={String(doNotContact)} />
          <StatCard label="Active templates" value={String(activeTemplates)} />
          <StatCard label="Active campaigns" value={String(activeCampaigns)} />
        </div>

        <div style={twoColGrid}>
          <section style={cardStyle}>
            <h2 style={sectionTitle}>Sales tools</h2>
            <div style={{ display: "grid", gap: 10 }}>
              <a href="/sales-hub/leads" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Leads / Potential Customers</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/leads?status=Follow%20Up" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Call planning / follow-ups</div>
                <div style={toolCardSub}>Use current lead statuses and dates</div>
              </a>

              <a href="/sales-hub/templates" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Template Library</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/campaigns" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Campaigns</div>
                <div style={toolCardSub}>Live now</div>
              </a>

              <a href="/sales-hub/campaigns" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Campaign Runner</div>
                <div style={toolCardSub}>Generate drafts across linked leads</div>
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

              <a href="/sales-hub/leads" style={toolCardLink}>
                <div style={{ fontWeight: 900 }}>Opportunity Tracking</div>
                <div style={toolCardSub}>Use lead statuses first, then deepen later</div>
              </a>

              <FeaturePill text="Social Media Content Studio" />
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

function FeaturePill({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.72)",
        border: "1px solid rgba(0,0,0,0.08)",
        color: "#111",
        fontWeight: 800,
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const twoColGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  marginTop: 16,
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const statCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
};

const secondaryBtnStyle: React.CSSProperties = {
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
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};

const followUpCard: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const toolCardLink: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const toolCardSub: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  opacity: 0.75,
};
