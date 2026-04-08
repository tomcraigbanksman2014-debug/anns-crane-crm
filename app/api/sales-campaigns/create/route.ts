import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { writeAuditLog } from "../../../lib/audit";
import { isMasterAdminEmail } from "../../../lib/admin";

const STATUSES = new Set(["Draft", "Active", "Completed", "Cancelled"]);
const CHANNELS = new Set(["email", "text", "linkedin"]);
const GOALS = new Set(["introduction", "follow_up", "reactivation", "availability"]);
const TONES = new Set(["professional", "friendly", "direct"]);

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean)));
}

function redirectBack(req: Request, message: string) {
  const url = new URL("/sales-hub/campaigns", req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, { status: 303 });
}

function redirectToRunner(req: Request, campaignId: string, message: string) {
  const url = new URL(`/sales-hub/campaigns/${campaignId}/runner`, req.url);
  url.searchParams.set("success", message);
  return NextResponse.redirect(url, { status: 303 });
}

async function canCreateCampaigns(user: any) {
  if (!user) return false;

  const email = String(user.email ?? "").trim().toLowerCase();
  if (isMasterAdminEmail(email)) return true;

  const admin = createSupabaseAdminClient();

  const [{ data: profileRows }, { data: settingsRows }] = await Promise.all([
    admin
      .from("staff_profiles")
      .select("role, disabled")
      .eq("user_id", user.id)
      .limit(1),
    admin
      .from("app_settings")
      .select("allow_staff_create_customers")
      .limit(1),
  ]);

  const profile = (profileRows ?? [])[0] as { role?: string | null; disabled?: boolean | null } | undefined;
  const settings = (settingsRows ?? [])[0] as { allow_staff_create_customers?: boolean | null } | undefined;
  const role = String(profile?.role ?? "").trim().toLowerCase();

  return !profile?.disabled && role === "staff" && (settings?.allow_staff_create_customers ?? true);
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    const authSupabase = createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await authSupabase.auth.getUser();

    if (userError || !user) {
      return isJson
        ? NextResponse.json({ error: "Not authenticated" }, { status: 401 })
        : redirectBack(req, "Not authenticated");
    }

    const allowed = await canCreateCampaigns(user);
    if (!allowed) {
      return isJson
        ? NextResponse.json({ error: "You do not have permission to create campaigns." }, { status: 403 })
        : redirectBack(req, "You do not have permission to create campaigns.");
    }

    let source: any = {};
    let formData: FormData | null = null;

    if (isJson) {
      source = await req.json().catch(() => ({}));
    } else {
      formData = await req.formData().catch(() => null);
      source = formData ?? {};
    }

    const getValue = (key: string) => {
      if (formData) return formData.get(key);
      return source?.[key];
    };

    const getAllValues = (key: string) => {
      if (formData) return formData.getAll(key);
      const raw = source?.[key];
      return Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    };

    const name = clean(getValue("name"));
    const description = clean(getValue("description"));
    const status = STATUSES.has(String(getValue("status") ?? "")) ? String(getValue("status")) : "Draft";
    const channel = CHANNELS.has(String(getValue("channel") ?? "")) ? String(getValue("channel")) : "email";
    const goal = GOALS.has(String(getValue("goal") ?? "")) ? String(getValue("goal")) : "introduction";
    const tone = TONES.has(String(getValue("tone") ?? "")) ? String(getValue("tone")) : "professional";
    const templateId = clean(getValue("template_id"));
    const serviceFocus = clean(getValue("service_focus"));
    const availabilityNote = clean(getValue("availability_note"));
    const scheduledFor = clean(getValue("scheduled_for"));
    const selectAllLeads = String(getValue("select_all_leads") ?? "") === "1";
    const selectAllCustomers = String(getValue("select_all_customers") ?? "") === "1";
    const leadIds = selectAllLeads
      ? uniqueStrings(String(getValue("all_lead_ids") ?? "").split(","))
      : uniqueStrings(getAllValues("lead_ids"));
    const customerIds = selectAllCustomers
      ? uniqueStrings(String(getValue("all_customer_ids") ?? "").split(","))
      : uniqueStrings(getAllValues("customer_ids"));

    if (!name) {
      return isJson
        ? NextResponse.json({ error: "Campaign name is required." }, { status: 400 })
        : redirectBack(req, "Campaign name is required.");
    }

    if (!leadIds.length && !customerIds.length) {
      return isJson
        ? NextResponse.json({ error: "Select at least one lead or customer." }, { status: 400 })
        : redirectBack(req, "Select at least one lead or customer.");
    }

    const supabase = createSupabaseAdminClient();
    const campaignId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { error: campaignError } = await supabase.from("sales_campaigns").insert([
      {
        id: campaignId,
        name,
        description,
        status,
        channel,
        goal,
        tone,
        template_id: templateId,
        service_focus: serviceFocus,
        availability_note: availabilityNote,
        scheduled_for: scheduledFor,
        created_by_user_id: user.id,
        created_by_username: fromAuthEmail(user.email ?? null) || null,
      },
    ]);

    if (campaignError) {
      return isJson
        ? NextResponse.json({ error: campaignError.message }, { status: 400 })
        : redirectBack(req, campaignError.message || "Could not create campaign.");
    }

    if (leadIds.length) {
      const { error: linkError } = await supabase
        .from("sales_campaign_leads")
        .insert(leadIds.map((leadId) => ({ campaign_id: campaignId, lead_id: leadId })));

      if (linkError) {
        await supabase.from("sales_campaigns").delete().eq("id", campaignId);
        return isJson
          ? NextResponse.json({ error: linkError.message }, { status: 400 })
          : redirectBack(req, linkError.message || "Could not link leads.");
      }

      await supabase.from("sales_lead_activity").insert(
        leadIds.map((leadId) => ({
          lead_id: leadId,
          entry_type: "campaign",
          subject: `Added to campaign: ${name}`,
          message: `Lead added to campaign "${name}" via Sales Hub Campaign Execution.`,
          created_by_user_id: user.id,
          created_by_username: fromAuthEmail(user.email ?? null) || null,
        }))
      );
    }

    if (customerIds.length) {
      const { error: customerLinkError } = await supabase
        .from("sales_campaign_customers")
        .insert(customerIds.map((clientId) => ({ campaign_id: campaignId, client_id: clientId })));

      if (customerLinkError) {
        await supabase.from("sales_campaign_leads").delete().eq("campaign_id", campaignId);
        await supabase.from("sales_campaigns").delete().eq("id", campaignId);
        return isJson
          ? NextResponse.json({ error: customerLinkError.message }, { status: 400 })
          : redirectBack(req, customerLinkError.message || "Could not link customers.");
      }

      await supabase.from("customer_correspondence").insert(
        customerIds.map((clientId) => ({
          client_id: clientId,
          entry_type: "campaign",
          subject: `Added to campaign: ${name}`,
          message: `Customer added to campaign "${name}" via Sales Hub Campaign Execution.`,
          created_by_user_id: user.id,
          created_by_username: fromAuthEmail(user.email ?? null) || null,
        }))
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: fromAuthEmail(user.email ?? null) || null,
      action: "sales_campaign_created",
      entity_type: "sales_campaign",
      entity_id: campaignId,
      meta: {
        name,
        status,
        channel,
        goal,
        tone,
        template_id: templateId,
        selected_lead_count: leadIds.length,
        selected_customer_count: customerIds.length,
        service_focus: serviceFocus,
      },
    });

    return isJson
      ? NextResponse.json({ ok: true, id: campaignId })
      : redirectToRunner(req, campaignId, "Campaign created.");
  } catch (e: any) {
    const contentType = req.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const message = e?.message || "Failed to create campaign.";
    return isJson
      ? NextResponse.json({ error: message }, { status: 500 })
      : redirectBack(req, message);
  }
}
