import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";
import { writeAuditLog } from "../../../lib/audit";
import CampaignForm from "../new/CampaignForm";

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

async function addLeadToCampaign(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const campaignId = String(formData.get("campaign_id") ?? "").trim();
  const leadId = String(formData.get("lead_id") ?? "").trim();

  if (!campaignId || !leadId) {
    redirect("/sales-hub/campaigns");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existing } = await supabase
    .from("sales_campaign_leads")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("sales_campaign_leads").insert({
      campaign_id: campaignId,
      lead_id: leadId,
    });

    if (error) {
      redirect(`/sales-hub/campaigns/${campaignId}?error=${encodeURIComponent(error.message)}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_campaign_lead_added",
      entity_type: "sales_campaign_lead",
      entity_id: campaignId,
      meta: {
        campaign_id: campaignId,
        lead_id: leadId,
      },
    });
  }

  redirect(`/sales-hub/campaigns/${campaignId}?success=${encodeURIComponent("Lead added to campaign.")}`);
}

async function removeLeadFromCampaign(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const campaignId = String(formData.get("campaign_id") ?? "").trim();
  const linkId = String(formData.get("link_id") ?? "").trim();

  if (!campaignId || !linkId) {
    redirect("/sales-hub/campaigns");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("sales_campaign_leads")
    .delete()
    .eq("id", linkId);

  if (error) {
    redirect(`/sales-hub/campaigns/${campaignId}?error=${encodeURIComponent(error.message)}`);
  }

  await writeAuditLog({
    actor_user_id: user?.id ?? null,
    actor_username: fromAuthEmail(user?.email ?? null) || null,
    action: "sales_campaign_lead_removed",
    entity_type: "sales_campaign_lead",
    entity_id: campaignId,
    meta: {
      campaign_id: campaignId,
      link_id: linkId,
    },
  });

  redirect(`/sales-hub/campaigns/${campaignId}?success=${encodeURIComponent("Lead removed from campaign.")}`);
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; success?: string };
}) {
  const supabase = createSupabaseServerClient();
  const errorMessage = String(searchParams?.error ?? "");
  const successMessage = String(searchParams?.success ?? "");

  const [
    { data: campaign, error },
    { data: templates },
    { data: campaignLeadLinks },
    { data: leads },
  ] = await Promise.all([
    supabase
      .from("sales_campaigns")
      .select(`
        *,
        sales_templates:template_id (
          id,
          name
        )
      `)
      .eq("id", params.id)
      .single(),
    supabase
      .from("sales_templates")
      .select("id, name, channel, goal")
      .order("name", { ascending: true }),
    supabase
      .from("sales_campaign_leads")
      .select(`
        id,
        campaign_id,
        lead_id,
        created_at,
        sales_leads:lead_id (
          id,
          company_name,
          contact_name,
          status,
          next_follow_up_on,
          do_not_contact
        )
      `)
      .eq("campaign_id", params.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("sales_leads")
      .select("id, company_name, contact_name, archived, do_not_contact")
      .eq("archived", false)
      .order("company_name", { ascending: true }),
  ]);

  if (error || !campaign) {
    return (
      <ClientShell>
        <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
          <div style={errorCard}>{error?.message || "Campaign not found."}</div>
        </div>
      </ClientShell>
    );
  }

  const selectedLeadIds = new Set(
    (campaignLeadLinks ?? []).map((row: any) => String(row.lead_id ?? ""))
  );

  const availableLeads = (leads ?? []).filter(
    (lead: any) => !selectedLeadIds.has(String(lead.id ?? ""))
  );

  const template = Array.isArray((campaign as any).sales_templates)
    ? (campaign as any).sales_templates[0]
    : (campaign as any).sales_templates;

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>{(campaign as any).name ?? "Campaign"}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Manage campaign settings and selected leads.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub/campaigns" style={secondaryBtn}>
              ← Campaigns
            </a>
            <a href={`/sales-hub/campaigns/${params.id}/runner`} style={primaryBtn}>
              Campaign Runner
            </a>
          </div>
        </div>

        {errorMessage ? <div style={errorCard}>{decodeURIComponent(errorMessage)}</div> : null}
        {successMessage ? <div style={successCard}>{decodeURIComponent(successMessage)}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Status" value={String((campaign as any).status ?? "Draft")} />
          <StatCard label="Channel" value={String((campaign as any).channel ?? "email")} />
          <StatCard label="Goal" value={String((campaign as any).goal ?? "introduction")} />
          <StatCard label="Tone" value={String((campaign as any).tone ?? "professional")} />
          <StatCard label="Leads" value={String((campaignLeadLinks ?? []).length)} />
          <StatCard label="Scheduled" value={fmtDateTime((campaign as any).scheduled_for)} />
        </div>

        <div style={layoutGrid}>
          <div style={{ minWidth: 0 }}>
            <CampaignForm
              mode="edit"
              campaign={campaign as any}
              templates={(templates ?? []) as any[]}
            />
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <section style={sideCard}>
              <h2 style={{ marginTop: 0, fontSize: 22 }}>Campaign snapshot</h2>
              <div style={{ display: "grid", gap: 8 }}>
                <Line label="Template">{template?.name ?? "-"}</Line>
                <Line label="Service focus">{(campaign as any).service_focus ?? "-"}</Line>
                <Line label="Availability note">{(campaign as any).availability_note ?? "-"}</Line>
                <Line label="Created">{fmtDateTime((campaign as any).created_at)}</Line>
                <Line label="Updated">{fmtDateTime((campaign as any).updated_at)}</Line>
              </div>
            </section>

            <section style={sideCard}>
              <h2 style={{ marginTop: 0, fontSize: 22 }}>Add lead</h2>

              {availableLeads.length === 0 ? (
                <p style={{ margin: 0, opacity: 0.75 }}>No more available leads to add.</p>
              ) : (
                <form action={addLeadToCampaign} style={{ display: "grid", gap: 10 }}>
                  <input type="hidden" name="campaign_id" value={params.id} />
                  <select name="lead_id" defaultValue="" style={inputStyle}>
                    <option value="" disabled>
                      Select a lead
                    </option>
                    {availableLeads.map((lead: any) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.company_name}
                        {lead.contact_name ? ` • ${lead.contact_name}` : ""}
                        {lead.do_not_contact ? " • DNC" : ""}
                      </option>
                    ))}
                  </select>
                  <button type="submit" style={primaryBtn}>
                    Add lead
                  </button>
                </form>
              )}
            </section>

            <section style={sideCard}>
              <h2 style={{ marginTop: 0, fontSize: 22 }}>Campaign leads</h2>

              {!campaignLeadLinks || campaignLeadLinks.length === 0 ? (
                <p style={{ margin: 0, opacity: 0.75 }}>No leads added yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {campaignLeadLinks.map((row: any) => {
                    const lead = Array.isArray(row.sales_leads) ? row.sales_leads[0] : row.sales_leads;

                    return (
                      <div key={row.id} style={itemCard}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900 }}>{lead?.company_name ?? "Lead"}</div>
                            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                              {lead?.status ?? "New"}
                              {lead?.contact_name ? ` • ${lead.contact_name}` : ""}
                              {lead?.do_not_contact ? " • DNC" : ""}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <a href={`/sales-hub/leads/${lead?.id}`} style={miniBtn}>
                              Open lead
                            </a>
                            <a href={`/sales-hub/leads/${lead?.id}/outreach`} style={miniBtn}>
                              Outreach
                            </a>

                            <form action={removeLeadFromCampaign}>
                              <input type="hidden" name="campaign_id" value={params.id} />
                              <input type="hidden" name="link_id" value={row.id} />
                              <button type="submit" style={dangerBtn}>
                                Remove
                              </button>
                            </form>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 3, fontWeight: 600, wordBreak: "break-word" }}>{children}</div>
    </div>
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

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const statCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sideCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const itemCard: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
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

const miniBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const dangerBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(180,0,0,0.12)",
  color: "#7a1919",
  fontWeight: 800,
  border: "1px solid rgba(180,0,0,0.18)",
  cursor: "pointer",
};

const errorCard: React.CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const successCard: React.CSSProperties = {
  background: "rgba(0,160,80,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,160,80,0.18)",
  marginBottom: 12,
};
