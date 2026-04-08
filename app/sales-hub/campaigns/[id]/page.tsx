import type { CSSProperties } from "react";
import ClientShell from "../../../ClientShell";
import { canCreateCustomers, getAccessContext } from "../../../lib/access";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import CampaignRunner from "./runner/CampaignRunner";

type CampaignRecord = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  channel: string | null;
  goal: string | null;
  tone: string | null;
  service_focus: string | null;
  availability_note: string | null;
  scheduled_for: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by_username: string | null;
};

type LinkedLead = {
  id: string;
  lead_id: string;
  sales_leads?:
    | {
        id: string;
        company_name: string | null;
        contact_name: string | null;
        status: string | null;
        email: string | null;
        phone: string | null;
      }
    | Array<{
        id: string;
        company_name: string | null;
        contact_name: string | null;
        status: string | null;
        email: string | null;
        phone: string | null;
      }>
    | null;
};

type LinkedCustomer = {
  id: string;
  client_id: string;
  clients?:
    | {
        id: string;
        company_name: string | null;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
      }
    | Array<{
        id: string;
        company_name: string | null;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
      }>
    | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

function nice(value: string | null | undefined, fallback = "—") {
  const s = String(value ?? "").trim();
  return s || fallback;
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

export default async function CampaignDetailPage({
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
        <div style={pageWrap}>
          <div style={errorCard}>Not authenticated.</div>
        </div>
      </ClientShell>
    );
  }

  if (!canCreateCustomers(access)) {
    return (
      <ClientShell>
        <div style={pageWrap}>
          <div style={errorCard}>You do not have permission to access campaign details.</div>
        </div>
      </ClientShell>
    );
  }

  const admin = createSupabaseAdminClient();

  const [campaignRes, leadsRes, customersRes] = await Promise.all([
    admin
      .from("sales_campaigns")
      .select(
        "id, name, description, status, channel, goal, tone, service_focus, availability_note, scheduled_for, created_at, updated_at, created_by_username"
      )
      .eq("id", params.id)
      .maybeSingle(),
    admin
      .from("sales_campaign_leads")
      .select(`
        id,
        lead_id,
        sales_leads:lead_id (
          id,
          company_name,
          contact_name,
          status,
          email,
          phone
        )
      `)
      .eq("campaign_id", params.id)
      .order("created_at", { ascending: true }),
    admin
      .from("sales_campaign_customers")
      .select(`
        id,
        client_id,
        clients:client_id (
          id,
          company_name,
          contact_name,
          email,
          phone
        )
      `)
      .eq("campaign_id", params.id)
      .order("created_at", { ascending: true }),
  ]);

  if (campaignRes.error) {
    return (
      <ClientShell>
        <div style={pageWrap}>
          <div style={errorCard}>{campaignRes.error.message}</div>
        </div>
      </ClientShell>
    );
  }

  if (!campaignRes.data) {
    return (
      <ClientShell>
        <div style={pageWrap}>
          <div style={errorCard}>Campaign not found.</div>
        </div>
      </ClientShell>
    );
  }

  const campaign = campaignRes.data as CampaignRecord;
  const linkedLeads = (leadsRes.data ?? []) as LinkedLead[];
  const linkedCustomers = (customersRes.data ?? []) as LinkedCustomer[];

  return (
    <ClientShell>
      <div style={pageWrap}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>{nice(campaign.name, "Campaign")}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Review the campaign, linked targets, and generate drafts from here.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub/campaigns" style={secondaryBtn}>
              ← Campaigns
            </a>
            <a href={`/sales-hub/campaigns/${campaign.id}/runner`} style={secondaryBtn}>
              Open runner page
            </a>
          </div>
        </div>

        {searchParams?.success ? (
          <div style={successCard}>{decodeURIComponent(String(searchParams.success))}</div>
        ) : null}
        {searchParams?.error ? (
          <div style={errorCard}>{decodeURIComponent(String(searchParams.error))}</div>
        ) : null}
        {leadsRes.error ? <div style={errorCard}>{leadsRes.error.message}</div> : null}
        {customersRes.error ? <div style={errorCard}>{customersRes.error.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Status" value={nice(campaign.status, "Draft")} />
          <StatCard label="Channel" value={nice(campaign.channel, "email")} />
          <StatCard label="Goal" value={nice(campaign.goal, "introduction")} />
          <StatCard label="Tone" value={nice(campaign.tone, "professional")} />
          <StatCard label="Linked leads" value={String(linkedLeads.length)} />
          <StatCard label="Linked customers" value={String(linkedCustomers.length)} />
          <StatCard label="Service focus" value={nice(campaign.service_focus, "Not set")} />
          <StatCard label="Scheduled for" value={fmtDateTime(campaign.scheduled_for)} />
        </div>

        <div style={{ ...panelCard, marginTop: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Campaign details</div>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <div><strong>Description:</strong> {nice(campaign.description, "No description")}</div>
            <div><strong>Availability note:</strong> {nice(campaign.availability_note, "Not set")}</div>
            <div><strong>Created by:</strong> {nice(campaign.created_by_username, "Unknown")}</div>
            <div><strong>Created:</strong> {fmtDateTime(campaign.created_at)}</div>
            <div><strong>Last updated:</strong> {fmtDateTime(campaign.updated_at)}</div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <CampaignRunner campaignId={campaign.id} campaignName={nice(campaign.name, "Campaign")} />
        </div>

        <div style={columnsWrap}>
          <section style={panelCard}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>Linked leads</div>
            {linkedLeads.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No leads are linked to this campaign.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {linkedLeads.map((row) => {
                  const lead = first(row.sales_leads);
                  return (
                    <a key={row.id} href={lead?.id ? `/sales-hub/leads/${lead.id}` : "#"} style={itemCard}>
                      <div style={{ fontWeight: 900 }}>{nice(lead?.company_name, "Unknown lead")}</div>
                      <div style={subText}>{nice(lead?.contact_name, "No contact name")}</div>
                      <div style={subText}>
                        {nice(lead?.status, "No status")} • {nice(lead?.email, lead?.phone || "No contact details")}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </section>

          <section style={panelCard}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>Linked customers</div>
            {linkedCustomers.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No customers are linked to this campaign.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {linkedCustomers.map((row) => {
                  const customer = first(row.clients);
                  return (
                    <a key={row.id} href={customer?.id ? `/customers/${customer.id}` : "#"} style={itemCard}>
                      <div style={{ fontWeight: 900 }}>{nice(customer?.company_name, "Unknown customer")}</div>
                      <div style={subText}>{nice(customer?.contact_name, "No contact name")}</div>
                      <div style={subText}>{nice(customer?.email, customer?.phone || "No contact details")}</div>
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </ClientShell>
  );
}

const pageWrap: CSSProperties = {
  width: "min(1200px, 96vw)",
  margin: "0 auto",
};

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

const panelCard: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const columnsWrap: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  marginTop: 16,
};

const itemCard: CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.64)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const subText: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  opacity: 0.75,
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
