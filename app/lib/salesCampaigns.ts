import { createSupabaseAdminClient } from "./supabase/admin";

export type CreateSalesCampaignInput = {
  name: string;
  description?: string | null;
  template_id?: string | null;
  channel: string;
  goal: string;
  tone: string;
  service_focus?: string | null;
  availability_note?: string | null;
  created_by_user_id?: string | null;
  created_by_username?: string | null;
  lead_ids?: string[];
  customer_ids?: string[];
};

export async function createSalesCampaign(input: CreateSalesCampaignInput) {
  const supabase = createSupabaseAdminClient();
  const campaignId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const campaignRow = {
    id: campaignId,
    name: String(input.name ?? "").trim(),
    description: input.description ?? null,
    status: "Draft",
    channel: String(input.channel ?? "email").trim() || "email",
    goal: String(input.goal ?? "introduction").trim() || "introduction",
    tone: String(input.tone ?? "professional").trim() || "professional",
    template_id: input.template_id ?? null,
    service_focus: input.service_focus ?? null,
    availability_note: input.availability_note ?? null,
    created_by_user_id: input.created_by_user_id ?? null,
    created_by_username: input.created_by_username ?? null,
  };

  const { error: campaignError } = await supabase.from("sales_campaigns").insert([campaignRow]);

  if (campaignError) {
    throw new Error(campaignError.message || "Could not create campaign.");
  }

  const leadIds = Array.from(new Set((input.lead_ids ?? []).map((v) => String(v).trim()).filter(Boolean)));
  const customerIds = Array.from(new Set((input.customer_ids ?? []).map((v) => String(v).trim()).filter(Boolean)));

  try {
    if (leadIds.length) {
      const { error: linkError } = await supabase
        .from("sales_campaign_leads")
        .insert(leadIds.map((leadId) => ({ campaign_id: campaignId, lead_id: leadId })));

      if (linkError) {
        throw new Error(linkError.message || "Could not attach campaign leads.");
      }

      await supabase.from("sales_lead_activity").insert(
        leadIds.map((leadId) => ({
          lead_id: leadId,
          entry_type: "campaign",
          subject: `Added to campaign: ${campaignRow.name}`,
          message: `Lead added to campaign "${campaignRow.name}" via Sales Hub Campaign Execution.`,
          created_by_user_id: input.created_by_user_id ?? null,
          created_by_username: input.created_by_username ?? null,
        }))
      );
    }

    if (customerIds.length) {
      const { error: customerLinkError } = await supabase
        .from("sales_campaign_customers")
        .insert(customerIds.map((clientId) => ({ campaign_id: campaignId, client_id: clientId })));

      if (customerLinkError) {
        throw new Error(customerLinkError.message || "Could not attach campaign customers.");
      }

      await supabase.from("customer_correspondence").insert(
        customerIds.map((clientId) => ({
          client_id: clientId,
          entry_type: "campaign",
          subject: `Added to campaign: ${campaignRow.name}`,
          message: `Customer added to campaign "${campaignRow.name}" via Sales Hub Campaign Execution.`,
          created_by_user_id: input.created_by_user_id ?? null,
          created_by_username: input.created_by_username ?? null,
        }))
      );
    }
  } catch (error) {
    await supabase.from("sales_campaign_leads").delete().eq("campaign_id", campaignId);
    await supabase.from("sales_campaign_customers").delete().eq("campaign_id", campaignId);
    await supabase.from("sales_campaigns").delete().eq("id", campaignId);
    throw error;
  }

  return { id: campaignId };
}
